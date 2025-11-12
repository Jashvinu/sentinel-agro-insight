# 🚀 Sentinel Agro Insight - Deployment Guide (Supabase Backend)

A streamlined guide for deploying the Sentinel Agro Insight application using **Supabase Edge Functions** for the backend and **Firebase Hosting** (or any static host) for the frontend.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌────────────────────────┐
│   Frontend      │    │   Backend               │
│   (Firebase)    │◄───┤   Supabase Edge Funcs   │
│   React + TS    │    │   Google Earth Engine   │
└─────────────────┘    └────────────────────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────┐    ┌────────────────────────┐
│   Static Files  │    │   Supabase REST Edge    │
│   (HTML/CSS/JS) │    │   Google Earth Engine   │
└─────────────────┘    └────────────────────────┘
```

## 📋 Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **Git**: For version control
- **Supabase Account**: [supabase.com](https://supabase.com)
- **Supabase CLI**: `npm install -g supabase`
- **Firebase Account** (optional, for hosting): [firebase.google.com](https://firebase.google.com)
- **Google Cloud Project**: With Earth Engine API enabled and a service account key

## 🔧 Environment Setup

### Required Environment Variables

Create an `.env` file (or update your deployment secrets):

```bash
# Google Earth Engine service account credentials
GOOGLE_PROJECT_ID=wrkfarm-415118
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com

# Optional: provide the full JSON payload instead of individual values
# GOOGLE_CREDENTIALS_JSON='{"type":"service_account", ... }'

# Frontend configuration
VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Store the Google credentials and Supabase secrets in **Supabase** using `supabase secrets set` or via the dashboard.

## 🚀 Deployment Steps

### Step 1: Supabase Edge Functions

The backend lives in the `supabase/functions/` directory and runs as Deno-based edge functions.

#### 1.1 Login & Link Project
```bash
supabase login
supabase link --project-ref your-project-ref
```

#### 1.2 Configure Secrets
```bash
# Recommended: provide the entire credentials JSON
cat service-account.json | supabase secrets set GOOGLE_CREDENTIALS_JSON

# Or individual values
supabase secrets set GOOGLE_PROJECT_ID=wrkfarm-415118
supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### 1.3 Deploy Functions
```bash
npm run deploy:supabase
# or manually
supabase functions deploy agricultural-indices --project-ref your-project-ref
supabase functions deploy farm-timeline --project-ref your-project-ref
supabase functions deploy get-available-dates --project-ref your-project-ref
supabase functions deploy get-observation-dates --project-ref your-project-ref
supabase functions deploy health --project-ref your-project-ref
supabase functions deploy sync-satellite-dates --project-ref your-project-ref
```

#### 1.4 Test Functions
```bash
curl https://your-project-ref.supabase.co/functions/v1/health
curl "https://your-project-ref.supabase.co/functions/v1/agricultural-indices?index=ndvi"
```

### Step 2: Frontend Hosting (Firebase example)

#### 2.1 Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

#### 2.2 Configure Environment Variables
Set `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `.env.production` (or via your hosting provider).

#### 2.3 Build & Deploy
```bash
# Quick deploy
./scripts/deploy-firebase.sh

# Manual steps
npm install
npm run type-check
npm run build
firebase deploy --only hosting
```

## 🔄 Quick Deploy Commands

```bash
# Deploy all Supabase functions
npm run deploy:supabase

# Start Supabase locally (requires Docker)
npm run supabase:start

# Deploy frontend to Firebase
./scripts/deploy-firebase.sh
```

## 🧪 Testing Your Deployment

### Backend API Tests
```bash
# Health check
curl https://your-project-ref.supabase.co/functions/v1/health

# Earth Engine data
curl "https://your-project-ref.supabase.co/functions/v1/agricultural-indices?index=ndvi&start=2024-01-01&end=2024-12-31"
```

### Frontend Tests
1. Visit your Firebase (or static hosting) URL.
2. Check the browser console for API errors.
3. Ensure agricultural indices render correctly.
4. Verify map tiles load from Supabase-generated URLs.

## 🛠️ Troubleshooting

### Common Issues

**CORS Errors**
- Ensure `_shared/cors.ts` includes the correct origins.
- Confirm `apikey` and `Authorization` headers are sent when using Supabase Edge Functions.

**401 Unauthorized**
- `VITE_SUPABASE_ANON_KEY` must be present in the frontend build.
- Supabase secrets must contain the Google credentials.

**Earth Engine Authentication Failed**
- Service account must have Earth Engine access.
- Regenerate the JSON key if it has been rotated or revoked.

**Build Failures**
- Confirm Node.js version ≥ 18.
- Run `npm install` to sync dependencies.
- Inspect `npm run build` output for hints.

### Debugging Commands

```bash
# Tail Supabase function logs
supabase functions logs --project-ref your-project-ref --function health

# Test locally
npm run supabase:start
curl http://localhost:54321/functions/v1/health
```

## 📊 Project Structure

```
├── supabase/                     # Supabase Edge Functions (Deno)
│   └── functions/
├── src/                          # Frontend (React + Vite)
├── scripts/                      # Deployment scripts
├── docs/                         # Documentation
└── ...
```

## 🔐 Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `GOOGLE_CREDENTIALS_JSON` | Supabase secrets | Full service account JSON (preferred) |
| `GOOGLE_PROJECT_ID` / friends | Supabase secrets | Individual credentials if not using JSON |
| `VITE_API_BASE_URL` | Frontend build | Supabase Edge Function base URL |
| `VITE_SUPABASE_URL` | Frontend build | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend build | Supabase anon key for public access |

## 📦 CI/CD Recommendations

- Configure Supabase GitHub Action or CLI deploys in CI for Edge Functions.
- Use Firebase GitHub Action (or your host’s CLI) to automate frontend deployments.
- Store secrets in your CI provider and pass them to Supabase/Firebase commands.

## 🔍 Monitoring & Observability

- **Supabase Dashboard**: View function logs, metrics, and invocation history.
- **Google Cloud Console**: Monitor Earth Engine API usage and quotas.
- **Firebase Hosting**: Check deployment history and hosting logs.

## ✅ Final Verification Checklist

- [ ] Supabase Edge Functions deployed (`supabase status` looks good)
- [ ] Supabase secrets contain Google credentials
- [ ] Frontend env variables point to Supabase (`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`)
- [ ] Frontend build deployed and accessible
- [ ] Health endpoint responds with `200 OK`
- [ ] Agricultural indices endpoint returns map tiles and statistics

## 📚 Additional Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Google Earth Engine API](https://developers.google.com/earth-engine)

## 🤝 Support

If you run into issues, open a GitHub issue or reach out to the team. Include logs from Supabase (`supabase functions logs`) and details about your environment.
# 🚀 Sentinel Agro Insight - Complete Deployment Guide

A comprehensive guide for deploying the Sentinel Agro Insight application with separated frontend and backend architecture.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │
│   (Firebase)    │◄───┤   (Vercel)      │
│   React + TS    │    │   Node.js       │
└─────────────────┘    └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Static Files  │    │   Google Earth  │
│   (HTML/CSS/JS) │    │   Engine API    │
└─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **Git**: For version control
- **Vercel Account**: [vercel.com](https://vercel.com)
- **Firebase Account**: [firebase.google.com](https://firebase.google.com)
- **Google Cloud Project**: With Earth Engine API enabled

## 🔧 Environment Setup

### Required Environment Variables

#### Backend (Node.js on Vercel)
```bash
GOOGLE_PROJECT_ID=wrkfarm-415118
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
```
Or use the single JSON payload:
```bash
GOOGLE_CREDENTIALS_JSON='{"type":"service_account", ... }'
```

#### Frontend (Firebase)
```bash
VITE_API_BASE_URL=https://your-vercel-app.vercel.app
```

## 🚀 Deployment Steps

### Step 1: Deploy Backend to Vercel

The backend lives in the `api/` directory and is deployed as serverless Node.js functions using the configuration in `vercel.json`.

#### 1.1 Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

#### 1.2 (Optional) Run the API locally
```bash
# Launch the Express wrapper that adapts the Vercel handlers
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' npm run api:dev
```

#### 1.3 Deploy Serverless Functions
```bash
vercel --prod
```

#### 1.4 Set Environment Variables
In the Vercel project → Settings → Environment Variables, add `GOOGLE_CREDENTIALS_JSON` or the individual `GOOGLE_*` keys.

#### 1.5 Test Backend
```bash
# Health check
curl https://your-vercel-api.vercel.app/api/health

# Agricultural indices
curl "https://your-vercel-api.vercel.app/api/agricultural-indices?index=ndvi"
```

### Step 2: Deploy Frontend to Firebase

#### 2.1 Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

#### 2.2 Initialize Firebase Project
```bash
firebase init hosting
# Select your Firebase project
# Set public directory to "dist"
# Configure as single-page app: Yes
```

#### 2.3 Update API Configuration
Update the API base URL in your frontend:

```typescript
// In src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
```

#### 2.4 Deploy Frontend
```bash
# Quick deploy
./deploy-firebase.sh

# Or manually
npm run build
firebase deploy --only hosting
```

## 🔄 Quick Deploy Commands

```bash
# Deploy backend to Vercel
vercel --prod

# Deploy frontend to Firebase
npm run build && firebase deploy --only hosting

# Deploy both (if scripts exist)
vercel --prod && ./deploy-firebase.sh
```

## 🧪 Testing Your Deployment

### Backend API Tests
```bash
# Health check
curl https://your-vercel-api.vercel.app/api/health

# Earth Engine data
curl "https://your-vercel-api.vercel.app/api/agricultural-indices?index=ndvi&start=2024-01-01&end=2024-12-31"

# All indices
curl "https://your-vercel-api.vercel.app/api/agricultural-indices"
```

### Frontend Tests
1. Visit your Firebase hosting URL
2. Check browser console for API errors
3. Test the agricultural indices functionality
4. Verify map loading and data display

## 🛠️ Troubleshooting

### Common Issues

#### 1. CORS Errors
- Ensure CORS is properly configured in API functions
- Check that Firebase domain is whitelisted
- Verify API base URL is correct

#### 2. API Not Found (404)
- Verify Vercel deployment is successful
- Check that environment variables are set correctly
- Ensure API routes are properly configured

#### 3. Earth Engine Authentication Failed
- Verify Google Cloud credentials are correct
- Check that Earth Engine API is enabled
- Ensure service account has proper permissions

#### 4. Build Failures
- Check Node.js version compatibility
- Verify all dependencies are installed
- Review build logs for specific errors

### Debugging Commands

```bash
# Check Vercel deployment status
vercel ls

# View Vercel logs
vercel logs

# Check Firebase deployment
firebase hosting:channel:list

# Test API locally
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' npm run api:dev
curl http://127.0.0.1:3000/api/health
```

## 📊 Project Structure

```
├── api/                          # Vercel serverless functions (Node.js backend)
├── src/                         # React frontend
│   ├── components/              # React components
│   ├── hooks/                   # Custom React hooks
│   ├── services/                # API services
│   └── types/                   # TypeScript types
├── public/                      # Static assets
├── dist/                        # Built frontend (generated)
├── scripts/                     # Deployment helpers
│   ├── deploy-firebase.sh       # Frontend deployment helper
│   └── deploy-vercel.sh         # Backend deployment helper
└── package.json                 # Dependencies and scripts
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit sensitive credentials
2. **CORS Configuration**: Only allow necessary origins
3. **API Rate Limiting**: Consider implementing rate limiting
4. **HTTPS**: Both platforms provide HTTPS by default

## 💰 Cost Optimization

### Vercel
- Monitor function execution time
- Optimize cold start performance
- Consider Pro plan for production

### Firebase
- Monitor bandwidth usage
- Optimize bundle size
- Use Firebase CDN effectively

## 📈 Monitoring and Maintenance

### Vercel Monitoring
- Check Vercel dashboard for server performance
- Monitor API response times
- Set up alerts for errors

### Firebase Monitoring
- Monitor hosting performance
- Check for build failures
- Review usage analytics

## 🎯 Final Result

- **Frontend**: https://your-firebase-app.web.app (Firebase Hosting)
- **Backend**: https://your-vercel-api.vercel.app (Vercel Node.js functions)
- **Total Cost**: $0 (Free tiers)

## 📞 Support and Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Earth Engine Documentation](https://developers.google.com/earth-engine)
- [Project Repository](https://github.com/your-repo)

---

**Note**: This setup provides a scalable, production-ready architecture with the server and frontend separated for better performance and maintainability.