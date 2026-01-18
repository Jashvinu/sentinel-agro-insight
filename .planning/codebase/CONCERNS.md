# Codebase Concerns

**Analysis Date:** 2026-01-18

## Tech Debt

**FieldMap.tsx excessive complexity:**
- Issue: Single component with 1,499 lines, 18 React hooks, complex state management
- Files: `src/components/features/map/FieldMap.tsx`
- Why: Incremental feature additions during MVP development
- Impact: Hard to test, difficult to debug, performance risks from excessive re-renders
- Fix approach: Extract into smaller components (MapControls, LayerSelector, VectorEditor, AlgorithmPanel), move business logic to custom hooks

**Dual storage mechanisms without sync:**
- Issue: Two separate localStorage keys for farm data (`savedPolygons` and `sentinel_farms`) with no synchronization
- Files: `src/services/farmService.ts` (localStorage['sentinel_farms']), `src/components/features/map/FieldMap.tsx` (localStorage['savedPolygons'])
- Why: Different features added at different times, no unified data layer
- Impact: Data inconsistencies, user confusion, difficult to maintain
- Fix approach: Consolidate to single source of truth in Supabase, use localStorage only as read-through cache

**Hardcoded test data in production code:**
- Issue: "Jash farm" coordinates hardcoded in multiple files, default farms in components
- Files: `src/hooks/useAbeFarm.ts:13-26`, `src/components/features/map/FieldMap.tsx:363-375`, `src/constants/index.ts` (FIELD_BOUNDARIES)
- Why: Development convenience during prototyping
- Impact: Test data appears in production, confuses new users
- Fix approach: Move to environment-specific config files, use seed data scripts for development

**95+ console.log statements:**
- Issue: Console logging scattered throughout codebase instead of structured logging service
- Files: Throughout src/, server/src/, supabase/functions/
- Why: Quick debugging during development
- Impact: No log levels, no filtering, clutters production console, no centralized monitoring
- Fix approach: Replace with structured logging library (pino for Node.js, console wrapper for Deno), add log levels and context

**Unsafe JSON parsing without error handling:**
- Issue: 8 instances of JSON.parse() without try-catch blocks
- Files: `src/services/farmService.ts`, `src/components/features/map/FieldMap.tsx`, localStorage access patterns
- Why: Assumed valid JSON from localStorage/API responses
- Impact: App crashes with white screen when corrupted data encountered
- Fix approach: Wrap all JSON.parse() in try-catch with fallback to default values, use Zod for runtime validation

**49 instances of 'any' type:**
- Issue: TypeScript `any` type used instead of proper typing, bypasses type safety
- Files: Throughout codebase (services, components, API handlers)
- Why: Quick development, complex Earth Engine API types
- Impact: Loss of type safety, runtime errors not caught at compile time
- Impact: Reduces IDE autocomplete, makes refactoring dangerous
- Fix approach: Replace with proper types, use `unknown` + type guards where type truly unknown, create Earth Engine type definitions

## Known Bugs

**Memory leaks in timers:**
- Symptoms: Browser memory usage increases over time with map open
- Trigger: Auto-sync interval timers, Leaflet map re-renders
- Files: `src/hooks/useAutoSync.ts` (setInterval without cleanup), `src/components/features/map/FieldMap.tsx`
- Workaround: Refresh page periodically
- Root cause: useEffect timers not cleaned up in return function
- Fix: Add cleanup in useEffect return: `return () => clearInterval(timer)`

**TODO comments indicating incomplete work:**
- Symptoms: Features partially implemented, placeholders in production code
- Files: `server/src/routes/advancedMonitoring.ts` ("TODO: calculate from collection"), `supabase/functions/advanced-monitoring/index.ts` ("TODO: implement database cache lookup")
- Impact: Features return hardcoded values, caching not implemented
- Fix: Complete implementations or remove incomplete features

## Security Considerations

**CRITICAL: Exposed credentials in .env file:**
- Risk: `.env` file contains Google Cloud service account private key, API keys, Supabase credentials - committed to git or exposed in logs
- Files: `.env` (GOOGLE_PRIVATE_KEY, VITE_GEMINI_API_KEY, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_MAPS_API_KEY)
- Current mitigation: .env in .gitignore (but status shows "M .env" - modified file tracked)
- Recommendations:
  - Verify .env not in git history: `git log --all --full-history -- .env`
  - Rotate all exposed credentials immediately if found
  - Create .env.example template with placeholder values
  - Use secret management service (Vercel env vars, GitHub secrets) for production
  - Never log environment variables

**Missing input validation:**
- Risk: User inputs (farm coordinates, dates, algorithm parameters) not validated before processing
- Files: `src/services/farmService.ts`, `server/src/routes/agriculturalIndices.ts`, API handlers
- Current mitigation: TypeScript types provide compile-time validation only
- Recommendations: Add runtime validation with Zod schemas at API boundaries, validate coordinate ranges, sanitize user inputs

**No rate limiting:**
- Risk: Earth Engine API calls and Supabase queries have no client-side rate limiting
- Files: `src/services/api.ts`, all API endpoints
- Current mitigation: Supabase has server-side limits, but no user feedback
- Recommendations: Implement request throttling, show user-friendly rate limit messages, cache frequently requested data

## Performance Bottlenecks

**Agricultural indices endpoint:**
- Problem: Large agricultural indices endpoint performs complex Earth Engine calculations synchronously
- Files: `server/src/routes/agriculturalIndices.ts` (739 lines), `supabase/functions/agricultural-indices/index.ts`
- Measurement: No metrics captured (no monitoring configured)
- Cause: Earth Engine API calls can take 5-15 seconds for complex geometries, blocks response
- Improvement path: Implement async job queue, return job ID immediately, poll for results, cache results by farm+date+index

**FieldMap component renders:**
- Problem: 18 hooks in single component causes excessive re-renders
- File: `src/components/features/map/FieldMap.tsx`
- Measurement: No metrics captured
- Cause: State updates trigger full component re-render, Leaflet map re-initialization
- Improvement path: Memoize map instance with useRef, split into smaller components with React.memo, use React Query for data fetching to dedupe requests

**No water metrics caching:**
- Problem: Water metrics calculated on every request despite 14-day cache table
- Files: `src/services/waterMetricsService.ts`, `src/services/waterMetricsCacheService.ts`
- Measurement: No metrics captured
- Cause: Cache lookup not implemented (TODO comment in code)
- Improvement path: Implement cache-first strategy in waterMetricsService, add cache invalidation logic

## Fragile Areas

**Earth Engine initialization:**
- File: `server/src/utils/earthEngineInit.ts`, `supabase/functions/_shared/satellite-utils.ts`
- Why fragile: Requires valid Google Cloud credentials, initialization can fail silently
- Common failures: Invalid credentials, network timeouts, quota exceeded
- Safe modification: Always check `ee.data.getAuthToken()` before API calls, add retry logic with exponential backoff
- Test coverage: No tests (0 test files in codebase)

**Satellite data sync mechanism:**
- Files: `src/hooks/useAutoSync.ts`, `server/src/routes/syncSatelliteDates.ts`, `supabase/functions/sync-satellite-dates/index.ts`
- Why fragile: Runs automatically every hour, processes all farms sequentially, no error recovery
- Common failures: Earth Engine quota exceeded, network timeouts, partial farm processing
- Safe modification: Add error handling per farm (don't fail entire batch), implement resume-from-failure logic, add sync status tracking
- Test coverage: No tests

**localStorage farm management:**
- Files: `src/services/farmService.ts`, `src/components/features/map/FieldMap.tsx`
- Why fragile: Direct localStorage manipulation with no schema validation, race conditions with async Supabase
- Common failures: Corrupted JSON, quota exceeded, sync conflicts between localStorage and Supabase
- Safe modification: Always validate JSON parse with try-catch, implement conflict resolution strategy, consider removing localStorage in favor of Supabase-only
- Test coverage: No tests

## Scaling Limits

**Supabase Edge Functions timeout:**
- Current capacity: 10-second execution limit per Edge Function (Deno platform)
- Limit: Complex Earth Engine calculations can exceed timeout with large geometries or long date ranges
- Symptoms at limit: 504 Gateway Timeout errors, incomplete processing
- Scaling path: Implement async job queue with separate worker functions, break calculations into smaller chunks, cache intermediate results

**localStorage quota:**
- Current capacity: 5-10MB per domain (browser-dependent)
- Limit: Storing all farm polygons + satellite dates for large farms can exceed quota
- Symptoms at limit: QuotaExceededError exceptions, data not saved
- Scaling path: Move to Supabase-only storage, implement data pagination, compress stored JSON

**React Query cache growth:**
- Current capacity: Unbounded in-memory cache with 5-minute stale time
- Limit: Memory usage grows with long-running sessions, especially with map interactions
- Symptoms at limit: Browser slowdown, tab crashes on low-memory devices
- Scaling path: Configure cache size limits in queryClient, implement cache eviction policy, reduce stale time for map data

## Dependencies at Risk

**@google/earthengine@1.6.13:**
- Risk: Unofficial npm package, not maintained by Google, Earth Engine deprecating legacy API
- Impact: Satellite data processing breaks, entire platform non-functional
- Migration plan: Monitor for official Google Earth Engine TypeScript SDK, consider migrating to REST API directly, add circuit breaker pattern for Earth Engine failures

**express@4.18.2 in server:**
- Risk: Express used only for local development, but server/ code may drift from Supabase Edge Functions
- Impact: Development/production parity issues, bugs only in one environment
- Migration plan: Remove Express server entirely, use Supabase local development with `supabase functions serve`, consolidate all backend code to Edge Functions

## Missing Critical Features

**Zero automated tests:**
- Problem: No test framework configured (no Vitest, Jest, or @testing-library)
- Files: 217 TypeScript files, 0 test files
- Current workaround: Manual testing only
- Blocks: Confident refactoring, regression detection, CI/CD validation, onboarding contributors
- Implementation complexity: Medium - Configure Vitest, write tests for critical services (yieldPredictionService, diagnosticService, waterMetricsService), add to CI pipeline
- Priority: High - Critical services handling satellite data calculations have no safety net

**Error tracking and monitoring:**
- Problem: No error tracking service (Sentry, Bugsnag), no application monitoring
- Current workaround: User reports bugs via support, console.log debugging
- Blocks: Proactive bug detection, performance monitoring, user impact assessment
- Implementation complexity: Low - Add Sentry SDK, configure source maps, set up alerts
- Priority: High - Production errors go unnoticed until user reports

**.env.example template:**
- Problem: No .env.example file documenting required environment variables
- Current workaround: Developers guess from code or ask for .env file
- Blocks: New developer onboarding, clear documentation of required config
- Implementation complexity: Trivial - Copy .env, replace values with placeholders, add comments
- Priority: Medium - Improves developer experience

## Test Coverage Gaps

**Yield prediction algorithms:**
- What's not tested: `src/services/yieldPredictionService.ts` - yield calculation formulas, trend analysis
- Risk: Incorrect yield predictions shown to users, no validation of algorithm accuracy
- Priority: High - Core business logic
- Difficulty to test: Medium - Need test datasets with known expected outputs

**Field diagnostics grid analysis:**
- What's not tested: `src/services/diagnosticService.ts` - grid-based problem detection, index thresholds
- Risk: Incorrect diagnostic zones, false positives/negatives for field problems
- Priority: High - Users rely on diagnostics for farm decisions
- Difficulty to test: Medium - Need mock Earth Engine responses, validate grid calculations

**Satellite data processing pipeline:**
- What's not tested: `supabase/functions/_shared/satellite-utils.ts`, `optical-algorithms.ts`, `sar-algorithms.ts`
- Risk: Silent data corruption in NDVI/EVI/moisture calculations, incorrect satellite harmonization
- Priority: High - Foundation of entire platform
- Difficulty to test: High - Need Earth Engine test fixtures, complex multi-satellite data validation

**Authentication and authorization:**
- What's not tested: `src/hooks/useAuth.ts`, `src/components/ProtectedRoute.tsx`, Supabase auth flow
- Risk: Auth bypass vulnerabilities, session management bugs
- Priority: High - Security-critical
- Difficulty to test: Medium - Need Supabase auth mocking

**Water metrics caching:**
- What's not tested: `src/services/waterMetricsCacheService.ts` - cache lookup, 14-day retention logic
- Risk: Cache misses not handled, stale data served, cache never invalidated
- Priority: Medium - Performance impact
- Difficulty to test: Low - Straightforward cache logic

---

*Concerns audit: 2026-01-18*
*Update as issues are fixed or new ones discovered*
