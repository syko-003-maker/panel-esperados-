#!/bin/bash
# Production Prisma Status Script (Bash/Linux)
# Usage: ./scripts/prod-status.sh [.env.production]
#
# Shows migration status and checks for drift

set -e

ENV_FILE="${1:-.env.production}"

function write_step() {
    echo -e "\033[36m[STATUS] $1\033[0m"
}

function write_error() {
    echo -e "\033[31m[ERROR] $1\033[0m"
}

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    write_error "Environment file not found: $ENV_FILE"
    exit 1
fi

write_step "Loading environment from: $ENV_FILE"

# Load .env file into environment
export $(grep -v '^#' "$ENV_FILE" | xargs)

write_step "Checking migration status..."
npx prisma migrate status

write_step "Done"
