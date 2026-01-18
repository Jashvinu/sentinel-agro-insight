# Architecture

**Analysis Date:** 2026-01-18

## Pattern Overview

**Overall:** Separated Deployment Model (Polyglot Microservices)

**Key Characteristics:**
- Frontend: React + TypeScript + Vite (Static SPA deployed to Firebase Hosting)
- Backend: Dual-layer architecture:
  - Edge Functions: Deno/TypeScript running on Supabase (production)
  - Local Server: Express/Node.js (development/fallback for advanced monitoring)
- Database: Supabase PostgreSQL with Earth Engine integration
- Independent deployment of frontend, backend APIs, and data layers

## Layers

**Presentation Layer:**
- Purpose: User interface rendering and interaction
- Contains: React components (functional with hooks)
- Location: `src/components/`, `src/pages/`
- Depends on: Service layer for data, hook layer for state
- Used by: Browser/user

**Service Layer:**
- Purpose: Business logic and external API communication
- Contains: API client, business logic services, cache services
- Location: `src/services/*`
- Depends on: External APIs (Earth Engine, Supabase, Open-Meteo)
- Used by: React components via hooks

**Hook Layer:**
- Purpose: React state management and side effects
- Contains: Custom React hooks (useAutoSync, useAuth, useWaterMetrics, useWeather, useSessionCache, useAbeFarm, useToast)
- Location: `src/hooks/*`
- Depends on: Service layer
- Used by: React components

**API Layer:**
- Purpose: Backend endpoints for satellite data processing
- Contains: Supabase Edge Functions (Deno), Express routes (Node.js dev)
- Location: `supabase/functions/*`, `server/src/routes/*`
- Depends on: Google Earth Engine, shared utilities
- Used by: Frontend service layer

**Shared/Utility Layer:**
- Purpose: Reusable algorithms and helpers
- Contains: Satellite utils, optical algorithms, SAR algorithms, sensor fusion, trend analysis, CORS handlers, response helpers, constants
- Location: `supabase/functions/_shared/*`, `src/utils/*`, `src/constants/*`
- Depends on: External libraries only
- Used by: API layer, service layer

**Data/Integration Layer:**
- Purpose: External data sources and storage
- Contains: Google Earth Engine, Supabase PostgreSQL, Open-Meteo API, Google Maps API, Sentinel-2/Landsat/Sentinel-1 satellites
- Depends on: Nothing (external services)
- Used by: API layer, service layer

## Data Flow

**Satellite Data Request Flow:**

1. User opens Dashboard
2. App.tsx → useAutoSync() hook runs (on mount, once per hour)
3. buildApiUrl('sync-satellite-dates?months=6')
4. Resolves to: VITE_API_BASE_URL or Supabase Edge Functions URL
5. Frontend calls: POST /sync-satellite-dates
6. Supabase Edge Function (production) OR Express Server (development, localhost:3001)
7. Initialize Google Earth Engine with credentials
8. Fetch all farms from Supabase
9. For each farm: Query Sentinel-2/Landsat collections for new dates, filter by cloud cover (20%), insert new observations
10. Response: { success: true, farms_processed: N, summary: {...} }
11. Frontend toast notification (if new data found)

**Agricultural Indices Request Flow:**

1. User selects index in Dashboard (e.g., NDVI)
2. DashboardKPIs component calls API via buildApiUrl('/agricultural-indices?index=ndvi')
3. Supabase Edge Function: /agricultural-indices
4. Initialize Earth Engine, get farm geometry
5. getMergedOpticalCollection(): Fetch Sentinel-2 (B2-B12), Landsat 8/9 (SR_B2-7) bands
6. Apply scale normalization for each satellite
7. Calculate NDVI: (B8 - B4) / (B8 + B4)
8. Compute statistics (min, max, mean, stddev)
9. Generate map tile URL via Earth Engine visualization
10. Response: { satellite, urlFormat, min_value, max_value, mean_value, std_dev, data_source }
11. Frontend renders tile on Leaflet map

**State Management:**
- File-based: All persistent state in Supabase PostgreSQL
- Client-side: localStorage (farms, polygons), sessionStorage (satellite dates, auto-sync flag)
- React Query: 5-minute cache for API responses

## Key Abstractions

**Service Pattern:**
- Purpose: Encapsulate domain concerns
- Examples: `src/services/api.ts` (URL resolution, request building), `src/services/waterMetricsService.ts` (water index calculations), `src/services/yieldPredictionService.ts` (yield prediction algorithms), `src/services/diagnosticService.ts` (field problem detection), `src/services/farmService.ts` (farm CRUD operations), `src/services/advancedMonitoringService.ts` (complex satellite algorithm orchestration)
- Pattern: Static methods or exported functions

**Hook Pattern:**
- Purpose: Custom React hooks encapsulating stateful logic
- Examples: `src/hooks/useAutoSync.ts` (background sync), `src/hooks/useAuth.ts` (authentication state), `src/hooks/useWaterMetrics.ts` (water metrics fetching), `src/hooks/useWeather.ts` (weather API integration), `src/hooks/useSessionCache.ts` (client-side caching)
- Pattern: Return object with state + methods: { data, loading, error, ...methods }

**Shared Utility Pattern:**
- Purpose: Reusable algorithms across Edge Functions
- Examples: `supabase/functions/_shared/satellite-utils.ts` (multi-satellite harmonization), `supabase/functions/_shared/optical-algorithms.ts` (NDVI, EVI, SAVI formulas), `supabase/functions/_shared/sar-algorithms.ts` (Sentinel-1 VV/VH processing), `supabase/functions/_shared/sensor-fusion.ts` (merging multi-sensor data), `supabase/functions/_shared/trend-analysis.ts` (time-series trend extraction)
- Pattern: Pure functions, no side effects

**Configuration Pattern:**
- Purpose: Centralized, type-safe configuration
- Location: `src/constants/index.ts`
- Contains: API_ENDPOINTS, MAP_CONFIG, FIELD_BOUNDARIES, SATELLITE_CONFIG, AGRICULTURAL_INDICES, ALGORITHM_CONFIGS
- Pattern: Exported const objects with TypeScript types

## Entry Points

**CLI Entry:**
- Not applicable (web application)

**Frontend:**
- Location: `src/main.tsx`
- Triggers: Browser loads index.html
- Responsibilities: Render React app to DOM

**Backend (Development):**
- Location: `server/src/index.ts`
- Triggers: npm run server:dev
- Responsibilities: Initialize Express, register routes, start on port 3001

**Backend (Production):**
- Location: `supabase/functions/*/index.ts` (individual Edge Functions)
- Triggers: HTTP requests to Supabase Edge Functions
- Responsibilities: Handle satellite data requests, calculate indices, return results

## Error Handling

**Strategy:** Try-catch at service boundaries, propagate to UI for display

**Patterns:**
- Services throw Error with descriptive messages
- React components catch via try-catch or React Query error handling
- Toast notifications for user-facing errors
- Console logging for debugging (95+ instances throughout codebase)

## Cross-Cutting Concerns

**Logging:**
- Console.log for normal output, console.error for errors, console.warn for warnings
- Tagged with scope: [ApiService], [Server], [Auth]
- No structured logging service configured

**Validation:**
- Manual validation in service methods
- TypeScript types provide compile-time validation
- No runtime validation library (Zod, Yup) configured

**Authentication:**
- Supabase Auth: JWT tokens in localStorage
- ProtectedRoute wrapper checks session before rendering
- API requests include apikey + Authorization headers

---

*Architecture analysis: 2026-01-18*
*Update when major patterns change*
