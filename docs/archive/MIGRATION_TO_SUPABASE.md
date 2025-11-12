# Migration from Vercel to Supabase

This document outlines the migration from Vercel serverless functions to Supabase Edge Functions.

## What Changed?

### Backend/API

**Before (Vercel)**:
- Node.js serverless functions with `@vercel/node`
- Deployed to Vercel
- API endpoints at `/api/*`

**After (Supabase)**:
- Deno-based Edge Functions
- Deployed to Supabase
- API endpoints at `/functions/v1/*`

### Deployment

**Before**:
```bash
npm run deploy:vercel
```

**After**:
```bash
npm run deploy:supabase
```

### Configuration Files

**Removed**:
- ❌ `vercel.json` - Vercel configuration
- ❌ `scripts/deploy-vercel.sh` - Vercel deployment script
- ❌ `scripts/setup-vercel-env.sh` - Vercel environment setup
- ❌ `VERCEL_QUICKSTART.md` - Vercel quick start guide
- ❌ `docs/VERCEL_DEPLOYMENT_GUIDE.md` - Vercel deployment docs
- ❌ `@vercel/node` package dependency

**Added**:
- ✅ `supabase/` - Supabase configuration and Edge Functions
- ✅ `supabase/config.toml` - Supabase project configuration
- ✅ `supabase/functions/` - Edge Functions directory
- ✅ `scripts/deploy-supabase.sh` - Supabase deployment script
- ✅ `scripts/setup-supabase-env.sh` - Supabase environment setup
- ✅ `scripts/supabase-local.sh` - Local development script
- ✅ `SUPABASE_QUICKSTART.md` - Supabase quick start guide
- ✅ `docs/SUPABASE_DEPLOYMENT.md` - Comprehensive deployment docs

## Frontend Changes

### Environment Variables

**Before**:
```env
VITE_API_BASE_URL=https://your-project.vercel.app/api
```

**After**:
```env
# Production
VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1

# Local development
VITE_API_BASE_URL=http://localhost:54321/functions/v1
```

### API Service

**No changes required!** The frontend `ApiService` already uses `VITE_API_BASE_URL`, so it automatically works with Supabase after updating the environment variable.

## API Endpoints Mapping

| Vercel | Supabase |
|--------|----------|
| `/api/health` | `/functions/v1/health` |
| `/api/agricultural-indices` | `/functions/v1/agricultural-indices` |

## Edge Functions Structure

```
supabase/
├── config.toml                    # Supabase configuration
└── functions/
    ├── _shared/                   # Shared utilities
    │   ├── cors.ts               # CORS headers
    │   └── response.ts           # Response helpers
    ├── health/
    │   └── index.ts              # Health check endpoint
    └── agricultural-indices/
        └── index.ts              # Agricultural indices API
```

## Migration Steps

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Create a new project
3. Note your project reference (e.g., `abc123xyz`)

### 2. Install Supabase CLI

```bash
npm install -g supabase
# or
brew install supabase/tap/supabase
```

### 3. Setup Environment

```bash
npm run deploy:setup
```

This will prompt you to:
- Enter your Supabase project reference
- Provide Google Cloud service account credentials

### 4. Deploy Edge Functions

```bash
npm run deploy:supabase
```

### 5. Update Frontend Environment

Update `.env` or `.env.production`:

```env
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
```

### 6. Build and Deploy Frontend

```bash
npm run build
npm run firebase:deploy
# or deploy to Netlify, Cloudflare Pages, etc.
```

### 7. Test Deployment

```bash
# Health check
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/health

# Agricultural indices
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agricultural-indices?index=msavi"
```

## Code Differences

### Before: Vercel Function

```typescript
// api/health.ts
import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    res.json({ status: 'OK' });
}
```

### After: Supabase Edge Function

```typescript
// supabase/functions/health/index.ts
import { handleCors } from '../_shared/cors.ts';
import { successResponse } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  return successResponse({ status: 'OK' });
});
```

## Benefits of Supabase

✅ **Unified Platform**: Database, auth, storage, and Edge Functions in one place
✅ **Deno Runtime**: Modern, secure, TypeScript-first runtime
✅ **Built-in Features**: Real-time subscriptions, database access (if needed)
✅ **Generous Free Tier**: 500K Edge Function invocations/month
✅ **Local Development**: Full local testing with Docker
✅ **Performance**: Fast cold starts with Deno

## Local Development

### Start Supabase Locally

```bash
# Start all services (requires Docker)
npm run supabase:start

# Services will be available at:
# - API: http://localhost:54321
# - Studio: http://localhost:54323
# - Edge Functions: http://localhost:54321/functions/v1
```

### Update Local Environment

Create `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:54321/functions/v1
```

### Test Locally

```bash
# Terminal 1: Supabase is running
npm run supabase:start

# Terminal 2: Frontend
npm run dev

# Terminal 3: Test Edge Functions
curl http://localhost:54321/functions/v1/health
```

## Troubleshooting

### Issue: "Supabase CLI not found"

**Solution**: Install the CLI
```bash
npm install -g supabase
```

### Issue: "Docker not running"

**Solution**: Start Docker Desktop before running `supabase start`

### Issue: "Earth Engine authentication fails"

**Solution**: 
1. Check secrets are set: `supabase secrets list --project-ref your-ref`
2. Verify service account has Earth Engine access
3. Ensure private key newlines are preserved

### Issue: "CORS errors"

**Solution**: Edge Functions include CORS headers by default. Check browser console for specific errors.

## Rollback (If Needed)

If you need to rollback to Vercel:

1. Restore deleted files from git history:
   ```bash
   git checkout HEAD~1 vercel.json
   git checkout HEAD~1 scripts/deploy-vercel.sh
   ```

2. Reinstall Vercel dependency:
   ```bash
   npm install --save-dev @vercel/node
   ```

3. Update environment:
   ```env
   VITE_API_BASE_URL=https://your-project.vercel.app/api
   ```

4. Deploy:
   ```bash
   vercel --prod
   ```

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Edge Functions Guide**: https://supabase.com/docs/guides/functions
- **GitHub Issues**: Open an issue for help

---

**Migration Complete!** 🎉

Your application is now running on Supabase Edge Functions.


