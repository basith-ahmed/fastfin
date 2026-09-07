# FastFin

FastFin is an evidence-grounded PDF fact intelligence system. Phase 0 provides the local development foundation: a PostgreSQL/pgvector database, Redis, an Express API, and a Next.js frontend.

## Prerequisites

- Node.js 20.9 or newer
- pnpm 10
- Docker with Docker Compose

## Configuration

From the repository root:

```bash
cp .env.example .env
```

The included defaults are intended for local development. API keys may remain empty in Phase 0.

## Start infrastructure

```bash
docker compose up -d
docker compose ps
```

PostgreSQL is available on port `5432` and Redis on port `6379`.

## Run the backend

```bash
cd backend
pnpm install
pnpm dev
```

The API listens on `http://localhost:4000`. Its initial health endpoint is `GET /health`.

## Run the frontend

In another terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

The application is available at `http://localhost:3000`.

## Verify Phase 0

Run the following in both `backend/` and `frontend/`:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Phase 0 intentionally contains no database schema, document ingestion, worker, PDF processing, or AI integration. Those belong to later phases.
