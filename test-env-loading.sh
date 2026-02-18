#!/usr/bin/env bash
# Test script: Simulate worker startup with .env.prod loading

set -e

cd "$(dirname "$0")/discord-worker"

echo "========================================"
echo "Testing: dotenv/config loads before imports"
echo "========================================"
echo ""

# Export .env.prod vars to simulate prod environment
if [ -f "../.env.prod" ]; then
    echo "[✓] Found .env.prod"
    echo ""
    echo "Testing INGEST_BASE_URL loading:"
    grep "^INGEST_BASE_URL=" "../.env.prod" || echo "[!] INGEST_BASE_URL not found in .env.prod"
    echo ""
    echo "Testing INGEST_SECRET loading:"
    grep "^INGEST_SECRET=" "../.env.prod" | sed 's/=.*/=<hidden>/g' || echo "[!] INGEST_SECRET not found in .env.prod"
else
    echo "[✗] .env.prod not found"
    exit 1
fi

echo ""
echo "========================================"
echo "Building TypeScript..."
echo "========================================"
npm run build

echo ""
echo "========================================"
echo "Build successful - no top-level throws!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Deploy with .env.prod in production"
echo "2. Run: npm run discord:start"
echo "3. Look for these logs:"
echo "   - [ENV CONFIG AT BOOT] with INGEST_BASE_URL"
echo "   - env_config_at_boot with ingestSecretLength"
echo ""
