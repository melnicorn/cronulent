#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE=.env

usage() {
  cat <<'USAGE'
Usage: ./redeploy.sh [--gen-token]

  (no args)     Pull the latest images and recreate the containers.
  --gen-token   Generate a new service token pair into .env first, then
                redeploy so it takes effect. Needed once before the admin API
                will work; running it again rotates the token.
USAGE
}

# Write KEY=VALUE into .env, replacing any existing line for that key.
# Values are base64/hex, so they never contain the | delimiter or a bare &.
set_env_var() {
  local key=$1 value=$2
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

case "${1:-}" in
  --gen-token)
    echo "Generating service token pair into $ENV_FILE ..."
    # The web app holds the token; the scheduler only ever holds its hash, so
    # task scripts — which inherit the scheduler's environment — never see a
    # usable credential. printf %s matters: echo would append a newline and
    # hash something other than the token.
    TOKEN=$(openssl rand -base64 32)
    HASH=$(printf %s "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $NF}')
    set_env_var CRONULENT_SERVICE_TOKEN "$TOKEN"
    set_env_var CRONULENT_SERVICE_TOKEN_HASH "$HASH"
    chmod 600 "$ENV_FILE"
    echo "Wrote CRONULENT_SERVICE_TOKEN and CRONULENT_SERVICE_TOKEN_HASH."
    ;;
  "")
    ;;
  *)
    usage
    exit 1
    ;;
esac

echo "Fetching latest compose file..."
curl -fsSL -o docker-compose.prod.yml.new \
  "https://github.com/melnicorn/cronulent/releases/latest/download/docker-compose.prod.yml"
mv docker-compose.prod.yml.new docker-compose.prod.yml

echo "Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "Recreating containers..."
docker compose -f docker-compose.prod.yml up --force-recreate -d

echo "Pruning old images..."
docker image prune -f

echo "Done."
docker compose -f docker-compose.prod.yml ps
