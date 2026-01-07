# Supabase Quick Start Guide

Get Sentinel Agro Insight running on Supabase in 10 minutes!

## Prerequisites

- Node.js 18+
- Supabase account
- Google Cloud service account JSON
- Docker (for local development)

## Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

## Step 2: Login to Supabase

```bash
supabase login
```

## Step 3: Create Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Note your project reference (e.g., `abc123xyz`)

## Step 4: Setup Environment

```bash
# Clone and install
git clone <your-repo>
cd sentinel-agro-insight-1
npm install

# Run setup script
npm run deploy:setup
```

Follow the prompts to:
- Enter your Supabase project reference
- Provide Google Cloud credentials

## Step 5: Deploy

```bash
npm run deploy:supabase
```

## Step 6: Configure Frontend

Create `.env` file:

```
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
```

## Step 7: Build & Deploy Frontend

```bash
npm run build
# Deploy to your hosting provider (Firebase, Netlify, etc.)
```

## Step 8: Test

```bash
# Test health endpoint
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/health

# Test agricultural indices (now supports 12 indices!)
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agricultural-indices?index=ndvi"
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agricultural-indices?index=nitrogen"
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agricultural-indices?index=moisture"

# All available indices:
# Vegetation: ndvi, evi, savi, msavi
# NPK: nitrogen, phosphorus, potassium
# Soil: salinity, ph, moisture, carbon
# Water: ndwi
```

## Local Development

```bash
# Start Supabase locally (requires Docker)
npm run supabase:start

# In another terminal, start frontend
npm run dev
```

Update `.env.local`:
```
VITE_API_BASE_URL=http://localhost:54321/functions/v1
```

## Available Scripts

```bash
npm run deploy:setup         # Setup environment variables
npm run deploy:supabase      # Deploy Edge Functions
npm run supabase:start       # Start local Supabase
npm run supabase:stop        # Stop local Supabase
npm run dev                  # Start frontend dev server
npm run build                # Build frontend for production
```

## Need Help?

- 📖 [Full Documentation](./docs/SUPABASE_DEPLOYMENT.md)
- 🐛 [Open an Issue](https://github.com/your-repo/issues)
- 💬 [Supabase Discord](https://discord.supabase.com)

## What's Different from Vercel?

✅ **Same functionality, different platform**
- Edge Functions instead of Serverless Functions
- Deno runtime instead of Node.js (in functions)
- Frontend still uses React/Vite
- No code changes needed in frontend

✅ **Benefits**
- Built-in database (if needed in future)
- Real-time subscriptions available
- Unified platform for backend + database
- Generous free tier

---

**Ready to Deploy?** Start with Step 1!

