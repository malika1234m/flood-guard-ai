# ── Stage 1: build the React frontend ────────────────────────────────────
FROM node:22-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python API + static frontend ────────────────────────────────
FROM python:3.11-slim

# libgomp1 is required at runtime by lightgbm/xgboost (OpenMP).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-app.txt .
RUN pip install --no-cache-dir -r requirements-app.txt

COPY src/ src/
COPY app/ app/
COPY models/ models/
COPY --from=frontend-build /app/frontend/dist/ frontend/dist/

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
