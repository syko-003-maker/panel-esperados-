#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-env/.env.ovh}
SERVICE=${2:-}

if [ -n "$SERVICE" ]; then
  docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" logs -f --tail 200 "$SERVICE"
else
  docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" logs -f --tail 200
fi
