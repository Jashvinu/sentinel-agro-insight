#!/bin/bash

# Deploy Advanced Monitoring Edge Functions
# This script deploys all edge functions required for the Advanced Monitoring feature

set -e  # Exit on error

echo "🚀 Deploying Advanced Monitoring Edge Functions..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Check if logged in to Supabase
if ! supabase projects list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Supabase${NC}"
    echo "Login with: supabase login"
    exit 1
fi

echo -e "${BLUE}📋 Functions to deploy:${NC}"
echo "  1. advanced-monitoring (main orchestrator)"
echo "  2. hls-harmonize (optical sensor preprocessing)"
echo "  3. sar-preprocessing (SAR sensor preprocessing)"
echo ""

# Function to deploy an edge function
deploy_function() {
    local func_name=$1
    echo -e "${BLUE}📦 Deploying ${func_name}...${NC}"

    if supabase functions deploy "$func_name" --no-verify-jwt=false; then
        echo -e "${GREEN}✅ ${func_name} deployed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to deploy ${func_name}${NC}"
        return 1
    fi
    echo ""
}

# Deploy each function
deploy_function "advanced-monitoring"
deploy_function "hls-harmonize"
deploy_function "sar-preprocessing"

echo -e "${GREEN}🎉 All Advanced Monitoring functions deployed successfully!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  1. Set environment variables (if not already set):"
echo "     - GOOGLE_CREDENTIALS_JSON (Earth Engine credentials)"
echo "     - SUPABASE_URL"
echo "     - SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "  2. Apply database migrations:"
echo "     supabase migration up"
echo ""
echo "  3. Test the deployment:"
echo "     curl -X POST https://[your-project-ref].supabase.co/functions/v1/advanced-monitoring \\"
echo "       -H 'Authorization: Bearer [your-anon-key]' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"polygon\": {...}, \"farmId\": \"...\", \"startDate\": \"2024-01-01\", \"endDate\": \"2024-03-31\", \"algorithms\": [\"optram_moisture\"]}'"
echo ""
echo -e "${GREEN}✨ Deployment complete!${NC}"
