#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "Recreating containers..."
docker compose -f docker-compose.prod.yml up --force-recreate -d

echo "Pruning old images..."
docker image prune -f

echo "Done."
docker compose -f docker-compose.prod.yml ps
