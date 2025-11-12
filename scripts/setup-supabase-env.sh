#!/bin/bash

# Supabase Environment Setup Script
# This script helps you set up environment variables for Supabase Edge Functions

set -e

echo "🚀 Supabase Environment Setup"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Get project reference
echo "📋 Enter your Supabase project reference (e.g., abc123xyz):"
read -r PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}❌ Project reference is required${NC}"
    exit 1
fi

echo ""
echo "🔐 Setting up Google Earth Engine credentials..."
echo ""
echo "Choose your credential method:"
echo "  1. Use complete JSON file"
echo "  2. Enter individual variables"
read -r -p "Enter choice (1 or 2): " CRED_METHOD

if [ "$CRED_METHOD" == "1" ]; then
    echo ""
    echo "📁 Enter path to your Google Cloud service account JSON file:"
    read -r JSON_PATH
    
    if [ ! -f "$JSON_PATH" ]; then
        echo -e "${RED}❌ File not found: $JSON_PATH${NC}"
        exit 1
    fi
    
    # Read and minify JSON
    GOOGLE_CREDENTIALS=$(cat "$JSON_PATH" | tr -d '\n' | tr -d ' ')
    
    echo ""
    echo "🚀 Setting secret: GOOGLE_CREDENTIALS_JSON"
    echo "GOOGLE_CREDENTIALS_JSON=$GOOGLE_CREDENTIALS" | supabase secrets set --project-ref "$PROJECT_REF"
    
    echo -e "${GREEN}✓ Google credentials set successfully${NC}"
    
elif [ "$CRED_METHOD" == "2" ]; then
    echo ""
    echo "Enter the following Google Cloud credentials:"
    echo ""
    
    read -r -p "Project ID: " GOOGLE_PROJECT_ID
    read -r -p "Private Key ID: " GOOGLE_PRIVATE_KEY_ID
    read -r -p "Client Email: " GOOGLE_CLIENT_EMAIL
    read -r -p "Client ID: " GOOGLE_CLIENT_ID
    read -r -p "Client x509 Cert URL: " GOOGLE_CLIENT_X509_CERT_URL
    
    echo ""
    echo "Private Key (paste the complete key including BEGIN/END lines, then press Ctrl+D):"
    GOOGLE_PRIVATE_KEY=$(cat)
    
    echo ""
    echo "🚀 Setting secrets..."
    echo "GOOGLE_PROJECT_ID=$GOOGLE_PROJECT_ID" | supabase secrets set --project-ref "$PROJECT_REF"
    echo "GOOGLE_PRIVATE_KEY_ID=$GOOGLE_PRIVATE_KEY_ID" | supabase secrets set --project-ref "$PROJECT_REF"
    echo "GOOGLE_PRIVATE_KEY=$GOOGLE_PRIVATE_KEY" | supabase secrets set --project-ref "$PROJECT_REF"
    echo "GOOGLE_CLIENT_EMAIL=$GOOGLE_CLIENT_EMAIL" | supabase secrets set --project-ref "$PROJECT_REF"
    echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" | supabase secrets set --project-ref "$PROJECT_REF"
    echo "GOOGLE_CLIENT_X509_CERT_URL=$GOOGLE_CLIENT_X509_CERT_URL" | supabase secrets set --project-ref "$PROJECT_REF"
    
    echo -e "${GREEN}✓ All Google credentials set successfully${NC}"
else
    echo -e "${RED}❌ Invalid choice${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Environment setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Deploy your Edge Functions:"
echo "     npm run deploy:supabase"
echo ""
echo "  2. Update your frontend .env file with:"
echo "     VITE_API_BASE_URL=https://$PROJECT_REF.supabase.co/functions/v1"
echo ""

