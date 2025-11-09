#!/bin/bash

# Vercel Deployment Script for Express Server
# This script deploys only the Express server to Vercel

set -e

echo "🚀 Starting Vercel deployment for Express server..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed. Please install it first:"
    echo "   npm install -g vercel"
    exit 1
fi

# Check if user is logged in to Vercel
if ! vercel whoami &> /dev/null; then
    echo "🔐 Please log in to Vercel first:"
    echo "   vercel login"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy to Vercel (server only)
echo "🚀 Deploying Express server to Vercel..."
vercel --prod

echo "🎉 Server deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Set up environment variables in Vercel dashboard:"
echo "   - GOOGLE_PROJECT_ID"
echo "   - GOOGLE_PRIVATE_KEY_ID"
echo "   - GOOGLE_PRIVATE_KEY"
echo "   - GOOGLE_CLIENT_EMAIL"
echo "   - GOOGLE_CLIENT_ID"
echo "   - GOOGLE_CLIENT_X509_CERT_URL"
echo "2. Test your API endpoints"
echo "3. Update frontend VITE_API_BASE_URL with Vercel URL"
echo "4. Deploy frontend to Firebase"
echo ""
echo "🔗 Useful commands:"
echo "   vercel logs          # View deployment logs"
echo "   vercel env ls        # List environment variables"
echo "   vercel env add       # Add environment variable"
echo "   vercel dev           # Run local development server"
