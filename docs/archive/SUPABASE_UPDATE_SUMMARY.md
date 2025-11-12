# Supabase Update Summary - All 12 Agricultural Indices

## ✅ What Was Updated

### Supabase Edge Function: `agricultural-indices`
The Supabase Edge Function has been updated with **all 12 agricultural indices** to match the Vercel API:

#### Vegetation Indices (4)
1. **NDVI** - Normalized Difference Vegetation Index
2. **EVI** - Enhanced Vegetation Index  
3. **SAVI** - Soil Adjusted Vegetation Index
4. **MSAVI** - Modified Soil Adjusted Vegetation Index

#### NPK Nutrients (3)
5. **Nitrogen** - Nitrogen content (kg N/ha)
6. **Phosphorus** - Phosphorus content (kg P₂O₅/ha)
7. **Potassium** - Potassium content (kg K₂O/ha)

#### Soil Health (4)
8. **Salinity** - Electrical Conductivity (dS/m)
9. **pH** - Soil pH (4.5-9.0)
10. **Moisture** - Volumetric moisture content (%)
11. **Carbon** - Soil Organic Carbon (%)

#### Water Index (1)
12. **NDWI** - Normalized Difference Water Index

## 🔧 Files Modified

### 1. `/supabase/functions/agricultural-indices/index.ts`
- ✅ Added 8 new calculation functions (NDWI, Nitrogen, Phosphorus, Potassium, Salinity, pH, Moisture, Carbon)
- ✅ Updated switch statement to handle all 12 indices
- ✅ Changed default index from `msavi` to `ndvi`
- ✅ All indices use proper color palettes matching the UI

### 2. `/api/agricultural-indices.ts` (Vercel)
- ✅ Also updated with all 12 indices for consistency
- ✅ Both Supabase and Vercel APIs are now feature-complete

## 🚀 How to Deploy to Supabase

### Prerequisites
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login
```

### Quick Deploy
```bash
# Deploy both Edge Functions
npm run deploy:supabase
```

Or manually:
```bash
# Link to your project (one-time setup)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy agricultural-indices --no-verify-jwt
supabase functions deploy health --no-verify-jwt
```

### Set Environment Variables in Supabase

Go to your Supabase Dashboard → Project Settings → Edge Functions → Add secrets:

```bash
# Required Google Earth Engine credentials
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}

# Or alternatively, set individual vars:
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-key-id
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/...
```

### Update Frontend `.env`

```env
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
```

## 🧪 Testing All Indices

### Test Each Index

```bash
# Base URL
BASE_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1"

# Test health check
curl "$BASE_URL/health"

# Test all 12 indices
curl "$BASE_URL/agricultural-indices?index=ndvi"
curl "$BASE_URL/agricultural-indices?index=evi"
curl "$BASE_URL/agricultural-indices?index=savi"
curl "$BASE_URL/agricultural-indices?index=msavi"
curl "$BASE_URL/agricultural-indices?index=ndwi"
curl "$BASE_URL/agricultural-indices?index=nitrogen"
curl "$BASE_URL/agricultural-indices?index=phosphorus"
curl "$BASE_URL/agricultural-indices?index=potassium"
curl "$BASE_URL/agricultural-indices?index=salinity"
curl "$BASE_URL/agricultural-indices?index=ph"
curl "$BASE_URL/agricultural-indices?index=moisture"
curl "$BASE_URL/agricultural-indices?index=carbon"
```

### Test with Custom Polygon

```bash
curl "$BASE_URL/agricultural-indices?index=nitrogen&polygon=%7B%22type%22:%22Polygon%22,%22coordinates%22:%5B%5B%5B77.77333199305133,12.392392446684909%5D,%5B77.77285377084087,12.391034719901086%5D,%5B77.77415744218291,12.390603704636632%5D,%5B77.77438732135664,12.391302225016886%5D,%5B77.77376792469431,12.391501801924363%5D,%5B77.77399141833513,12.392187846379386%5D,%5B77.77333199305133,12.392392446684909%5D%5D%5D%7D"
```

### Expected Response Format

```json
{
  "success": true,
  "urlFormat": "https://earthengine.googleapis.com/v1alpha/...",
  "mapid": "...",
  "token": "...",
  "geojson": {
    "type": "Polygon",
    "coordinates": [[[...]]]
  },
  "poiPolygon": {
    "type": "Feature",
    "geometry": {...},
    "properties": {
      "name": "Field Area",
      "index": "NITROGEN"
    }
  },
  "metadata": {
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "algorithm": "NITROGEN",
    "dataSource": "Sentinel-2 SR Harmonized",
    "cloudFilter": "< 20%",
    "calculationMethod": "N = 259.4 × NDVI - 58.6 (R²=0.90) - Nitrogen content in kg N/ha"
  }
}
```

## 📊 Index Calculations

### Vegetation Indices
- **NDVI**: `(NIR - Red) / (NIR + Red)`
- **EVI**: `2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1)`
- **SAVI**: `(NIR - Red) × (1 + L) / (NIR + Red + L)` where L=0.5
- **MSAVI**: `(2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2`

### NPK (Research-based correlations)
- **Nitrogen**: `259.4 × NDVI - 58.6` kg N/ha (R²=0.90)
- **Phosphorus**: `180 × EVI - 25` kg P₂O₅/ha
- **Potassium**: `250 × SAVI - 40` kg K₂O/ha

### Soil Health
- **Salinity**: `0.0045 × SI + 1.2` dS/m, where SI = (Blue + Red) / 2
- **pH**: `0.023 × Blue - 0.015 × SWIR + 7.2`
- **Moisture**: `45.2 × NDMI - 8.7` %, where NDMI = (NIR - SWIR) / (NIR + SWIR)
- **Carbon**: `12.5 × NDVI - 3.2` % SOC (R²=0.79)

### Water
- **NDWI**: `(NIR - SWIR) / (NIR + SWIR)`

## 🎨 Color Palettes

Each index has been configured with appropriate color gradients:

- **Vegetation (NDVI, EVI, SAVI, MSAVI)**: Red → Yellow → Green → Dark Green
- **NPK**: Red → Orange → Yellow → Green → Dark Green (low to high nutrients)
- **Salinity**: Green → Yellow → Orange → Red (low to high salinity)
- **pH**: Red → Orange → Yellow → Green → Blue (acidic to alkaline)
- **Moisture**: Brown → Yellow → Light Blue → Blue → Dark Blue (dry to wet)
- **Carbon**: Brown → Yellow → Orange → Green → Dark Green (low to high)
- **NDWI**: Brown → Yellow → Light Blue → Blue → Dark Blue (dry to water)

## 🌍 Data Source

All indices use:
- **Satellite**: Sentinel-2 Surface Reflectance (SR) Harmonized
- **Date Range**: 2024-01-01 to 2024-12-31 (configurable via query params)
- **Cloud Filter**: < 20% cloud cover
- **Resolution**: 10m per pixel
- **Processing**: Median composite

## 🔄 Migration from Vercel

If you're migrating from Vercel to Supabase:

1. **Deploy to Supabase** (as shown above)
2. **Update frontend `.env`**:
   ```env
   # Old (Vercel)
   # VITE_API_BASE_URL=https://your-app.vercel.app/api
   
   # New (Supabase)
   VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
   ```
3. **Rebuild frontend**: `npm run build`
4. **Test all indices** using the curl commands above

## ✨ Features

- ✅ All 12 agricultural indices fully implemented
- ✅ Custom polygon support (draw your own fields)
- ✅ Proper error handling and CORS
- ✅ Detailed metadata in responses
- ✅ Optimized color scales for each index type
- ✅ Research-based calculation methods
- ✅ Compatible with existing frontend UI

## 🎯 UI Integration

The frontend already supports all 12 indices with:
- Interactive index selection buttons
- Real-time map visualization
- Color-coded legends
- Cache management
- Multiple farm polygon support
- Export functionality

All indices are ready to use - just click the buttons in the UI!

## 📝 Notes

- **NPK values** are estimated using satellite-based correlations and should be validated with soil testing for precision agriculture
- **Salinity and pH** estimates are based on spectral indices and may vary based on soil type and conditions
- **Moisture** represents surface/near-surface moisture, not deep soil moisture
- For production use, consider implementing rate limiting and authentication

## 🐛 Troubleshooting

### Function not found
- Ensure you've deployed the functions: `npm run deploy:supabase`
- Check your project ref is correct

### Authentication errors
- Verify Google Cloud credentials are set in Supabase dashboard
- Ensure the service account has Earth Engine API enabled

### Slow responses
- First request may be slow due to cold start
- Subsequent requests are typically faster
- Consider implementing a warmup function

## 📚 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Google Earth Engine](https://earthengine.google.com/)
- [Sentinel-2 Bands](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR)

---

**Ready to Deploy?** Run `npm run deploy:supabase` and test all 12 indices! 🚀

