# External Integrations

**Analysis Date:** 2026-01-18

## APIs & External Services

**Satellite Data & Earth Engine:**
- Google Earth Engine API - Sentinel-2, Landsat 8/9, Sentinel-1 SAR imagery access
  - Integration method: Earth Engine Python/JS SDK via npm:@google/earthengine@1.6.13
  - Auth: Service account credentials (GOOGLE_PROJECT_ID, GOOGLE_PRIVATE_KEY, GOOGLE_CLIENT_EMAIL)
  - Files: `src/services/api.ts`, `server/src/index.ts`, `supabase/functions/agricultural-indices/index.ts`
  - Project: wrkfarm-415118

**Geospatial Services:**
- Google Maps API - Geocoding, Places API, Drawing Manager for polygon drawing
  - Files: `src/pages/DrawPolygon.tsx`
  - Auth: API key in VITE_GOOGLE_MAPS_API_KEY env var
  - Features: Polygon drawing, geocoding, maps visualization

**Weather Data:**
- Open-Meteo API - Free weather forecasting (no API key required)
  - Endpoint: https://api.open-meteo.com/v1/forecast
  - File: `src/hooks/useWeather.ts`
  - Integration method: REST API via open-meteo npm package
  - Variables: Temperature, precipitation, wind speed, cloud cover, weather codes
  - Cache: 5-minute client-side cache

**AI Services:**
- Google Gemini API - AI-powered field reporting and analysis
  - File: `src/components/features/dashboard/AIFieldReport.tsx`
  - Models: gemini-1.5-flash, gemini-1.5-pro
  - API Version: v1
  - Auth: API key in VITE_GEMINI_API_KEY env var
  - Status: Temporarily disabled in Dashboard

## Data Storage

**Databases:**
- Supabase PostgreSQL - Primary data store
  - Connection: via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars
  - Client: @supabase/supabase-js v2.86.0
  - Files: `src/services/supabase.ts`
  - Tables: farms, observations, water_metrics_cache, advanced_monitoring_*

**File Storage:**
- None currently (no file upload features implemented)

**Caching:**
- Client-side: localStorage and sessionStorage
- Database: water_metrics_cache table (14-day retention)
- React Query: 5-minute stale time, 10-minute garbage collection

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - Email/password authentication
  - Implementation: Supabase client SDK
  - Token storage: Browser localStorage (persistSession: true)
  - Session management: JWT refresh tokens handled automatically (autoRefreshToken: true)
  - Files: `src/hooks/useAuth.ts`, `src/components/ProtectedRoute.tsx`

**OAuth Integrations:**
- None currently configured

## Monitoring & Observability

**Error Tracking:**
- Not configured - No Sentry or error tracking service

**Analytics:**
- Not configured - No analytics service

**Logs:**
- Console output only (95+ console.log/warn/error statements throughout codebase)
  - Tagged with scope: [ApiService], [Server], [Auth]
  - Levels: console.log(), console.warn(), console.error()

## CI/CD & Deployment

**Hosting:**
- Firebase Hosting - Frontend static hosting
  - Deployment: Automatic via GitHub Actions on main branch push
  - Environment vars: Configured in project settings
  - Workflows: `.github/workflows/firebase-hosting-merge.yml`, `.github/workflows/firebase-hosting-pull-request.yml`

**CI Pipeline:**
- GitHub Actions - Automated deployment (no tests)
  - Workflows: firebase-hosting-pull-request.yml, firebase-hosting-merge.yml
  - Secrets: Firebase token in GitHub secrets

## Environment Configuration

**Development:**
- Required env vars: VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_MAPS_API_KEY
- Secrets location: .env file (gitignored)
- Backend: Local Express server (http://127.0.0.1:3001) or Supabase local dev

**Staging:**
- Not separately configured - Uses production Supabase

**Production:**
- Secrets management: Environment variables in Firebase/Vercel dashboard
- Database: Supabase production project
- Functions: Supabase Edge Functions (Deno)

## Webhooks & Callbacks

**Incoming:**
- None currently implemented

**Outgoing:**
- None currently implemented

---

*Integration audit: 2026-01-18*
*Update when adding/removing external services*
