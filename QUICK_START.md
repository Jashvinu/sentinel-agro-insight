# 🚀 Quick Start Guide

Your Sentinel Agro Insight platform is ready to deploy!

## ✅ What Just Happened

1. **Migrated from Vercel → Supabase** ✅
2. **Tested your Google Cloud credentials** ✅
3. **Verified all agricultural indices work** ✅

## 📊 Test Results

All endpoints tested and working:
- ✅ Health Check
- ✅ MSAVI Index
- ✅ NDVI Index (avg: 0.2542)
- ✅ EVI Index
- ✅ SAVI Index

**Found**: 4 Sentinel-2 images for January 2024
**Location**: Bangalore, India (77.77°E, 12.39°N)

## 🎯 Next Steps

### Option 1: Deploy to Supabase (Recommended)

```bash
# 1. Create Supabase project at https://supabase.com

# 2. Run setup script
npm run deploy:setup

# 3. When prompted:
#    - Enter your Supabase project reference
#    - Choose option 1 (complete JSON file)
#    - Provide path: ./wrkfarm-415118-8bd4bb22e26c.json

# 4. Deploy Edge Functions
npm run deploy:supabase

# 5. Update frontend .env
echo "VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1" > .env

# 6. Build and deploy frontend
npm run build
npm run firebase:deploy
```

### Option 2: Run Locally

```bash
# Terminal 1: Start API server
export GOOGLE_CREDENTIALS_JSON='<paste-your-json-here>'
npm run api:dev

# Terminal 2: Start frontend
echo "VITE_API_BASE_URL=http://127.0.0.1:3000/api" > .env.local
npm run dev
```

### Option 3: Use Supabase Locally

```bash
# Requires Docker Desktop running
npm run supabase:start

# Then in another terminal
npm run dev
```

## 🔗 API Endpoints

### Production (after Supabase deploy)
- Health: `https://YOUR_REF.supabase.co/functions/v1/health`
- Indices: `https://YOUR_REF.supabase.co/functions/v1/agricultural-indices?index=msavi`

### Local
- Health: `http://127.0.0.1:3000/api/health`
- Indices: `http://127.0.0.1:3000/api/agricultural-indices?index=msavi`

## 📚 Documentation

- 📖 **Quick Start**: `SUPABASE_QUICKSTART.md`
- 📚 **Full Guide**: `docs/SUPABASE_DEPLOYMENT.md`
- 🔄 **Migration**: `MIGRATION_TO_SUPABASE.md`
- ✅ **Test Results**: `TEST_RESULTS.md`

## 🎨 Supported Indices

| Index | Description | Parameter |
|-------|-------------|-----------|
| MSAVI | Modified Soil Adjusted VI | `?index=msavi` |
| NDVI | Normalized Difference VI | `?index=ndvi` |
| EVI | Enhanced Vegetation Index | `?index=evi` |
| SAVI | Soil Adjusted VI | `?index=savi` |

## 🔒 Security

Your credentials are in: `wrkfarm-415118-8bd4bb22e26c.json`

**Keep this file secure:**
- ✅ Already in `.gitignore`
- ⚠️ Never commit to version control
- 🔐 For Supabase, it will be stored as encrypted secrets

## 💡 Tips

1. **Local Testing**: Use the Express API server (port 3000)
2. **Production**: Deploy to Supabase Edge Functions
3. **Frontend**: Can be hosted anywhere (Firebase, Netlify, Cloudflare Pages)
4. **SSL Issues**: The local server handles SSL certificate issues automatically

## 🆘 Need Help?

```bash
# Check if server is running
curl http://127.0.0.1:3000/api/health

# Test specific index
curl "http://127.0.0.1:3000/api/agricultural-indices?index=ndvi&start=2024-01-01&end=2024-01-31"

# View logs
tail -f /tmp/api-server.log
```

## ⚡ Quick Commands

```bash
npm run deploy:supabase      # Deploy to Supabase
npm run supabase:start       # Start local Supabase
npm run api:dev              # Start local Express server
npm run dev                  # Start frontend
npm run build                # Build for production
```

---

**Ready to deploy!** 🎉

Start with: `npm run deploy:setup`


