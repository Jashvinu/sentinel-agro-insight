# Water Metrics Cache System - Complete Setup

## ✅ System Overview

A complete caching system that stores 14 days of water distribution metrics per farm in the database. On every login, it automatically syncs missing data and displays metrics instantly.

## 🗄️ Database Setup

### Step 1: Apply Migration

**Via Supabase Dashboard (Recommended):**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Your Project
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Open file: `supabase/migrations/20250113000000_create_water_metrics_cache.sql`
5. Copy the entire SQL content
6. Paste into SQL Editor
7. Click **Run** (or Cmd/Ctrl + Enter)

**What gets created:**
- ✅ `water_metrics_cache` table
- ✅ Indexes for fast lookups
- ✅ RLS policies (user-specific access)
- ✅ Auto-cleanup function
- ✅ Timestamp triggers

## 🔄 How It Works

### On Login/App Load:

1. **Auto-sync runs** (via `useAutoSync` hook)
   ```
   ┌─────────────────┐
   │  User Logs In   │
   └────────┬────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ Check Cache (14 days)    │
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ Delete 15th day data    │
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ Find Missing Dates      │
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ Fetch from API          │
   │ (only missing dates)    │
   └────────┬─────────────────┘
            │
            ▼
   ┌─────────────────────────┐
   │ Update Cache            │
   └─────────────────────────┘
   ```

2. **Dashboard loads** (via `useWaterMetrics` hook)
   - Reads from cache (instant!)
   - Calculates metrics
   - Shows loading state until ready

## 📊 Cache Structure

```sql
water_metrics_cache
├── id (UUID)
├── farm_id (UUID) → farms.id
├── observation_date (DATE) - Date of observation
├── index_type (TEXT) - 'ndwi', 'moisture', or 'sar_moisture'
├── mean_value (NUMERIC) - Mean across polygon
├── std_dev (NUMERIC) - Standard deviation
├── min_value (NUMERIC) - Optional
├── max_value (NUMERIC) - Optional
└── created_at, updated_at (TIMESTAMPTZ)
```

**Unique constraint:** One record per `(farm_id, observation_date, index_type)`

## 🎯 Features

### ✅ Automatic Management
- **14-day window**: Always maintains exactly 14 days
- **Auto-cleanup**: Deletes 15th day automatically
- **Smart fetching**: Only fetches missing dates
- **Background sync**: Runs silently on app load

### ✅ Performance
- **Before**: 42+ API calls on every dashboard load
- **After**: 0 API calls (reads from cache)
- **Sync**: Only fetches missing dates (typically 0-3 calls per day)

### ✅ User Experience
- **Loading state**: Shows "Loading..." while fetching
- **Instant display**: Metrics appear immediately from cache
- **Auto-update**: Cache refreshes in background

## 📁 Files Created

1. **`supabase/migrations/20250113000000_create_water_metrics_cache.sql`**
   - Database migration
   - Creates table, indexes, policies, functions

2. **`src/services/waterMetricsCacheService.ts`**
   - Cache management service
   - Functions: `syncWaterMetricsCache`, `getCachedWaterMetrics`, `cleanupOldWaterMetrics`

3. **`src/services/waterMetricsService.ts`** (updated)
   - Now reads from cache instead of API
   - Calculates metrics from cached data

4. **`src/hooks/useAutoSync.ts`** (updated)
   - Calls `syncAllFarmsWaterMetrics()` on app load

5. **`src/hooks/useWaterMetrics.ts`**
   - React hook for fetching metrics
   - Shows loading state

6. **`src/components/features/dashboard/DashboardKPIs.tsx`** (updated)
   - Uses real cached data
   - Shows loading state

## 🚀 Usage Flow

### First Login:
1. Cache is empty
2. Sync fetches all 14 days (42 API calls: 14 days × 3 indices)
3. Stores in cache
4. Dashboard shows metrics

### Subsequent Logins:
1. Cache has most data
2. Sync checks for missing dates (usually 0-1 day)
3. Fetches only missing data (0-3 API calls)
4. Dashboard loads instantly from cache

### Daily Usage:
- Cache auto-updates with new day's data
- Old data (15th day) is automatically deleted
- Dashboard always shows latest 14 days

## 🔍 Verification

After applying migration, verify:

```sql
-- Check table exists
SELECT * FROM water_metrics_cache LIMIT 5;

-- Check cache for a farm
SELECT * FROM water_metrics_cache 
WHERE farm_id = 'your-farm-id' 
ORDER BY observation_date DESC;

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'water_metrics_cache';
```

## 🐛 Troubleshooting

### "No water data available"
- **Check**: Migration applied?
- **Check**: Farm has geometry?
- **Check**: Browser console for errors
- **Solution**: Wait for sync to complete (first time takes longer)

### Cache not updating
- **Check**: `useAutoSync` is running?
- **Check**: Browser console for sync logs
- **Solution**: Refresh page or wait for next sync

### Slow first load
- **Normal**: First sync fetches 14 days (takes 1-2 minutes)
- **Subsequent**: Instant (reads from cache)

---

**Status**: ✅ Ready to use after migration is applied!

**Next Step**: Apply migration via Supabase Dashboard SQL Editor







