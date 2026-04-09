import os
from collections import Counter
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import asyncio

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
DEFAULT_REGION = "BR"

app = FastAPI(title="Movie Recommender")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


async def tmdb_get(
    path: str,
    params: Optional[Dict[str, Any]] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Any]:
    if not TMDB_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TMDB_API_KEY não configurada. Crie uma chave no TMDB e defina a variável de ambiente.",
        )

    final_params = {
        "api_key": TMDB_API_KEY,
        "language": "pt-BR",
    }

    if params:
        final_params.update(params)

    if client is not None:
        response = await client.get(f"{TMDB_BASE_URL}{path}", params=final_params)
    else:
        async with httpx.AsyncClient(timeout=20.0) as fallback_client:
            response = await fallback_client.get(f"{TMDB_BASE_URL}{path}", params=final_params)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao consultar a API de filmes: {response.text}",
        )

    return response.json()


def normalize_movie(movie: Dict[str, Any]) -> Dict[str, Any]:
    poster_path = movie.get("poster_path")
    return {
        "id": movie.get("id"),
        "title": movie.get("title") or movie.get("name"),
        "overview": movie.get("overview") or "Sem descrição disponível.",
        "release_date": movie.get("release_date") or "",
        "vote_average": movie.get("vote_average") or 0,
        "poster_url": f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "",
        "genre_ids": movie.get("genre_ids", []),
        "popularity": movie.get("popularity") or 0,
    }


def extract_provider_ids(watch_data: Dict[str, Any], region: str = DEFAULT_REGION) -> Set[int]:
    
    region_data = watch_data.get("results", {}).get(region, {})
    provider_ids: Set[int] = set()

    for item in region_data.get("flatrate", []):
        provider_id = item.get("provider_id")
        if provider_id:
            provider_ids.add(provider_id)

    return provider_ids


async def movie_has_selected_provider(
    movie_id: int,
    selected_provider_ids: Set[int],
    region: str = DEFAULT_REGION,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    if not selected_provider_ids:
        return True

    watch_data = await tmdb_get(
        f"/movie/{movie_id}/watch/providers",
        client=client,
    )
    movie_provider_ids = extract_provider_ids(watch_data, region=region)

    return len(movie_provider_ids.intersection(selected_provider_ids)) > 0


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})


@app.get("/api/health")
async def health_check():
    return JSONResponse(
        {
            "ok": True,
            "tmdb_api_key_configured": bool(TMDB_API_KEY),
            "region": DEFAULT_REGION,
        }
    )


@app.get("/api/search")
async def search_movies(q: str = Query(..., min_length=2)):
    data = await tmdb_get(
        "/search/movie",
        {
            "query": q,
            "include_adult": "false",
            "page": 1,
        },
    )

    results = [normalize_movie(movie) for movie in data.get("results", [])[:10]]
    return JSONResponse({"results": results})


@app.post("/api/recommend")
async def recommend_movies(payload: Dict[str, Any]):
    selected_ids: List[int] = payload.get("movie_ids", [])
    streaming_provider_ids: List[int] = payload.get("streaming_provider_ids", [])

    if not selected_ids:
        raise HTTPException(status_code=400, detail="Selecione pelo menos 1 filme.")

    selected_provider_set = {int(provider_id) for provider_id in streaming_provider_ids if provider_id}

    genre_counter: Counter = Counter()
    recommendations_map: Dict[int, Dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1) Buscar detalhes dos filmes escolhidos em paralelo
        detail_tasks = [
            tmdb_get(f"/movie/{movie_id}", client=client)
            for movie_id in selected_ids
        ]
        detail_results = await asyncio.gather(*detail_tasks)

        for details in detail_results:
            for genre in details.get("genres", []):
                genre_id = genre.get("id")
                if genre_id:
                    genre_counter[genre_id] += 1

        # 2) Buscar recomendações dos filmes escolhidos em paralelo
        rec_tasks = [
            tmdb_get(f"/movie/{movie_id}/recommendations", {"page": 1}, client=client)
            for movie_id in selected_ids
        ]
        rec_results = await asyncio.gather(*rec_tasks)

        # 3) Montar candidatos únicos primeiro
        for recs in rec_results:
            for movie in recs.get("results", []):
                normalized = normalize_movie(movie)
                rec_id = normalized["id"]

                if not rec_id or rec_id in selected_ids:
                    continue

                base_score = recommendations_map.get(rec_id, {}).get("score", 0)

                genre_bonus = sum(
                    genre_counter[g]
                    for g in normalized.get("genre_ids", [])
                    if g in genre_counter
                )

                score = (
                    base_score
                    + 10
                    + genre_bonus
                    + (normalized["vote_average"] / 2)
                    + (normalized["popularity"] / 200)
                )

                normalized["score"] = round(score, 2)
                recommendations_map[rec_id] = normalized

        # 4) Ordenar antes de filtrar por streaming
        ordered_candidates = sorted(
            recommendations_map.values(),
            key=lambda item: (item["score"], item["vote_average"], item["popularity"]),
            reverse=True,
        )

        # 5) Se houver filtro de streaming, testar só os melhores candidatos
        if selected_provider_set:
            candidate_pool = ordered_candidates[:25]

            provider_tasks = [
                movie_has_selected_provider(
                    movie["id"],
                    selected_provider_set,
                    region=DEFAULT_REGION,
                    client=client,
                )
                for movie in candidate_pool
            ]
            provider_results = await asyncio.gather(*provider_tasks)

            ordered = [
                movie
                for movie, has_provider in zip(candidate_pool, provider_results)
                if has_provider
            ]
        else:
            ordered = ordered_candidates

    return JSONResponse(
        {
            "results": ordered[:3],
            "filters": {
                "region": DEFAULT_REGION,
                "streaming_provider_ids": list(selected_provider_set),
            },
        }
    )

@app.get("/api/summarize")
async def summarize_movie(q: str = Query(..., min_length=2)):
    
    search_data = await tmdb_get(
        "/search/movie",
        {
            "query": q,
            "include_adult": "false",
            "page": 1,
        },
    )

    results = search_data.get("results", [])
    if not results:
        return JSONResponse({"found": False, "summary": "Não encontrei esse filme."})

    movie = results[0]
    normalized = normalize_movie(movie)

    title = normalized["title"] or "Filme"
    release_date = normalized["release_date"] or "data não informada"
    vote_average = normalized["vote_average"] or 0
    overview = normalized["overview"] or "Sem descrição disponível."

    summary = (
        f"{title} é um filme lançado em {release_date}. "
        f"A nota média atual é {vote_average}. "
        f"Resumo: {overview} "
        
    )

    return JSONResponse(
        {
            "found": True,
            "movie": normalized,
            "summary": summary,
        }
    )