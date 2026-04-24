const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const selectedMoviesContainer = document.getElementById('selectedMovies');
const recommendBtn = document.getElementById('recommendBtn');
const recommendationsContainer = document.getElementById('recommendations');
const searchStatus = document.getElementById('searchStatus');

const summaryInput = document.getElementById('summaryInput');
const summaryBtn = document.getElementById('summaryBtn');
const summaryResult = document.getElementById('summaryResult');
const movieModal = document.getElementById('movieModal');
const movieModalContent = document.getElementById('movieModalContent');
const closeMovieModalBtn = document.getElementById('closeMovieModal');
const navbar = document.getElementById('navbar');
const heroStartBtn = document.getElementById('heroStartBtn');
const heroSummaryBtn = document.getElementById('heroSummaryBtn');
let selectedMovies = [];
let searchCache = [];
let lastRecommendations = [];
let scrollObserver = null;

const HISTORY_KEY = 'movie_recommender_history_v1';



function truncate(text, max = 220) {
  if (!text) return 'Sem descrição disponível.';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(dateString) {
  if (!dateString) return 'Não informado';
  const [year, month, day] = dateString.split('-');
  if (!year) return 'Não informado';
  if (!month || !day) return year;
  return `${day}/${month}/${year}`;
}

function renderMessage(container, text) {
  if (!container) return;
  container.innerHTML = `<p class="message">${text}</p>`;
}

function setSearchStatus(text = '') {
  if (!searchStatus) return;

  if (!text) {
    searchStatus.innerHTML = `
      <p class="status-message">
        Não selecione para pesquisar em todos os streamings
      </p>
    `;
    return;
  }

  searchStatus.innerHTML = `<p class="status-message">${text}</p>`;
}

function getSelectedStreamingProviders() {
  const checked = document.querySelectorAll('.streamingFilter:checked');
  return Array.from(checked).map((input) => Number(input.value));
}

function getLocalData(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (error) {
    return [];
  }
}

function saveLocalData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function saveRecommendationHistory(selected, recommended, providers) {
  const history = getLocalData(HISTORY_KEY);

  const record = {
    id: Date.now(),
    created_at: new Date().toISOString(),
    selected_movies: selected.map((movie) => ({
      id: movie.id,
      title: movie.title
    })),
    recommended_movies: recommended.map((movie) => ({
      id: movie.id,
      title: movie.title
    })),
    streaming_provider_ids: providers
  };

  history.unshift(record);
  saveLocalData(HISTORY_KEY, history);
}



function setupNavbarOnScroll() {
  if (!navbar) return;

  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY <= 10) {
      navbar.classList.remove('hidden');
      lastScrollY = currentScrollY;
      return;
    }

    if (currentScrollY > lastScrollY && currentScrollY > 80) {
      navbar.classList.add('hidden');
    } else {
      navbar.classList.remove('hidden');
    }

    lastScrollY = currentScrollY;
  });
}
function setupSectionReveal() {
  const sections = document.querySelectorAll('.reveal-section');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.15
  });

  sections.forEach((section) => {
    observer.observe(section);
  });
}

function resetSearchArea() {
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }

  searchCache = [];
  renderMessage(searchResults, 'Pesquise outro filme para adicionar.');
  setSearchStatus('');
}

function applyScrollAnimations() {
  const elements = document.querySelectorAll(
    '.movie-card, .selected-movie, .recommendation-card, .search-result-card'
  );

  if (!scrollObserver) {
    scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
        }
      });
    }, {
      threshold: 0.12
    });
  }

  elements.forEach((el) => {
    scrollObserver.observe(el);
  });
}



function movieCard(movie, actionType = 'add') {
  const button = actionType === 'add'
    ? `<button class="small-btn" onclick="addMovie(${movie.id})">Adicionar</button>`
    : `<button class="remove-btn" onclick="removeMovie(${movie.id})">Remover</button>`;

  const extraClass =
    actionType === 'add'
      ? 'search-result-card'
      : actionType === 'remove'
        ? 'selected-movie'
        : 'recommendation-card';

  return `
    <div class="movie-card ${extraClass}">
      ${
        movie.poster_url
          ? `<img src="${movie.poster_url}" alt="${escapeHtml(movie.title)}">`
          : `<div style="height:280px;display:flex;align-items:center;justify-content:center;background:#111;color:#bbb;">Sem imagem</div>`
      }
      <div class="movie-content">
        <h3>${escapeHtml(movie.title)}</h3>
        <p class="meta-line">Lançamento: ${formatDate(movie.release_date)}</p>
        <p class="meta-line">Nota: ${movie.vote_average || 0}</p>
        <p class="movie-overview">${escapeHtml(truncate(movie.overview, 240))}</p>
        ${button}
      </div>
    </div>
  `;
}

function recommendationCard(movie) {
  return `
    <div class="movie-card recommendation-card" onclick="openMovieModal(${movie.id})">
      ${
        movie.poster_url
          ? `<img src="${movie.poster_url}" alt="${escapeHtml(movie.title)}">`
          : `<div style="height:280px;display:flex;align-items:center;justify-content:center;background:#111;color:#bbb;">Sem imagem</div>`
      }
      <div class="movie-content">
        <h3>${escapeHtml(movie.title)}</h3>
        <p class="meta-line">Lançamento: ${formatDate(movie.release_date)}</p>
        <p class="meta-line">Nota: ${movie.vote_average || 0}</p>
        <p class="movie-overview">${escapeHtml(truncate(movie.overview, 260))}</p>
      </div>
    </div>
  `;
}
function openMovieModal(movieId) {
  const movie = lastRecommendations.find((item) => item.id === movieId);
  if (!movie || !movieModal || !movieModalContent) return;

  const posterHtml = movie.poster_url
    ? `<img src="${movie.poster_url}" alt="${escapeHtml(movie.title)}">`
    : `<div style="height:320px;display:flex;align-items:center;justify-content:center;background:#111;color:#bbb;border-radius:18px;">Sem imagem</div>`;

  movieModalContent.innerHTML = `
    <div class="movie-modal-poster">
      ${posterHtml}
    </div>

    <div class="movie-modal-info">
      <h2>${escapeHtml(movie.title)}</h2>

      <div class="movie-modal-meta">
        <span>Lançamento: ${formatDate(movie.release_date)}</span>
        <span>Nota: ${movie.vote_average || 0}</span>
      </div>

      <div class="movie-modal-synopsis-title">Sinopse</div>
      <p>${escapeHtml(movie.overview || 'Sem descrição disponível.')}</p>
    </div>
  `;

  movieModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeMovieModal() {
  if (!movieModal) return;
  movieModal.classList.remove('show');
  document.body.style.overflow = '';
}


async function searchMovies() {
  const query = searchInput?.value.trim() || '';

  if (query.length < 2) {
    renderMessage(searchResults, 'Digite pelo menos 2 letras para buscar.');
    setSearchStatus('');
    return;
  }

  renderMessage(searchResults, 'Buscando filmes...');
  setSearchStatus('Pesquisando no catálogo...');

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      searchCache = [];
      renderMessage(searchResults, 'Nenhum filme encontrado.');
      setSearchStatus('Tente pesquisar por outro nome.');
      return;
    }

    searchCache = data.results;
    searchResults.innerHTML = data.results.map((movie) => movieCard(movie, 'add')).join('');
    setSearchStatus(`${data.results.length} filme(s) encontrado(s).`);
    applyScrollAnimations();
  } catch (error) {
    renderMessage(searchResults, 'Erro ao buscar filmes.');
    setSearchStatus('Não foi possível concluir a busca agora.');
  }
}



function addMovie(id) {
  const movie = searchCache.find((item) => item.id === id);
  if (!movie) return;

  const alreadyAdded = selectedMovies.some((item) => item.id === id);
  if (alreadyAdded) {
    setSearchStatus('Esse filme já foi adicionado.');
    resetSearchArea();
    return;
  }

  selectedMovies.push(movie);
  renderSelectedMovies();
  resetSearchArea();
  applyScrollAnimations();

  requestAnimationFrame(() => {
    const cards = selectedMoviesContainer.querySelectorAll('.movie-card');
    const lastCard = cards[cards.length - 1];

    if (lastCard) {
      lastCard.classList.add('added-animation');

      selectedMoviesContainer.scrollTo({
        left: selectedMoviesContainer.scrollWidth,
        behavior: 'smooth'
      });

      setTimeout(() => {
        lastCard.classList.remove('added-animation');
      }, 500);
    }
  });
}

function removeMovie(id) {
  selectedMovies = selectedMovies.filter((movie) => movie.id !== id);
  renderSelectedMovies();
  applyScrollAnimations();
}

function renderSelectedMovies() {
  if (!selectedMoviesContainer) return;

  if (selectedMovies.length === 0) {
    renderMessage(selectedMoviesContainer, 'Você ainda não escolheu nenhum filme.');
    return;
  }

  selectedMoviesContainer.innerHTML = selectedMovies
    .map((movie) => movieCard(movie, 'remove'))
    .join('');

  applyScrollAnimations();
}



async function recommendMovies() {
  if (selectedMovies.length === 0) {
    renderMessage(recommendationsContainer, 'Adicione pelo menos 1 filme antes de pedir recomendações.');
    return;
  }

  const selectedProviders = getSelectedStreamingProviders();

  renderMessage(recommendationsContainer, 'Calculando recomendações...');
  setSearchStatus(
    selectedProviders.length > 0
      ? `Filtrando pelas plataformas escolhidas (${selectedProviders.length}).`
      : 'Sem filtro de streaming. Serão consideradas todas as plataformas.'
  );

  try {
    const response = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movie_ids: selectedMovies.map((movie) => movie.id),
        streaming_provider_ids: selectedProviders
      })
    });

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      renderMessage(
        recommendationsContainer,
        'Não encontrei recomendações para esses filmes com os filtros escolhidos.'
      );
      return;
    }

    lastRecommendations = data.results;

    recommendationsContainer.innerHTML = data.results
      .map((movie) => recommendationCard(movie))
      .join('');

    saveRecommendationHistory(selectedMovies, data.results, selectedProviders);
    applyScrollAnimations();
  } catch (error) {
    renderMessage(recommendationsContainer, 'Erro ao gerar recomendações.');
  }
}



async function summarizeMovie() {
  const query = summaryInput?.value.trim() || '';

  if (query.length < 2) {
    if (summaryResult) {
      summaryResult.innerHTML = 'Digite pelo menos 2 letras para resumir um filme.';
    }
    return;
  }

  if (summaryResult) {
    summaryResult.innerHTML = 'Buscando informações do filme...';
  }

  try {
    const response = await fetch(`/api/summarize?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.found) {
      if (summaryResult) {
        summaryResult.innerHTML = 'Não encontrei esse filme para resumir.';
      }
      return;
    }

    const posterHtml = data.movie.poster_url
      ? `<img src="${data.movie.poster_url}" alt="${escapeHtml(data.movie.title)}" class="summary-poster">`
      : `<div class="summary-poster summary-no-poster">Sem imagem</div>`;

    if (summaryResult) {
      summaryResult.innerHTML = `
        <div class="summary-movie-card">
          <div class="summary-movie-poster">
            ${posterHtml}
          </div>

          <div class="summary-movie-info">
            <h3>${escapeHtml(data.movie.title)}</h3>
            <p class="meta-line">Lançamento: ${formatDate(data.movie.release_date)}</p>
            <p class="meta-line">Nota: ${data.movie.vote_average || 0}</p>
            <p>${escapeHtml(data.summary)}</p>
          </div>
        </div>
      `;
    }
  } catch (error) {
    if (summaryResult) {
      summaryResult.innerHTML = 'Erro ao gerar resumo do filme.';
    }
  }
}



if (searchBtn) {
  searchBtn.addEventListener('click', searchMovies);
}

if (recommendBtn) {
  recommendBtn.addEventListener('click', recommendMovies);
}

if (summaryBtn) {
  summaryBtn.addEventListener('click', summarizeMovie);
}

if (searchInput) {
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      searchMovies();
    }
  });
}

if (summaryInput) {
  summaryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      summarizeMovie();
    }
  });
}
if (heroStartBtn) {
  heroStartBtn.addEventListener('click', () => {
    const firstSection = document.querySelector('.card.reveal-section');
    if (firstSection) {
      firstSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

if (heroSummaryBtn) {
  heroSummaryBtn.addEventListener('click', () => {
    const summarySection = summaryInput?.closest('.card');
    if (summarySection) {
      summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  renderSelectedMovies();
  renderMessage(searchResults, 'Pesquise um filme para começar.');
  renderMessage(recommendationsContainer, 'Suas recomendações vão aparecer aqui.');

  if (summaryResult) {
    summaryResult.innerHTML = 'Digite o nome de um filme e clique em "Resumir filme".';
  }

  setupNavbarOnScroll();
  applyScrollAnimations();
  setupSectionReveal();
});
if (closeMovieModalBtn) {
  closeMovieModalBtn.addEventListener('click', closeMovieModal);
}

if (movieModal) {
  movieModal.addEventListener('click', (event) => {
    if (event.target === movieModal) {
      closeMovieModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMovieModal();
  }
});


window.addMovie = addMovie;
window.removeMovie = removeMovie;
window.openMovieModal = openMovieModal;
