#!/bin/bash
# Quick health check for Discord Worker Production

echo ""
echo "===================================================="
echo "  DISCORD WORKER PRODUCTION HEALTH CHECK"
echo "===================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[X] Node.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Node.js $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[X] npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] npm $(npm --version)${NC}"

echo ""
echo "[*] Checking environment files..."

# Check root .env.prod
if [ -f ".env.prod" ]; then
    echo -e "${GREEN}[OK] Found .env.prod (root)${NC}"
else
    echo -e "${YELLOW}[!] Missing .env.prod (will be auto-created)${NC}"
fi

# Check worker .env.prod
if [ -f "discord-worker/.env.prod" ]; then
    echo -e "${GREEN}[OK] Found discord-worker/.env.prod${NC}"
else
    echo -e "${YELLOW}[!] Missing discord-worker/.env.prod (will be auto-created)${NC}"
fi

echo ""
echo "[*] Building worker..."
cd discord-worker
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}[X] Build failed${NC}"
    cd ..
    exit 1
fi
echo -e "${GREEN}[OK] Build successful${NC}"

echo ""
echo "[*] Checking environment loading..."
timeout 5 npm run start 2>&1 | grep -E "\[ENV|worker_ready|ENV CHECK" | head -20

cd ..
echo ""
echo "[OK] Health check completed"
echo ""
