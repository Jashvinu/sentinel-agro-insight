# Sentinel Agro Insight - Supabase Deployment ✅

Your app is now configured for Supabase! The 404 errors you're seeing are because the Edge Functions haven't been deployed yet.

## ✅ What's Already Done

- ✅ Supabase Edge Functions created (`health`, `agricultural-indices`)
- ✅ Frontend configured to use Supabase (`https://udbnskydigoqpxmmduvr.supabase.co/functions/v1`)
- ✅ API endpoints updated (removed `/api` prefix)
- ✅ Deployment scripts ready
- ✅ React error fixed (function declaration order)
- ✅ Removed old Vercel configuration

## ⏭️ What You Need To Do Now

### Step 1: Install Supabase CLI (if not installed)

```bash
npm install -g supabase
```

### Step 2: Login

```bash
supabase login
```

### Step 3: Deploy the Edge Functions

```bash
cd /Users/jashvinuyeshwanth/Desktop/wrkfarm/sentinel-agro-insight-1

# Set your project reference
export SUPABASE_PROJECT_REF=udbnskydigoqpxmmduvr

# Deploy!
npm run deploy
```

### Step 4: Add Google Cloud Secrets

After deployment, add your credentials as Supabase secrets:

#### Option A: Use JSON file (Easiest)

```bash
supabase secrets set GOOGLE_CREDENTIALS_JSON="$(cat wrkfarm-415118-8bd4bb22e26c.json)" --project-ref udbnskydigoqpxmmduvr
```

#### Option B: Individual secrets (if Option A doesn't work)

```bash
# From your .env or service account JSON
supabase secrets set GOOGLE_PROJECT_ID="wrkfarm-415118" --project-ref udbnskydigoqpxmmduvr
supabase secrets set GOOGLE_CLIENT_EMAIL="your-email@project.iam.gserviceaccount.com" --project-ref udbnskydigoqpxmmduvr
# ... etc
```

### Step 5: Test Your Deployment

```bash
# Health check
curl https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/health

# Agricultural indices
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices?index=ndvi"
```

### Step 6: Restart Your Frontend

```bash
# Stop the dev server (Ctrl+C) and restart
npm run dev
```

Your app should now work! 🎉

## 📁 Project Structure

```
sentinel-agro-insight-1/
├── supabase/
│   ├── functions/
│   │   ├── health/              # Health check endpoint
│   │   ├── agricultural-indices/ # Main API endpoint
│   │   └── _shared/             # Shared utilities (CORS, responses)
│   └── config.toml              # Supabase configuration
├── src/                         # React frontend
├── scripts/
│   ├── deploy-supabase.sh       # Deployment script
│   └── setup-supabase-env.sh    # Environment setup
└── package.json                 # npm scripts configured
```

## 🔧 Available Commands

```bash
# Development
npm run dev                      # Start frontend dev server
npm run api:dev                  # Start local API server

# Supabase
npm run deploy                   # Deploy Edge Functions to Supabase
npm run deploy:supabase          # Same as above
npm run deploy:setup             # Setup environment variables
npm run supabase:start           # Start local Supabase (requires Docker)
npm run supabase:stop            # Stop local Supabase

# Build & Deploy Frontend
npm run build                    # Build frontend
npm run deploy:frontend          # Deploy to Firebase Hosting
```

## 🐛 Troubleshooting

### Functions not found (404)
```bash
# List deployed functions
supabase functions list --project-ref udbnskydigoqpxmmduvr

# Redeploy if needed
supabase functions deploy health --project-ref udbnskydigoqpxmmduvr --no-verify-jwt
supabase functions deploy agricultural-indices --project-ref udbnskydigoqpxmmduvr --no-verify-jwt
```

### View Logs
```bash
# Real-time logs
supabase functions logs health --project-ref udbnskydigoqpxmmduvr --follow

# Agricultural indices logs
supabase functions logs agricultural-indices --project-ref udbnskydigoqpxmmduvr --follow
```

### Check Secrets
```bash
supabase secrets list --project-ref udbnskydigoqpxmmduvr
```

### Authentication Errors
- Make sure all Google Cloud secrets are set
- Verify your service account has Earth Engine API enabled
- Check the private key format (should have `\n` for line breaks)

## 📊 API Endpoints

Once deployed, your API will be available at:

| Endpoint | URL | Description |
|----------|-----|-------------|
| Health | `https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/health` | Server health check |
| Agricultural Indices | `https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices` | Calculate vegetation indices |

### Query Parameters for Agricultural Indices

```
?index=ndvi&start=2024-01-01&end=2024-12-31&polygon={...}
```

**Supported indices:**
- `ndvi` - Normalized Difference Vegetation Index
- `evi` - Enhanced Vegetation Index
- `savi` - Soil Adjusted Vegetation Index
- `msavi` - Modified Soil Adjusted Vegetation Index
- `nitrogen` - Nitrogen content
- `phosphorus` - Phosphorus content
- `potassium` - Potassium content
- `salinity` - Soil salinity
- `ph` - Soil pH
- `moisture` - Soil moisture
- `carbon` - Soil organic carbon

## 🎯 Quick Reference

### Current Status
- **Frontend**: Running locally at `http://localhost:8080`
- **API Base**: `https://udbnskydigoqpxmmduvr.supabase.co/functions/v1`
- **Project**: `udbnskydigoqpxmmduvr`
- **Functions**: `health`, `agricultural-indices`

### Files Updated
- ✅ `src/constants/index.ts` - Removed `/api` prefix from endpoints
- ✅ `.vercel/` - Removed (not using Vercel anymore)
- ✅ `.vercelignore` - Removed
- ✅ `src/components/features/map/field-map.tsx` - Fixed function order bug

### Next Deployment
Just run:
```bash
npm run deploy
```

---

**Need More Help?**
- 📖 Full Guide: [SUPABASE_QUICKSTART.md](./SUPABASE_QUICKSTART.md)
- 🚀 Quick Deploy: [DEPLOY_NOW.md](./DEPLOY_NOW.md)
- 📚 Documentation: [docs/SUPABASE_DEPLOYMENT.md](./docs/SUPABASE_DEPLOYMENT.MD)

**Ready?** → Run `npm run deploy` to get started! 🚀

