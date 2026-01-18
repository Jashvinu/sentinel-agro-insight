# Coding Conventions

**Analysis Date:** 2026-01-18

## Naming Patterns

**Files:**
- PascalCase for React components: `DashboardKPIs.tsx`, `FieldMap.tsx`, `AIFieldReport.tsx`
- camelCase + "Service" suffix for services: `waterMetricsService.ts`, `yieldPredictionService.ts`, `diagnosticService.ts`
- use* prefix for hooks: `useAuth.ts`, `useWaterMetrics.ts`, `useAutoSync.ts`
- kebab-case for UI components: `button.tsx`, `card.tsx`, `dropdown-menu.tsx`
- kebab-case for route handlers: `agriculturalIndices.ts`, `advancedMonitoring.ts`

**Functions:**
- camelCase for all functions: `formatDate()`, `calculateDistance()`, `buildApiUrl()`
- Present tense for boolean checks: `isEmpty()`, `isValidEmail()`, `isEeInitialized()`
- Verb-noun pattern: `deepClone()`, `debounce()`, `generateId()`
- No special prefix for async functions (just use `async` keyword)
- Event handlers: `handleEventName` pattern (`handleClick`, `handleSubmit`)

**Variables:**
- camelCase for variables
- UPPER_SNAKE_CASE for constants: `MAX_RETRIES`, `API_BASE_URL`, `FIELD_BOUNDARIES`
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces (no I prefix): `User`, `Farm`, `ApiResponse`
- PascalCase for type aliases: `UserConfig`, `ResponseData`, `DiagnosticIndex`
- Discriminated unions: `type Algorithm = 'optram_moisture' | 'sar_moisture_change' | ...`

## Code Style

**Formatting:**
- 2-space indentation (consistent across all files)
- Trailing commas in multiline objects/arrays
- Semicolons on all statements
- Single quotes for imports and TypeScript strings
- Double quotes in JSX attributes (React standard)
- Template literals for dynamic strings

**Linting:**
- ESLint with eslint.config.js (modern flat config format, ESLint 9.x)
- Plugins: @eslint/js, typescript-eslint, react-hooks, react-refresh
- Rules disabled: @typescript-eslint/no-unused-vars: "off"
- Run: `npm run lint`, `npm run lint:fix`

**No Prettier Config:**
- No .prettierrc file in project root
- Code style appears manual or editor-enforced

## Import Organization

**Order:**
1. External packages (react, express, etc.)
2. Internal modules (@/lib, @/components, @/services)
3. Relative imports (., ..)
4. Type imports (import type {})

**Grouping:**
- Blank lines between groups
- Alphabetical within each group (informal - not enforced)

**Path Aliases:**
- `@/` maps to `src/` (configured in vite.config.ts and tsconfig.json)
- Example: `import { API_ENDPOINTS } from '@/constants'`

## Error Handling

**Patterns:**
- Try-catch blocks with typed errors: `catch (error: any)` or `catch (error as Error)`
- Throw errors at service layer, catch at UI layer
- Custom error classes: `export class ApiException extends Error`
- Retry logic with exponential backoff: `export async function retry<T>(...)`

**Error Types:**
- Throw on invalid input, missing dependencies, invariant violations
- Return null/undefined for expected failures (e.g., cache miss)
- Log error with context before throwing: `console.error('[Service] Error:', error)`

## Logging

**Framework:**
- Console output only (no structured logging library)
- Levels: console.log(), console.warn(), console.error()

**Patterns:**
- Tagged with scope: `[ApiService]`, `[Server]`, `[Auth]`
- Example: `console.log('[useAutoSync] 🔄 Starting background sync...')`
- 95+ console statements throughout codebase (should be replaced with logging service)

## Comments

**When to Comment:**
- Explain why, not what: `// Retry 3 times because API has transient failures`
- Document business rules: `// Users must verify email within 24 hours`
- Explain non-obvious algorithms or workarounds
- Avoid obvious comments: `// set count to 0`

**JSDoc/TSDoc:**
- Used for complex functions
- Example: `/** * Diagnostic Service ... */` at top of files
- Not consistently used throughout codebase

**TODO Comments:**
- Format: `// TODO: description` (no username)
- Examples found: `// TODO: calculate from collection`, `// TODO: implement database cache lookup`

## Function Design

**Size:**
- Keep under 50 lines (not always followed - some functions 100+ lines)
- Extract helpers for complex logic

**Parameters:**
- Strict TypeScript: All parameters explicitly typed
- Return types specified: `(date: Date | string): string`
- Generic types used: `<T>`, `Record<string, ...>`

**Return Values:**
- Explicit return statements
- Return early for guard clauses
- Arrow functions preferred: `const formatDate = (date: Date | string): string => { ... }`

## Module Design

**Exports:**
- Named exports preferred
- Default exports for React components (not consistent)
- Export public API from index.ts barrel files (not widely used)

**Barrel Files:**
- Not widely used in this codebase
- Most imports are direct file imports

---

*Convention analysis: 2026-01-18*
*Update when patterns change*
