#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-env/.env.ovh}

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build
