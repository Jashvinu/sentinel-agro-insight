#!/bin/bash

# Firebase Deployment Script for Frontend Only
# This script deploys only the frontend to Firebase (server is on Vercel)

set -e

echo "🚀 Starting Firebase deployment for frontend..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo "🔐 Please log in to Firebase first:"
    echo "   firebase login"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run type checking
echo "🔍 Running type checking..."
npm run type-check

# Build the project
echo "🏗️  Building the project..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed. Please check the build output above."
    exit 1
fi

echo "✅ Build completed successfully!"

# Deploy to Firebase
echo "🚀 Deploying frontend to Firebase..."
firebase deploy --only hosting

echo "🎉 Frontend deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Make sure your Vercel server is deployed and running"
echo "2. Update VITE_API_BASE_URL in your frontend to point to Vercel"
echo "3. Your frontend is now hosted on Firebase"
echo "4. API calls will be made to your Vercel server"
echo ""
echo "🔗 Useful commands:"
echo "   firebase serve         # Serve locally with Firebase"
echo "   firebase logs          # View Firebase logs"
echo "   firebase hosting:channel:deploy preview  # Deploy to preview channel"
