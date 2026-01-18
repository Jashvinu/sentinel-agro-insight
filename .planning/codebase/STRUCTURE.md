# Codebase Structure

**Analysis Date:** 2026-01-18

## Directory Layout

```
sentinel-agro-insight-1/
├── src/                           # Frontend React application
│   ├── components/                # React components
│   │   ├── features/              # Feature-specific components
│   │   ├── layout/                # Layout components
│   │   └── ui/                    # Reusable Radix UI components
│   ├── pages/                     # Route-level page components
│   ├── services/                  # Business logic services
│   ├── hooks/                     # Custom React hooks
│   ├── types/                     # TypeScript type definitions
│   ├── constants/                 # Centralized configuration
│   ├── utils/                     # Utility functions
│   ├── lib/                       # Third-party lib configurations
│   └── main.tsx                   # React DOM entry point
│
├── server/                        # Express.js development server
│   ├── src/
│   │   ├── routes/                # API route handlers
│   │   ├── shared/                # Shared utilities
│   │   ├── utils/                 # Helper utilities
│   │   └── index.ts               # Express server entry point
│   └── package.json
│
├── supabase/                      # Supabase configuration
│   ├── functions/                 # Deno Edge Functions (production API)
│   │   ├── _shared/               # Shared utilities for all functions
│   │   ├── agricultural-indices/
│   │   ├── advanced-monitoring/
│   │   └── [other functions]
│   ├── migrations/                # PostgreSQL schema migrations
│   ├── config.toml                # Supabase local dev configuration
│   └── .env                       # Environment variables
│
├── functions/                     # Firebase Cloud Functions
│   └── package.json
│
├── public/                        # Static assets
├── dist/                          # Built frontend (generated)
├── scripts/                       # Deployment and setup scripts
├── .github/workflows/             # GitHub Actions CI/CD
├── vite.config.ts                 # Vite bundler configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
├── firebase.json                  # Firebase Hosting config
├── package.json                   # Frontend dependencies
└── .env                           # Environment variables (local)
```

## Directory Purposes

**src/**
- Purpose: Frontend React application source code
- Contains: Components, pages, services, hooks, types, utils, constants
- Key files: `main.tsx` (entry point), `App.tsx` (root component)
- Subdirectories: components/, pages/, services/, hooks/, types/, constants/, utils/, lib/

**src/components/features/**
- Purpose: Feature-specific components organized by feature area
- Contains: dashboard/, map/, advanced-monitoring/, diagnostics/
- Key files: `DashboardKPIs.tsx`, `FieldMap.tsx`, `AlgorithmSelector.tsx`, `DiagnosticMap.tsx`
- Subdirectories: Each feature has its own directory

**src/components/ui/**
- Purpose: Reusable Radix UI-based components
- Contains: button.tsx, card.tsx, badge.tsx, dialog.tsx, dropdown-menu.tsx, input.tsx, tabs.tsx, tooltip.tsx, skeleton.tsx, progress.tsx, toast.tsx
- Key files: All lowercase kebab-case component files
- Subdirectories: None (flat structure)

**src/services/**
- Purpose: Business logic services and API communication
- Contains: api.ts, supabase.ts, waterMetricsService.ts, yieldPredictionService.ts, diagnosticService.ts, farmService.ts, advancedMonitoringService.ts, sessionCacheService.ts, waterMetricsCacheService.ts
- Key files: `api.ts` (API client), `supabase.ts` (Supabase client init)
- Subdirectories: None

**src/hooks/**
- Purpose: Custom React hooks
- Contains: useAutoSync.ts, useAuth.ts, useWaterMetrics.ts, useWeather.ts, useSessionCache.ts, useAbeFarm.ts, useToast.ts
- Key files: All hooks prefixed with `use*`
- Subdirectories: None

**server/src/**
- Purpose: Express.js development server
- Contains: index.ts (entry point), routes/ (API handlers), shared/ (satellite utils), utils/ (Earth Engine init, response helpers)
- Key files: `index.ts`, `routes/agriculturalIndices.ts`, `routes/advancedMonitoring.ts`
- Subdirectories: routes/, shared/, utils/

**supabase/functions/**
- Purpose: Deno Edge Functions for production API
- Contains: _shared/ (common utilities), agricultural-indices/, advanced-monitoring/, sync-satellite-dates/, farm-timeline/, get-available-dates/, health/
- Key files: Each function has `index.ts` entry point
- Subdirectories: One directory per Edge Function

**supabase/functions/_shared/**
- Purpose: Shared utilities for all Edge Functions
- Contains: cors.ts, response.ts, satellite-utils.ts, optical-algorithms.ts, sar-algorithms.ts, sensor-fusion.ts, trend-analysis.ts, window-manager.ts, hls-harmonization.ts
- Key files: All reusable algorithm and utility modules
- Subdirectories: None

## Key File Locations

**Entry Points:**
- `src/main.tsx` - React DOM entry point
- `src/App.tsx` - Root component, routing setup
- `server/src/index.ts` - Express server entry point
- `supabase/functions/*/index.ts` - Individual Edge Function handlers

**Configuration:**
- `vite.config.ts` - Vite bundler configuration
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `firebase.json` - Firebase Hosting and Cloud Functions configuration
- `supabase/config.toml` - Supabase local dev configuration
- `components.json` - Shadcn/ui component configuration
- `.env` - Environment variables

**Core Logic:**
- `src/services/*` - Business services
- `src/hooks/*` - React hooks
- `server/src/routes/*` - Backend routes
- `supabase/functions/_shared/*` - Shared algorithms

**Testing:**
- None configured (no test files found)

**Documentation:**
- `CLAUDE.md` - Claude Code instructions
- `ADVANCED_MONITORING_DEPLOYMENT.md` - Deployment guide

## Naming Conventions

**Files:**
- PascalCase for React components: `DashboardKPIs.tsx`, `FieldMap.tsx`
- camelCase + "Service" suffix: `waterMetricsService.ts`, `yieldPredictionService.ts`
- use* prefix for hooks: `useAuth.ts`, `useWaterMetrics.ts`
- kebab-case for UI components: `button.tsx`, `card.tsx`, `dropdown-menu.tsx`
- kebab-case for route handlers: `agriculturalIndices.ts`, `advancedMonitoring.ts`

**Directories:**
- kebab-case for feature directories: `advanced-monitoring/`, `dashboard/`, `map/`
- Plural for collections: `components/`, `services/`, `hooks/`, `routes/`

**Special Patterns:**
- `index.ts` for directory exports or entry points
- `*.test.ts` for test files (none currently exist)

## Where to Add New Code

**New Feature:**
- Primary code: `src/components/features/{feature-name}/`
- Services: `src/services/{feature}Service.ts`
- Hooks: `src/hooks/use{Feature}.ts`
- Types: `src/types/index.ts` or `src/types/{feature}.ts`

**New Page:**
- Implementation: `src/pages/{PageName}.tsx`
- Route: Add to `src/App.tsx` router configuration

**New API Endpoint:**
- Development: `server/src/routes/{endpoint-name}.ts`
- Production: `supabase/functions/{endpoint-name}/index.ts`
- Shared logic: `supabase/functions/_shared/{utility}.ts`

**New UI Component:**
- Reusable component: `src/components/ui/{component-name}.tsx`
- Feature-specific: `src/components/features/{feature}/{ComponentName}.tsx`

**Utilities:**
- Shared helpers: `src/utils/index.ts`
- Type definitions: `src/types/index.ts`
- Constants: `src/constants/index.ts`

## Special Directories

**dist/**
- Purpose: Built frontend (generated by Vite)
- Source: Auto-generated from `npm run build`
- Committed: No (.gitignore)

**node_modules/**
- Purpose: npm dependencies
- Source: `npm install`
- Committed: No (.gitignore)

---

*Structure analysis: 2026-01-18*
*Update when directory structure changes*
