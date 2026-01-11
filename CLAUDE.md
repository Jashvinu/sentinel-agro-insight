# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project: Sentinel Agro Insight

Precision agriculture platform monitoring crop health with Sentinel-2 satellite imagery and Google Earth Engine.

## Commands

**Development:**
- `npm run dev` - Start frontend dev server (port 8080)
- `npm run server:dev` - Start backend dev server (port 3001, for advanced-monitoring)
- `npm run supabase:start` - Start local Supabase (requires Docker)
- `npm run supabase:functions` - Serve Supabase Edge Functions locally

**Build & Quality:**
- `npm run build` - Build frontend for production
- `npm run build:dev` - Build with development mode
- `npm run type-check` - TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically

**Deployment:**
- `npm run deploy:setup` - Setup Supabase environment variables
- `npm run deploy:supabase` - Deploy Edge Functions to Supabase
- `npm run firebase:deploy` - Deploy frontend to Firebase Hosting

## Architecture

### Separated Deployment Model
- **Frontend**: React + TypeScript + Vite → Firebase Hosting (or any static host)
- **Backend**: Deno Edge Functions → Supabase Edge Functions
- Frontend calls Supabase Edge Functions directly via REST API

### API Communication
- Frontend resolves API base URL via `resolveApiBaseUrl()` in `src/services/api.ts`
- Priority: `VITE_API_BASE_URL` → `VITE_SUPABASE_URL/functions/v1` → fallback
- Authentication uses `VITE_SUPABASE_ANON_KEY` in headers (`apikey` + `Authorization`)
- Advanced monitoring uses local server in dev (`http://127.0.0.1:3001`)

### Directory Structure
```
src/
├── components/
│   ├── features/        # Feature-specific components
│   ├── layout/          # Layout components
│   └── ui/              # Reusable UI components (Radix-based)
├── constants/           # All configuration constants (API endpoints, maps, indices)
├── hooks/               # React hooks (useAutoSync, etc.)
├── pages/               # Route pages (Dashboard, YieldPrediction, etc.)
├── services/            # API services and Supabase client
├── types/               # TypeScript type definitions
└── utils/               # Utility functions

supabase/functions/
├── _shared/             # Shared utilities (CORS, response helpers, algorithms)
├── agricultural-indices/
├── advanced-monitoring/
├── farm-timeline/
├── get-available-dates/
├── health/
└── sync-satellite-dates/
```

### Key Services
- **api.ts**: API client with URL resolution, retry logic, Supabase auth headers
- **supabase.ts**: Supabase client initialization
- **waterMetricsService.ts** + **waterMetricsCacheService.ts**: Water metrics with 14-day caching
- **yieldPredictionService.ts**: Yield prediction calculations
- **advancedMonitoringService.ts**: Advanced satellite algorithms (OPTRAM, SAR fusion)

### Constants-Driven Configuration
All configuration lives in `src/constants/index.ts`:
- `API_ENDPOINTS`: Supabase Edge Function endpoints (no /api prefix)
- `MAP_CONFIG`: Leaflet map defaults
- `FIELD_BOUNDARIES`: POI coordinates
- `SATELLITE_CONFIG`: Sentinel-2 collection, bands, date ranges
- `AGRICULTURAL_INDICES`: NPK, salinity, pH, moisture, carbon, vegetation formulas
- `ALGORITHM_CONFIGS`: Advanced monitoring algorithm metadata
- Use these constants instead of hardcoding values

### Supabase Edge Functions
- Written in Deno (TypeScript)
- Use `_shared/cors.ts` for CORS handling
- Use `_shared/response.ts` for consistent responses
- Use `_shared/satellite-utils.ts` for Earth Engine operations
- Advanced algorithms in `_shared/optical-algorithms.ts`, `_shared/sar-algorithms.ts`, `_shared/sensor-fusion.ts`

### Auto-Sync Mechanism
- `useAutoSync` hook runs on app load
- Syncs satellite observations via `sync-satellite-dates` endpoint
- Syncs water metrics cache for all farms
- Runs once per hour (sessionStorage-based)
- Silently fails to not interrupt UX

## Environment Variables

Required variables in `.env` or `.env.production`:
- `VITE_API_BASE_URL`: Supabase Edge Functions URL (e.g., `https://xxx.supabase.co/functions/v1`)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key for auth
- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps API key
- `VITE_GEMINI_API_KEY`: Gemini API key for AI features

Google Cloud credentials (for Supabase Edge Functions):
- `GOOGLE_PROJECT_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CLIENT_EMAIL`
- Or `GOOGLE_CREDENTIALS_JSON` (full service account JSON)

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **UI Components**: Radix UI, Lucide icons, Recharts
- **Maps**: Leaflet, react-leaflet
- **Backend**: Deno, Supabase Edge Functions
- **Satellite Data**: Google Earth Engine, Sentinel-2, Landsat 8/9, Sentinel-1 SAR
- **Auth**: Supabase Auth
- **Hosting**: Firebase Hosting (frontend), Supabase (backend)

## Code Style
- Use functional React components with hooks
- Strictly type all props and state interfaces
- Use constants from `src/constants/index.ts` for configuration
- Avoid inline styles; use Tailwind utility classes
- Use `@/` alias for imports (resolves to `src/`)
- CORS responses required for all Supabase Edge Functions

## Important Guidelines

1. **Think Before Changes**: Read relevant files before making changes. If the user references a file, read it first.
2. **Check In Before Major Changes**: Verify the plan with the user before major changes.
3. **High-Level Explanations**: Give concise summaries of changes at each step.
4. **Simplicity**: Keep changes minimal and focused. Impact as l/ittle code as possible.
5. **No Speculation**: Never speculate about code you haven't opened. Investigate files before answering questions.
6. **Grounded Answers**: Give hallucination-free, evidence-based answers.
