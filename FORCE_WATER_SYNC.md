# Force Water Metrics Sync

## The Problem
The water distribution card is empty because:
1. Previous sync used broken logic (generating calendar dates instead of using actual observation dates)
2. Auto-sync is now throttled (won't run again for 1 hour)
3. Cache remains empty

## The Solution (2 Options)

### Option 1: Clear Session Storage (Easiest)
1. Open Browser DevTools (F12 or Cmd+Option+I)
2. Go to **Console** tab
3. Run this command:
   ```javascript
   sessionStorage.removeItem('last_satellite_sync');
   sessionStorage.removeItem('last_water_sync');
   location.reload();
   ```
4. This will force the sync to run again with the NEW fixed logic

### Option 2: Wait 1 Hour
- The sync will automatically run again after 1 hour
- When it runs, it will use the NEW logic (observation dates instead of calendar dates)

## What the Fix Does
**OLD (Broken)**: Generate last 14 calendar days → Try to fetch data → Get 404 errors

**NEW (Fixed)**: Query satellite_observations table → Only fetch dates with actual satellite passes → No 404 errors

## Expected Result
After sync completes:
- Water Distribution card will show real data
- Balance percentage will be calculated
- Status (balanced/critical) will appear
- Trend data will be visible

## Technical Details
The sync now:
1. Gets actual observation dates from `satellite_observations` table
2. Checks which dates are missing water indices in `water_metrics_cache`
3. Fetches ndwi, moisture, sar_moisture for missing dates
4. Caches the results for fast dashboard loading

The fix is in: `src/services/waterMetricsCacheService.ts` (getMissingDates function)
