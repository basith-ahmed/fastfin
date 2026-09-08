#!/bin/sh

set -eu

BACKEND_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$BACKEND_ROOT/.." && pwd)

cd "$REPO_ROOT"

echo "Resetting local PostgreSQL and Redis data..."
docker compose down --volumes --remove-orphans

echo "Clearing generated PDF uploads and temporary files..."
find "$BACKEND_ROOT/storage/pdfs" -type f ! -name .gitkeep -delete
find "$BACKEND_ROOT/storage/temp" -type f ! -name .gitkeep -delete

echo "Starting PostgreSQL and Redis..."
docker compose up --detach --wait

echo "Applying database migrations..."
pnpm --dir "$BACKEND_ROOT" prisma:migrate:deploy

echo "FastFin backend data reset complete. Starter PDFs were preserved."
echo "Restart the backend and worker processes before uploading documents."
