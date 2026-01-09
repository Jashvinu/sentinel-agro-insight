# Advanced Monitoring System - Deployment Guide

## Overview

The Advanced Monitoring system provides high-temporal-resolution agricultural insights through multi-sensor fusion, advanced soil parameter retrieval algorithms, and statistical trend analysis.

### Features
- **7 Algorithms**: OPTRAM, SAR Change Detection, Sensor Fusion, PCA Nutrients (P, K), Nitrogen (GNDVI, NDRE)
- **Trend Analysis**: Theil-Sen robust estimator with Mann-Kendall significance testing
- **Multi-Sensor Fusion**: Sentinel-1 SAR, Sentinel-2, Landsat-8, Landsat-9
- **30m Resolution**: Harmonized Land Sentinel (HLS) methodology
- **10-Day Windows**: High-temporal-resolution time series
- **3-Tier Caching**: Database (90-day), edge function, client-side

## Prerequisites

### 1. Google Earth Engine Setup

1. **Create Google Cloud Project**
   ```bash
   # Visit: https://console.cloud.google.com/
   # Create a new project or select existing one
   ```

2. **Enable Earth Engine API**
   ```bash
   # Visit: https://console.cloud.google.com/apis/library/earthengine.googleapis.com
   # Click "Enable"
   ```

3. **Register for Earth Engine**
   ```bash
   # Visit: https://earthengine.google.com/signup/
   # Complete registration with your Google Cloud project
   ```

4. **Create Service Account**
   ```bash
   # Visit: https://console.cloud.google.com/iam-admin/serviceaccounts
   # Create service account with Earth Engine permissions
   # Download JSON key file
   ```

5. **Register Service Account with Earth Engine**
   ```bash
   # Visit: https://code.earthengine.google.com/
   # Run this command in the Code Editor:
   ee.ServiceAccountCredentials('[email]@[project].iam.gserviceaccount.com');
   ```

### 2. Supabase CLI Installation

```bash
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref [your-project-ref]
```

### 3. Environment Variables

Set these secrets in your Supabase project:

```bash
# Earth Engine credentials (entire JSON file content)
supabase secrets set GOOGLE_CREDENTIALS_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}'

# These should already be set in your Supabase project
# supabase secrets set SUPABASE_URL='https://[project-ref].supabase.co'
# supabase secrets set SUPABASE_SERVICE_ROLE_KEY='[service-role-key]'
```

## Database Migration

### Apply Migration

```bash
# Navigate to project root
cd /path/to/sentinel-agro-insight-1

# Apply the Advanced Monitoring migration
supabase db push
```

### Verify Migration

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('advanced_monitoring_timeseries', 'trend_analysis');

-- Check Row Level Security policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('advanced_monitoring_timeseries', 'trend_analysis');
```

## Edge Functions Deployment

### Option 1: Automated Deployment Script

```bash
# Run the deployment script
./scripts/deploy-advanced-monitoring.sh
```

### Option 2: Manual Deployment

```bash
# Deploy each function individually
supabase functions deploy advanced-monitoring
supabase functions deploy hls-harmonize
supabase functions deploy sar-preprocessing
```

### Verify Deployment

```bash
# List all deployed functions
supabase functions list

# Check function logs
supabase functions logs advanced-monitoring
```

## Testing

### 1. Test HLS Harmonization (Optional)

```bash
curl -X POST \
  'https://[your-project-ref].supabase.co/functions/v1/hls-harmonize' \
  -H 'Authorization: Bearer [your-anon-key]' \
  -H 'Content-Type: application/json' \
  -d '{
    "polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-122.5, 37.8],
        [-122.4, 37.8],
        [-122.4, 37.7],
        [-122.5, 37.7],
        [-122.5, 37.8]
      ]]
    },
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "targetResolution": 30,
    "applyBRDF": true,
    "applySpectralAdjustment": true
  }'
```

### 2. Test SAR Preprocessing (Optional)

```bash
curl -X POST \
  'https://[your-project-ref].supabase.co/functions/v1/sar-preprocessing' \
  -H 'Authorization: Bearer [your-anon-key]' \
  -H 'Content-Type: application/json' \
  -d '{
    "polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-122.5, 37.8],
        [-122.4, 37.8],
        [-122.4, 37.7],
        [-122.5, 37.7],
        [-122.5, 37.8]
      ]]
    },
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "polarization": "VV",
    "applySpeckleFilter": true
  }'
```

### 3. Test Main Orchestrator

```bash
curl -X POST \
  'https://[your-project-ref].supabase.co/functions/v1/advanced-monitoring' \
  -H 'Authorization: Bearer [your-anon-key]' \
  -H 'Content-Type: application/json' \
  -d '{
    "polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-122.5, 37.8],
        [-122.4, 37.8],
        [-122.4, 37.7],
        [-122.5, 37.7],
        [-122.5, 37.8]
      ]]
    },
    "farmId": "[your-farm-id]",
    "startDate": "2024-01-01",
    "endDate": "2024-03-31",
    "algorithms": ["optram_moisture"],
    "includeTrends": true,
    "aggregationLevel": "grid",
    "windowSizeDays": 10
  }'
```

## Frontend Configuration

### Update Environment Variables

```bash
# .env.production or Vercel environment variables
VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

### Build and Deploy Frontend

```bash
# Build production bundle
npm run build

# Deploy to Vercel (if using Vercel)
vercel --prod

# Or deploy to your hosting platform of choice
```

## Usage

### Accessing Advanced Monitoring

1. Login to your application
2. Navigate to "Advanced Monitoring" from the navigation menu
3. Ensure you have a farm created (polygon drawn)
4. Select algorithms to analyze
5. Choose date range (30-180 days recommended)
6. Click "Run Analysis"

### Expected Response Times

| Scenario | Response Time |
|----------|---------------|
| Cache Hit | < 1 second |
| Cache Miss (90 days, 1 algorithm) | 5-10 seconds |
| Cache Miss (90 days, 7 algorithms) | 15-25 seconds |
| Cache Miss (180 days, 7 algorithms) | 30-45 seconds |

### Caching Behavior

- **Database Cache**: 90-day retention, checks before Earth Engine computation
- **Invalidation**: Automatic after 90 days
- **Cache Key**: `(farmId, algorithm, windowStartDate, windowEndDate)`

## Monitoring & Troubleshooting

### Check Function Logs

```bash
# Real-time logs
supabase functions logs advanced-monitoring --tail

# Recent logs
supabase functions logs advanced-monitoring --limit 100
```

### Common Issues

#### 1. Earth Engine Authentication Error

```
Error: GOOGLE_CREDENTIALS_JSON environment variable not set
```

**Solution**: Set the Google Cloud service account credentials:
```bash
supabase secrets set GOOGLE_CREDENTIALS_JSON='...'
```

#### 2. Timeout Errors

```
Error: Request timeout
```

**Solutions**:
- Reduce date range (use < 180 days)
- Reduce number of algorithms
- Use aggregationLevel: 'grid' instead of 'pixel'

#### 3. Cache Miss on Every Request

**Solution**: Check database connection:
```bash
# Verify SUPABASE_SERVICE_ROLE_KEY is set
supabase secrets list

# Check RLS policies allow writes
# Run in Supabase SQL Editor:
SELECT * FROM advanced_monitoring_timeseries LIMIT 1;
```

#### 4. Trend Analysis Not Appearing

**Possible causes**:
- Less than 3 windows (need minimum 30 days)
- All mean values are null/zero
- Backend error during trend calculation

**Solution**: Check function logs for trend analysis errors

## Performance Optimization

### 1. Adaptive Aggregation

The system automatically adjusts aggregation based on farm size:
- **< 1 ha**: Zone-level (single value)
- **1-10 ha**: Grid-level (90m)
- **> 10 ha**: Sampled grid

### 2. Parallel Processing

All algorithms run in parallel using `Promise.all`, significantly reducing total processing time.

### 3. Cache Warming

For frequently accessed farms, consider pre-warming the cache:

```sql
-- Identify farms needing cache refresh
SELECT farm_id, MAX(created_at) as last_cached
FROM advanced_monitoring_timeseries
GROUP BY farm_id
HAVING MAX(created_at) < NOW() - INTERVAL '7 days';
```

## Cost Estimation

### Google Earth Engine

- **Free Tier**: 250,000 requests/day
- **Typical Request**: 1 analysis = 10-50 Earth Engine API calls (depending on algorithms)
- **Expected Cost**: $0 for most users (within free tier)

### Supabase

- **Function Invocations**: 2M free/month (Pro plan)
- **Database Storage**: ~100 KB per farm per analysis
- **Expected Cost**: Minimal (within free tier for most users)

## Maintenance

### Cache Cleanup

```sql
-- Delete cache entries older than 90 days
DELETE FROM advanced_monitoring_timeseries
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM trend_analysis
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Database Indexes

```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('advanced_monitoring_timeseries', 'trend_analysis')
ORDER BY idx_scan DESC;
```

## Support

For issues or questions:
1. Check function logs: `supabase functions logs advanced-monitoring`
2. Verify environment variables: `supabase secrets list`
3. Check Earth Engine quota: https://code.earthengine.google.com/
4. Review database logs in Supabase Dashboard

## Next Steps

After successful deployment:
1. ✅ Test with real farm data
2. ✅ Monitor performance metrics
3. ✅ Set up alerts for failures
4. ✅ Consider adding historical seasonal comparison
5. ✅ Implement custom alert thresholds

---

**Last Updated**: 2026-01-08
**Version**: 1.0.0
