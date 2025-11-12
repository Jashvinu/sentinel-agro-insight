# 🧪 Test Commands & Verification

## Quick Test Guide

Use these commands to verify everything is working:

---

## 1️⃣ Check Database

### View Farms
```bash
# Via Supabase SQL
SELECT id, name, created_at FROM farms;

# Expected: 1 farm (Jash Farm)
```

### View Timeline Data
```bash
# Via Supabase SQL
SELECT 
  observation_date,
  index_type,
  mean_value,
  std_dev
FROM agricultural_indices
ORDER BY observation_date DESC, index_type;

# Expected: 5 rows of test data
```

---

## 2️⃣ Test API Endpoints

### Health Check
```bash
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/health"

# Expected: {"status": "ok", ...}
```

### Get Farm Timeline
```bash
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/farm-timeline"

# Expected: JSON with timeline data showing 3 observation dates
```

### Get Timeline for Specific Index
```bash
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/farm-timeline?index=ndvi"

# Expected: JSON with only NDVI data
```

### Get Available Sentinel-2 Dates (Slow - 20-30s)
```bash
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/get-available-dates?start=2024-01-01&end=2024-03-31"

# Expected: JSON with ~18 available dates in Q1 2024
```

### Calculate Index (and auto-save to DB)
```bash
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices?index=ndvi&polygon=%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B77.77333199305133%2C12.392392446684909%5D%2C%5B77.77285377084087%2C12.391034719901086%5D%2C%5B77.77415744218291%2C12.390603704636632%5D%2C%5B77.77438732135664%2C12.391302225016886%5D%2C%5B77.77376792469431%2C12.391501801924363%5D%2C%5B77.77399141833513%2C12.392187846379386%5D%2C%5B77.77333199305133%2C12.392392446684909%5D%5D%5D%7D"

# Expected: JSON with Earth Engine tile URL and "database.saved: true"
```

---

## 3️⃣ Test Frontend

### Start Dev Server
```bash
npm run dev

# Open: http://localhost:5173
```

### Verify Timeline Component
1. ✅ Scroll down to "Farm Timeline" section
2. ✅ See 3 observation dates listed
3. ✅ Click on "2024-02-07" to expand
4. ✅ See NDVI and Nitrogen values
5. ✅ Verify colors: Green badges for indices

### Verify Map Integration
1. ✅ Click on map to select index
2. ✅ Choose "Nitrogen"
3. ✅ Wait for calculation (5-10 seconds)
4. ✅ Check browser console for "✅ Saved..." message
5. ✅ Refresh timeline - should show new data

---

## 4️⃣ Verify Database Saves

### After Calculating an Index on Map

```bash
# Check if new data was saved
SELECT 
  observation_date,
  index_type,
  mean_value,
  created_at
FROM agricultural_indices
ORDER BY created_at DESC
LIMIT 5;

# Expected: New row with today's date
```

---

## 5️⃣ Production Build Test

### Build Project
```bash
npm run build

# Expected: ✓ built in ~2-3s
#          No errors
#          dist/ folder created
```

### Serve Production Build
```bash
npm run preview

# Open: http://localhost:4173
```

---

## 🎯 Expected Results Summary

| Test | Expected Result | Status |
|------|----------------|--------|
| Database tables exist | 3 tables + 1 view | ✅ |
| Test data inserted | 5 rows | ✅ |
| Farm exists | 1 farm (Jash Farm) | ✅ |
| Timeline API works | Returns JSON | ✅ |
| Available dates found | 44 dates in 2024 | ✅ |
| Frontend builds | No errors | ✅ |
| Timeline UI displays | Shows 3 dates | ✅ |
| Auto-save works | New data appears | ✅ |

---

## 🐛 Troubleshooting

### API Returns 404
```bash
# Check deployed functions
supabase functions list --project-ref udbnskydigoqpxmmduvr

# Redeploy if needed
supabase functions deploy farm-timeline --project-ref udbnskydigoqpxmmduvr --no-verify-jwt
```

### Timeline Not Loading
```bash
# Check browser console
# Look for CORS errors or network issues

# Verify API base URL in .env
echo $VITE_API_BASE_URL
# Should be: https://udbnskydigoqpxmmduvr.supabase.co/functions/v1
```

### No Data in Database
```bash
# Insert test data manually
supabase db execute "INSERT INTO agricultural_indices ..."

# Or use the SQL from IMPLEMENTATION_SUMMARY.md
```

### Build Fails
```bash
# Clear cache and reinstall
rm -rf node_modules dist .vite
npm install
npm run build
```

---

## 📊 Performance Benchmarks

Expected response times:

| Endpoint | Time | Notes |
|----------|------|-------|
| `/health` | <100ms | Always fast |
| `/farm-timeline` | <500ms | Database query |
| `/agricultural-indices` | 3-10s | Earth Engine calculation |
| `/get-available-dates` | 20-30s | Earth Engine query |

---

## ✅ Verification Checklist

Run through this checklist to verify everything:

- [ ] Database schema created (3 tables + view)
- [ ] Test data inserted (5 rows)
- [ ] Farm polygon saved with PostGIS
- [ ] `/health` endpoint responds
- [ ] `/farm-timeline` returns data
- [ ] `/get-available-dates` finds 44 images
- [ ] `/agricultural-indices` calculates and saves
- [ ] Frontend builds without errors
- [ ] Timeline UI displays in browser
- [ ] Clicking dates shows details
- [ ] Map integration saves to database
- [ ] Console shows "✅ Saved..." messages

---

## 🎓 Advanced Testing

### Query Time Series with SQL
```sql
-- Get NDVI trend
SELECT 
  observation_date,
  mean_value
FROM agricultural_indices
WHERE index_type = 'ndvi'
ORDER BY observation_date ASC;

-- Compare two indices
SELECT 
  observation_date,
  MAX(CASE WHEN index_type = 'ndvi' THEN mean_value END) as ndvi,
  MAX(CASE WHEN index_type = 'nitrogen' THEN mean_value END) as nitrogen
FROM agricultural_indices
GROUP BY observation_date
ORDER BY observation_date ASC;
```

### Test with Different Date Ranges
```bash
# Q1 2024
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/get-available-dates?start=2024-01-01&end=2024-03-31"

# Q2 2024
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/get-available-dates?start=2024-04-01&end=2024-06-30"

# Full year
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/get-available-dates?start=2024-01-01&end=2024-12-31"
```

### Test Error Handling
```bash
# Invalid farm ID
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/farm-timeline?farm_id=invalid-uuid"
# Expected: 404 error with message

# Invalid index type
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/farm-timeline?index=invalid"
# Expected: Empty timeline (no error)
```

---

## 🎯 Success Criteria

All tests pass when:
1. ✅ API endpoints return data
2. ✅ Database contains test data
3. ✅ Frontend displays timeline
4. ✅ Auto-save creates new database rows
5. ✅ Build completes without errors

---

**Everything working? Congratulations! 🎉**

Your time-series agricultural monitoring system is fully operational!

For more details, see:
- `TIME_SERIES_FEATURE_COMPLETE.md`
- `QUICK_START_TIME_SERIES.md`
- `IMPLEMENTATION_SUMMARY.md`

