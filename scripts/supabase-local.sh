#!/bin/bash

# Supabase Local Development Script
# Starts Supabase locally for development and testing

set -e

echo "🚀 Starting Supabase Local Development"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI is not installed!${NC}"
    echo ""
    echo "Please install it first:"
    echo "  npm install -g supabase"
    echo "  or"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    echo ""
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Load local environment variables if they exist
if [ -f "supabase/.env.local" ]; then
    echo -e "${BLUE}📋 Loading local environment variables...${NC}"
    export $(cat supabase/.env.local | grep -v '^#' | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
    echo ""
fi

echo -e "${BLUE}🔧 Starting Supabase services...${NC}"
echo ""

# Start Supabase
supabase start

echo ""
echo -e "${GREEN}✅ Supabase is running!${NC}"
echo ""
echo "Local Development URLs:"
echo "  API URL: http://localhost:54321"
echo "  Studio URL: http://localhost:54323"
echo "  Edge Functions: http://localhost:54321/functions/v1"
echo ""
echo "To test Edge Functions locally:"
echo "  Health: http://localhost:54321/functions/v1/health"
echo "  Agricultural Indices: http://localhost:54321/functions/v1/agricultural-indices?index=msavi"
echo ""
echo "Update your frontend .env.local:"
echo "  VITE_API_BASE_URL=http://localhost:54321/functions/v1"
echo ""
echo "To stop Supabase:"
echo "  supabase stop"
echo ""









