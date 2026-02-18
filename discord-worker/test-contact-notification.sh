#!/bin/bash
# Test de notification de contact
# Usage: ./test-contact-notification.sh

WORKER_URL="http://localhost:3001"
WORKER_SECRET="${DISCORD_WORKER_SECRET:=esperados_ingest_secret_prod_v1_2024}"

echo "Testing contact notification endpoint..."
echo "Worker URL: $WORKER_URL"
echo ""

# Test request
curl -X POST "$WORKER_URL/api/worker/contact-notification" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -d '{
    "discordId": "123456789",
    "username": "TestPlayer",
    "steamId": "76561198123456789",
    "rpName": "John Doe"
  }' \
  -w "\n\nStatus: %{http_code}\n"

echo ""
echo "Test completed!"
