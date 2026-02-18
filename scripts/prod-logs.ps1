param(
  [string]$EnvFile = "env/.env.ovh",
  [string]$Service = ""
)

$ErrorActionPreference = "Stop"

if ($Service) {
  docker compose -f docker-compose.prod.yml --env-file $EnvFile logs -f --tail 200 $Service
} else {
  docker compose -f docker-compose.prod.yml --env-file $EnvFile logs -f --tail 200
}
