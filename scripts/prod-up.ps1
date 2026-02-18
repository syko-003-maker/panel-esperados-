param(
  [string]$EnvFile = "env/.env.ovh"
)

$ErrorActionPreference = "Stop"

docker compose -f docker-compose.prod.yml --env-file $EnvFile up -d --build
