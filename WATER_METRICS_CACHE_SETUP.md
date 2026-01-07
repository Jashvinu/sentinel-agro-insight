# Water Metrics Cache Setup

This system caches 14 days of water distribution metrics per farm for fast dashboard loading.

## 🗄️ Database Setup

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy the entire contents of `supabase/migrations/20250113000000_create_water_metrics_cache.sql`
6. Paste into the SQL Editor
7. Click **Run** (or press Cmd/Ctrl + Enter)

### Option 2: Via Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
```

### Option 3: Via Script

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npx tsx scripts/apply-water-metrics-migration.ts
```

## 📊 What Gets Created

- **Table**: `water_metrics_cache`
  - Stores mean values for NDWI, moisture, and SAR moisture
  - One record per farm, per date, per index type
  - Auto-cleans data older than 14 days

- **Indexes**: For fast lookups by farm and date

- **RLS Policies**: Users can only see their own farm's data

- **Functions**: 
  - `cleanup_old_water_metrics()` - Removes data older than 14 days

## 🔄 How It Works

### On Login/App Load:

1. **Auto-sync runs** (via `useAutoSync` hook)
   - Checks cache for last 14 days
   - Deletes data older than 14 days
   - Fetches missing dates from API
   - Updates cache with new data

2. **Dashboard loads** (via `useWaterMetrics` hook)
   - Reads from cache (fast!)
   - Calculates metrics from cached data
   - Shows loading state until data is ready

### Cache Management:

- **14-day window**: Always maintains exactly 14 days
- **Auto-cleanup**: Removes 15th day automatically
- **Smart fetching**: Only fetches missing dates
- **Background sync**: Runs silently on app load

## 📝 Cache Structure

```sql
water_metrics_cache
├── id (UUID)
├── farm_id (UUID) → farms.id
├── observation_date (DATE)
├── index_type (TEXT) - 'ndwi', 'moisture', or 'sar_moisture'
├── mean_value (NUMERIC) - Mean across polygon
├── std_dev (NUMERIC) - Standard deviation
├── min_value (NUMERIC) - Optional
├── max_value (NUMERIC) - Optional
└── created_at, updated_at (TIMESTAMPTZ)
```

## ✅ Verification

After applying migration, verify:

```sql
-- Check table exists
SELECT * FROM water_metrics_cache LIMIT 5;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'water_metrics_cache';
```

## 🚀 Usage

The system works automatically:

1. **First login**: Cache is empty, sync fetches all 14 days
2. **Subsequent logins**: Only missing dates are fetched
3. **Dashboard**: Loads instantly from cache

## 🔧 Manual Sync (if needed)

```typescript
import { syncAllFarmsWaterMetrics } from '@/services/waterMetricsCacheService';

// Sync all farms
await syncAllFarmsWaterMetrics();

// Sync specific farm
import { syncWaterMetricsCache } from '@/services/waterMetricsCacheService';
await syncWaterMetricsCache(farm);
```

## 📈 Performance

- **Before**: 42+ API calls on every dashboard load (14 days × 3 indices)
- **After**: 0 API calls (reads from cache)
- **Sync**: Only fetches missing dates (typically 0-3 calls per day)

---

**Status**: Ready to use after migration is applied!







