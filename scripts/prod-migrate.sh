#!/bin/bash
# Production Prisma Migration Script (Bash/Linux)
# Usage: ./scripts/prod-migrate.sh [.env.production]
#
# Loads environment variables and runs Prisma migrations
# Suitable for: production deployments, Docker containers, CI/CD pipelines

set -e

ENV_FILE="${1:-env/.env.ovh}"

function write_step() {
    echo -e "\033[36m[MIGRATE] $1\033[0m"
}

function write_error() {
    echo -e "\033[31m[ERROR] $1\033[0m"
}

function write_success() {
    echo -e "\033[32m[SUCCESS] $1\033[0m"
}

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    write_error "Environment file not found: $ENV_FILE"
    exit 1
fi

write_step "Loading environment from: $ENV_FILE"

# Load .env file into environment
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Verify critical variables
write_step "Verifying critical variables..."
if [ -z "$DATABASE_URL" ]; then
    write_error "DATABASE_URL is not set"
    exit 1
fi
write_step "DATABASE_URL is set"

if [ -z "$SHADOW_DATABASE_URL" ]; then
    write_error "SHADOW_DATABASE_URL is not set"
    exit 1
fi
write_step "SHADOW_DATABASE_URL is set"

# Run Prisma migrations via Docker Compose
write_step "Running Prisma migrations via Docker Compose..."
if ! command -v docker >/dev/null 2>&1; then
    write_error "docker not found. Install Docker and ensure it is in PATH."
    exit 1
fi

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" run --rm app npx prisma migrate deploy
if [ $? -ne 0 ]; then
    write_error "Prisma migrate deploy failed"
    exit 1
fi
write_success "Prisma migrations applied successfully"
