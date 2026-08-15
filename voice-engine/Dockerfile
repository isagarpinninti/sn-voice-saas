FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /uvx /usr/local/bin/

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev || uv sync --no-install-project --no-dev

COPY . .
RUN uv sync --no-dev

EXPOSE 7860

# voice_engine.server hosts its own ASGI app internally via Pipecat's runner
# (see server.py) — no separate uvicorn invocation needed.
CMD ["uv", "run", "python", "-m", "voice_engine.server", "--host", "0.0.0.0", "--port", "7860"]
