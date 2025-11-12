# Supabase Deployment Guide

This guide walks you through deploying Sentinel Agro Insight to Supabase using Edge Functions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **Supabase Account**: Create an account at [supabase.com](https://supabase.com)
2. **Supabase CLI**: Install the Supabase CLI
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```
3. **Docker Desktop**: Required for local development
4. **Google Cloud Service Account**: For Earth Engine API access
5. **Node.js**: Version 18+ for building the frontend

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Login to Supabase
supabase login

# 3. Create a new Supabase project (or use existing)
# Visit https://app.supabase.com/projects to create a project

# 4. Setup environment variables
npm run deploy:setup

# 5. Deploy Edge Functions
npm run deploy:supabase

# 6. Build and deploy frontend (Firebase or other hosting)
npm run build
```

## Detailed Setup

### 1. Create a Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Fill in project details:
   - **Name**: sentinel-agro-insight
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to your users
4. Click "Create new project"
5. Note your project reference (e.g., `abc123xyz`)

### 2. Install Supabase CLI

```bash
# Using npm
npm install -g supabase

# Using Homebrew (macOS)
brew install supabase/tap/supabase

# Verify installation
supabase --version
```

### 3. Login to Supabase

```bash
supabase login
```

This will open a browser window for authentication.

### 4. Setup Google Earth Engine Credentials

You need a Google Cloud service account with Earth Engine API access:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the Earth Engine API
4. Create a service account:
   - Go to IAM & Admin > Service Accounts
   - Click "Create Service Account"
   - Grant "Earth Engine Resource Admin" role
5. Create and download a JSON key

### 5. Configure Environment Variables

Run the setup script:

```bash
npm run deploy:setup
```

This will:
- Prompt for your Supabase project reference
- Ask for your Google Cloud credentials (JSON file or individual values)
- Set all required secrets in Supabase

**Manual Setup (Alternative)**:

You can also set secrets manually using the Supabase CLI:

```bash
# Set complete JSON credentials (recommended)
cat your-service-account.json | supabase secrets set GOOGLE_CREDENTIALS_JSON --project-ref your-project-ref

# Or set individual variables
echo "your-project-id" | supabase secrets set GOOGLE_PROJECT_ID --project-ref your-project-ref
echo "your-private-key-id" | supabase secrets set GOOGLE_PRIVATE_KEY_ID --project-ref your-project-ref
# ... etc
```

Or via the Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add secrets under "Environment Variables"

### 6. Update Frontend Configuration

Create a `.env` file in the project root:

```bash
# For production
VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1

# For local development
# VITE_API_BASE_URL=http://localhost:54321/functions/v1
```

## Local Development

### Start Supabase Locally

```bash
# Start all Supabase services (requires Docker)
npm run supabase:start
```

This will start:
- **API Server**: http://localhost:54321
- **Studio Dashboard**: http://localhost:54323
- **Edge Functions**: http://localhost:54321/functions/v1

### Test Edge Functions Locally

```bash
# Health check
curl http://localhost:54321/functions/v1/health

# Agricultural indices
curl "http://localhost:54321/functions/v1/agricultural-indices?index=msavi&start=2024-01-01&end=2024-12-31"
```

### Run Frontend with Local API

1. Update `.env.local`:
   ```
   VITE_API_BASE_URL=http://localhost:54321/functions/v1
   ```

2. Start frontend:
   ```bash
   npm run dev
   ```

### Stop Supabase

```bash
npm run supabase:stop
```

## Deployment

### Deploy Edge Functions

Deploy all Edge Functions to production:

```bash
npm run deploy:supabase
```

This will deploy:
- `health` - Health check endpoint
- `agricultural-indices` - Main agricultural data API

**Deploy Individual Functions**:

```bash
# Deploy only health function
supabase functions deploy health --project-ref your-project-ref

# Deploy only agricultural-indices function
supabase functions deploy agricultural-indices --project-ref your-project-ref
```

### Deploy Frontend

The frontend can be deployed to any static hosting service:

#### Option 1: Firebase Hosting

```bash
npm run build
npm run deploy:hosting
```

#### Option 2: Supabase Storage (Static Hosting)

```bash
npm run build
# Then upload dist/ folder to Supabase Storage
```

#### Option 3: Netlify/Cloudflare Pages

1. Connect your repository
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variable: `VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1`

### Verify Deployment

Test your deployed Edge Functions:

```bash
# Health check
curl https://your-project-ref.supabase.co/functions/v1/health

# Agricultural indices
curl "https://your-project-ref.supabase.co/functions/v1/agricultural-indices?index=msavi"
```

## Environment Variables

### Frontend Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL for API endpoints | `https://abc123.supabase.co/functions/v1` |

### Edge Function Secrets

Set via Supabase CLI or Dashboard:

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CREDENTIALS_JSON` | Complete GCP service account JSON | Yes (Option 1) |
| `GOOGLE_PROJECT_ID` | GCP Project ID | Yes (Option 2) |
| `GOOGLE_PRIVATE_KEY` | GCP Service Account Private Key | Yes (Option 2) |
| `GOOGLE_PRIVATE_KEY_ID` | GCP Private Key ID | Yes (Option 2) |
| `GOOGLE_CLIENT_EMAIL` | GCP Service Account Email | Yes (Option 2) |
| `GOOGLE_CLIENT_ID` | GCP Client ID | Yes (Option 2) |
| `GOOGLE_CLIENT_X509_CERT_URL` | GCP Certificate URL | Yes (Option 2) |

**Note**: Use either Option 1 (JSON) or Option 2 (individual vars), not both.

## Architecture

```
┌─────────────────┐
│   React/Vite    │
│    Frontend     │
└────────┬────────┘
         │ HTTPS
         │
┌────────▼───────────────────────┐
│   Supabase Edge Functions      │
│  (Deno Runtime)                 │
│                                 │
│  ┌──────────────────┐          │
│  │ health           │          │
│  └──────────────────┘          │
│                                 │
│  ┌──────────────────┐          │
│  │ agricultural-    │          │
│  │ indices          │          │
│  └────────┬─────────┘          │
│           │                     │
└───────────┼─────────────────────┘
            │
            │ Earth Engine API
            │
┌───────────▼────────────┐
│  Google Earth Engine   │
│  (Sentinel-2 Data)     │
└────────────────────────┘
```

## API Endpoints

### Health Check

```
GET /functions/v1/health
```

**Response**:
```json
{
  "success": true,
  "status": "OK",
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "platform": "Supabase Edge Functions"
}
```

### Agricultural Indices

```
GET /functions/v1/agricultural-indices?index={index}&start={start}&end={end}&polygon={polygon}
```

**Parameters**:
- `index` (optional): `msavi`, `ndvi`, `evi`, `savi` (default: `msavi`)
- `start` (optional): Start date `YYYY-MM-DD` (default: `2024-01-01`)
- `end` (optional): End date `YYYY-MM-DD` (default: `2024-12-31`)
- `polygon` (optional): GeoJSON polygon string

**Response**:
```json
{
  "success": true,
  "urlFormat": "https://earthengine.googleapis.com/...",
  "mapid": "...",
  "token": "...",
  "geojson": {...},
  "poiPolygon": {...},
  "metadata": {
    "dateRange": {...},
    "algorithm": "MSAVI",
    "dataSource": "Sentinel-2 SR Harmonized",
    "cloudFilter": "< 20%",
    "calculationMethod": "..."
  }
}
```

## Troubleshooting

### Edge Function Deployment Fails

**Error**: "Failed to deploy function"

**Solutions**:
1. Check you're logged in: `supabase projects list`
2. Verify project reference is correct
3. Check function syntax: `deno check supabase/functions/*/index.ts`

### Earth Engine Authentication Fails

**Error**: "Missing required Google Cloud credentials"

**Solutions**:
1. Verify secrets are set: `supabase secrets list --project-ref your-project-ref`
2. Check service account has Earth Engine access
3. Ensure private key newlines are preserved (`\n`)

### CORS Issues

**Error**: "CORS policy blocked the request"

**Solutions**:
1. Edge Functions include CORS headers by default
2. Check the `_shared/cors.ts` configuration
3. Verify `Access-Control-Allow-Origin` is set to `*` or your domain

### Function Timeout

**Error**: "Function execution time limit exceeded"

**Solutions**:
1. Earth Engine requests can be slow; consider:
   - Reducing date range
   - Decreasing cloud filter threshold
   - Using simpler vegetation indices

### Local Development Issues

**Error**: "Docker not running"

**Solution**: Start Docker Desktop before running `supabase start`

**Error**: "Port already in use"

**Solution**: Stop other services on ports 54321-54326 or configure different ports in `supabase/config.toml`

## Cost Considerations

### Supabase

- **Free Tier**: 500K Edge Function invocations/month
- **Pro Tier**: $25/month + additional invocations
- **Bandwidth**: Included in tier pricing

### Google Earth Engine

- **Free**: For research and non-commercial use
- **Commercial**: Contact Google Cloud sales

## Migration from Vercel

If migrating from Vercel:

1. ✅ Edge Functions replace Vercel Serverless Functions
2. ✅ Same API endpoints and functionality
3. ✅ Update `VITE_API_BASE_URL` environment variable
4. ✅ No code changes required for frontend
5. ❌ Remove Vercel-specific files (`vercel.json`, deploy scripts)

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Edge Functions**: https://supabase.com/docs/guides/functions
- **Earth Engine**: https://developers.google.com/earth-engine

## Next Steps

1. ✅ Deploy Edge Functions
2. ✅ Configure environment variables
3. ✅ Test API endpoints
4. ⬜ Set up monitoring and logging
5. ⬜ Configure custom domain
6. ⬜ Set up CI/CD pipeline

---

**Need Help?** Open an issue on GitHub or contact the development team.


