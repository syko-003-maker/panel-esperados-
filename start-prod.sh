#!/bin/bash
# Los Esperados - Production Deployment Script
# Linux/macOS version

set -e

echo "🚀 Los Esperados - Production Deployment"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "\n${YELLOW}📋 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm: $(npm --version)${NC}"

# Check cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared not found${NC}"
    echo -e "${YELLOW}   Install from: https://github.com/cloudflare/cloudflared${NC}"
    exit 1
fi
echo -e "${GREEN}✅ cloudflared: $(cloudflared --version)${NC}"

# Check PostgreSQL
echo -e "\n${YELLOW}🔗 Checking PostgreSQL...${NC}"
export PGPASSWORD="postgres"
if ! psql -h 127.0.0.1 -p 5434 -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}❌ PostgreSQL connection failed${NC}"
    echo -e "${YELLOW}   Make sure PostgreSQL is running on 127.0.0.1:5434${NC}"
    exit 1
fi
unset PGPASSWORD
echo -e "${GREEN}✅ PostgreSQL connected${NC}"

# Check .env.prod
if [ ! -f ".env.prod" ]; then
    echo -e "${RED}❌ .env.prod not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ .env.prod found${NC}"

# Check Cloudflare credentials
TUNNEL_CREDS="$HOME/.cloudflared/cd2a0e2d-f3c1-4866-ae84-8115817b154a.json"
if [ ! -f "$TUNNEL_CREDS" ]; then
    echo -e "${RED}❌ Tunnel credentials not found at $TUNNEL_CREDS${NC}"
    echo -e "${YELLOW}   Run: cloudflared tunnel login${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Tunnel credentials found${NC}"

# Check Cloudflare config
if [ ! -f ".cloudflared-config.yml" ]; then
    echo -e "${RED}❌ .cloudflared-config.yml not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Cloudflare config found${NC}"

# Build if requested
if [ "$1" == "--build" ]; then
    echo -e "\n${YELLOW}🔨 Building Next.js...${NC}"
    npm run build
    echo -e "${GREEN}✅ Build complete${NC}"
fi

# Load environment
echo -e "\n${YELLOW}🔧 Loading production environment...${NC}"
set -a
source .env.prod
set +a
echo -e "${GREEN}✅ Environment loaded${NC}"

# Display configuration
echo -e "\n${CYAN}✅ All prerequisites met!${NC}"
echo -e "\n${CYAN}🌍 Deployment Configuration:${NC}"
echo -e "   Domain: https://losesperados.fr"
echo -e "   Next.js: http://localhost:3000 (internal)"
echo -e "   Tunnel: los-esperados (cd2a0e2d-f3c1-4866-ae84-8115817b154a)"

echo -e "\n${YELLOW}📌 NOTE: You can stop all services with Ctrl+C${NC}"
echo -e "\n${GREEN}🚀 Starting services...${NC}"
echo "========================================"
echo ""

# Launch services
npm run start:prod
