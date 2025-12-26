# Backend Function Failure Analysis

## Root Cause Identified

Based on the HAR file error logs, the `get-available-dates` function is failing with:

```json
{
  "success": false,
  "error": "geoJsonToEarthEngine is not defined",
  "details": "geoJsonToEarthEngine is not defined"
}
```

## Why Functions Are Failing

### 1. Missing Import at Runtime
- **Problem**: The function imports `geoJsonToEarthEngine` from `satellite-utils.ts`, but at runtime it's not available
- **Location**: `supabase/functions/get-available-dates/index.ts:243`
- **Error**: `geoJsonToEarthEngine is not defined` when trying to convert polygon geometry

### 2. Old Deployed Version
- The currently deployed version on Supabase doesn't have:
  - The cached data fallback logic
  - The fallback implementation for `geoJsonToEarthEngine`
  - Proper error handling

### 3. Earth Engine Dependency Issues
The function tries to:
1. Authenticate with Google Earth Engine (requires credentials)
2. Query satellite data from Earth Engine (can timeout/fail)
3. Convert GeoJSON to Earth Engine geometry (fails if function not available)

If any of these steps fail, the entire function returns a 500 error.

## Fixes Applied (Local Code)

### Fix 1: Added Fallback for geoJsonToEarthEngine
```typescript
import * as satelliteUtils from '../_shared/satellite-utils.ts';
const geoJsonToEarthEngine = satelliteUtils.geoJsonToEarthEngine || ((geometry: any) => {
  if (geometry.type === 'Polygon') {
    return ee.Geometry.Polygon(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    return ee.Geometry.MultiPolygon(geometry.coordinates);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
});
```

### Fix 2: Cached Data First Approach
- Function now checks database for cached observations first
- Only queries Earth Engine if:
  - No cached data exists, OR
  - `force_refresh=true` is explicitly requested
- Falls back to cached data if Earth Engine fails

### Fix 3: Better Error Handling
- If Earth Engine credentials are missing → Use cached data if available
- If Earth Engine query fails → Use cached data if available
- Only throws error if no cached data AND Earth Engine fails

## Current Status

### ✅ Working Functions
- `get-observation-dates` - ✅ Working (database-only, no Earth Engine)
- `agricultural-indices` - ✅ Working (returns 200, can take 15-25 seconds)
- `health` - ✅ Working

### ❌ Failing Functions
- `get-available-dates` - ❌ Returns 500 error
  - **Reason**: `geoJsonToEarthEngine is not defined` at runtime
  - **Fix**: Added fallback implementation (needs deployment)

### ⚠️ Partial Issues
- `agricultural-indices` with `sar_moisture` - Returns 404 (no data available for those dates, expected)
- Some Google AI API calls - Returns 403 (IP restriction on API key, not critical)

## Solution

### Immediate Fix (Already Applied in Code)
1. ✅ Added `geoJsonToEarthEngine` fallback implementation
2. ✅ Added cached data-first approach
3. ✅ Added error handling with fallbacks
4. ✅ Frontend now uses `get-observation-dates` instead (working)

### Next Steps - Deploy Fixed Function
```bash
# Deploy the fixed get-available-dates function
supabase functions deploy get-available-dates
```

After deployment, the function will:
- ✅ Use cached database data first (fast, reliable)
- ✅ Only query Earth Engine when needed
- ✅ Have fallback implementation for geometry conversion
- ✅ Handle errors gracefully without returning 500

## Why This Happened

The deployed version of `get-available-dates` has a bug where:
1. It imports `geoJsonToEarthEngine` but the import doesn't resolve at runtime
2. It always tries to query Earth Engine (even when cached data exists)
3. If Earth Engine credentials are missing or queries fail, it throws an error instead of using cached data

The fixes ensure the function is more resilient and doesn't fail when Earth Engine is unavailable.





