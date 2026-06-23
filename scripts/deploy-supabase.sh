#!/bin/bash

# Supabase Deployment Script
# Deploys Edge Functions to Supabase

set -e

echo "🚀 Deploying to Supabase"
echo "========================"
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

# Check if user is logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠️  You need to log in to Supabase first${NC}"
    echo ""
    echo "Running: supabase login"
    supabase login
    echo ""
fi

echo -e "${GREEN}✓ Logged in to Supabase${NC}"
echo ""

# Get project reference if not provided
if [ -z "$SUPABASE_PROJECT_REF" ]; then
    echo "📋 Available projects:"
    supabase projects list
    echo ""
    echo "Enter your Supabase project reference (e.g., abc123xyz):"
    read -r SUPABASE_PROJECT_REF
    
    if [ -z "$SUPABASE_PROJECT_REF" ]; then
        echo -e "${RED}❌ Project reference is required${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${BLUE}📦 Deploying Edge Functions...${NC}"
echo ""

# Link to project
echo "🔗 Linking to project: $SUPABASE_PROJECT_REF"
supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo ""
echo "📤 Deploying functions..."
echo ""

FUNCTIONS=(
    "health"
    "agricultural-indices"
    "diagnostics"
    "weather"
    "farm-timeline"
    "field-overview"
    "get-available-dates"
    "get-observation-dates"
    "sync-satellite-dates"
    "trace-lots"
    "trace-events"
    "trace-reports"
    "trace-risk-score"
    "trace-hash-batch"
    "qr-public-passport"
    "rag-advisor"
    "rag-retrieve"
    "disease-risk-screen"
    "disease-image-diagnose"
)

for fn in "${FUNCTIONS[@]}"; do
    if [ -d "supabase/functions/$fn" ]; then
        echo "→ deploying $fn"
        supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
        echo -e "${GREEN}✓ $fn deployed${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Skipping $fn (directory not found)${NC}"
        echo ""
    fi
done

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Your Edge Functions are now live at:"
echo "  Base URL: https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1"
echo ""
echo "Update your frontend .env file if needed:"
echo "  VITE_API_BASE_URL=https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1"
echo ""
