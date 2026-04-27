#!/bin/bash
# Test de notification de contact
# Usage: ./test-contact-notification.sh

WORKER_URL="http://localhost:3001"
if [ -z "$DISCORD_WORKER_SECRET" ]; then
  echo "ERROR: DISCORD_WORKER_SECRET env variable is required"
  exit 1
fi
WORKER_SECRET="$DISCORD_WORKER_SECRET"

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
