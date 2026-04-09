# Recomendador de Filmes

Projeto simples em **Python + FastAPI**.

## O que ele faz
- pesquisa filmes na API do TMDB
- deixa o usuário escolher quantos filmes quiser
- cruza recomendações dos filmes escolhidos
- mostra 3 sugestões finais

## Como rodar

### 1. Entre na pasta
```bash
cd movie_recommender_mvp
```

### 2. Crie e ative um ambiente virtual
#### Windows
```bash
python -m venv venv
venv\Scripts\activate
```

#### Linux/macOS
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Instale as dependências
```bash
pip install -r requirements.txt
```

### 4. Crie sua chave do TMDB
Crie uma conta no TMDB e gere uma API Key.

### 5. Defina a variável de ambiente
#### Windows CMD
```bash
set TMDB_API_KEY=sua_chave_aqui
```

#### PowerShell
```powershell
$env:TMDB_API_KEY="sua_chave_aqui"
```

#### Linux/macOS
```bash
export TMDB_API_KEY=sua_chave_aqui
```

### 6. Rode o projeto
```bash
uvicorn main:app --reload
```

### 7. Abra no navegador
```text
http://127.0.0.1:8000
```

## Próximas melhorias
- login de usuários
- salvar histórico de recomendações
- filtro por gênero
- trailer do YouTube
- recomendação com IA/embeddings
