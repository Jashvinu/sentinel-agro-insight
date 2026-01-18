# Technology Stack

**Analysis Date:** 2026-01-18

## Languages

**Primary:**
- TypeScript 5.8 - All application code (`package.json`, `tsconfig.json`)
- JavaScript (ES Modules) - Build scripts, configuration (`"type": "module"` in `package.json`)

**Secondary:**
- Deno/TypeScript - Supabase Edge Functions runtime

## Runtime

**Environment:**
- Node.js >= 18.0.0 - Frontend and Express server (`package.json` engines field)
- Deno - Supabase Edge Functions
- Firebase Cloud Functions (Node 18) - `firebase.json` runtime configuration

**Package Manager:**
- npm >= 8.0.0 - `package.json` engines field
- Lockfile: npm lockfile v3 - `package-lock.json`

## Frameworks

**Core:**
- React 18.3.1 - UI framework
- React Router DOM 6.30.1 - Client-side routing (`src/App.tsx`)
- Express.js 4.18.2 - Local development server (`server/package.json`, `server/src/index.ts`)

**Testing:**
- Not configured - No test framework installed

**Build/Dev:**
- Vite 5.4.19 - Build tool and dev server (`vite.config.ts`)
- @vitejs/plugin-react-swc 3.11.0 - Fast React compilation with SWC
- TypeScript Compiler (tsc) - Type checking and compilation
- tsx 4.19.0 - TypeScript execution for Node.js scripts
- PostCSS 8.5.6 - CSS processing
- Tailwind CSS 3.4.17 - Utility-first CSS framework

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.86.0 - Database, Auth, Edge Functions client (`src/services/supabase.ts`)
- @google/earthengine 1.6.13 - Satellite imagery and geospatial analysis (`package.json`, `server/package.json`, `functions/package.json`)
- @tanstack/react-query 5.83.0 - Server state management with caching (`src/App.tsx`)

**Infrastructure:**
- Leaflet 1.9.4 - Interactive map library
- react-leaflet 4.2.1 - React wrapper for Leaflet
- @turf/turf 7.2.0 - Geospatial analysis library
- Recharts 3.6.0 - React charting library for data visualization

**UI Components:**
- Radix UI - Unstyled, accessible component primitives (Progress, Separator, Tabs, Toast, Tooltip, Dialog, Dropdown Menu)
- Lucide React 0.462.0 - Icon library
- Sonner 1.7.4 - Toast notifications
- next-themes 0.3.0 - Theme management
- Class Variance Authority 0.7.1 - CSS-in-JS variant library
- tailwind-merge 2.6.0 - Merge Tailwind CSS classes
- clsx 2.1.1 - Conditional className builder

**Geospatial:**
- @googlemaps/js-api-loader 2.0.1 - Google Maps JavaScript API loader
- @googlemaps/react-wrapper 1.2.0 - React wrapper for Google Maps
- Leaflet Draw 1.0.4 - Polygon drawing plugin

**Weather:**
- Open-Meteo 1.2.0 - Weather API client (`src/hooks/useWeather.ts`)

**Backend:**
- Firebase Admin 11.11.1 - Firebase admin SDK (`functions/package.json`)
- cors 2.8.5 - CORS middleware for Express
- dotenv 16.3.1 - Environment variable management

## Configuration

**Environment:**
- `.env` files for environment variables
- `VITE_API_BASE_URL` - API backend URL (local Express or Supabase Edge Functions)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key for client authentication
- `VITE_GOOGLE_MAPS_API_KEY` - Google Maps API key
- `VITE_GEMINI_API_KEY` - Google Gemini API key for AI features
- `GOOGLE_PROJECT_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CLIENT_EMAIL` - Google Cloud credentials

**Build:**
- `vite.config.ts` - Vite bundler configuration with React plugin and path aliases
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `firebase.json` - Firebase Hosting and Cloud Functions configuration
- `supabase/config.toml` - Local Supabase development environment
- `components.json` - Shadcn/ui component configuration
- `vercel.json` - Vercel deployment configuration

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js)
- Docker (for local Supabase)

**Production:**
- Frontend: Firebase Hosting (from `dist/` directory)
- Backend:
  - Supabase Edge Functions (Deno)
  - Firebase Cloud Functions (Node.js 18)
  - Local Express Server (development only)
- Database: Supabase PostgreSQL

---

*Stack analysis: 2026-01-18*
*Update after major dependency changes*
