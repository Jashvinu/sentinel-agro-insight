# Backend Functions Summary

## Overview
Removed water distribution card data processing and focused on core functionality: farms, available dates, and agricultural indices for polygon/multi-polygon support.

## Changes Made

### 1. DashboardKPIs Component Simplification
**File**: `src/components/features/dashboard/DashboardKPIs.tsx`

- ✅ Removed `useWaterMetrics` hook import and usage
- ✅ Removed `getAllFarms` import and farm fetching logic
- ✅ Removed all water distribution data processing logic
- ✅ Simplified to use static `DASHBOARD_INSIGHTS` data only
- ✅ Component now renders all 4 KPI cards (Water, Inputs, Pests, Weather) with static data

### 2. Backend Function Architecture

#### Available Edge Functions (via MCP Supabase)
1. **get-available-dates** - Fetches satellite observation dates for a farm/polygon
2. **agricultural-indices** - Calculates agricultural indices (NDVI, EVI, etc.) for polygons
3. **get-observation-dates** - Simple endpoint for observation dates
4. **sync-satellite-dates** - Syncs satellite dates to database
5. **farm-timeline** - Farm timeline data
6. **health** - Health check endpoint

#### Key Features Verified

**Multi-Polygon Support**:
- ✅ `geoJsonToEarthEngine()` function in `satellite-utils.ts` handles both `Polygon` and `MultiPolygon`
- ✅ `agricultural-indices` function accepts polygon parameter and correctly processes both types
- ✅ Farm "Evergreen Farms" (id: `d556697f-f6a0-457e-b5f8-61657c65c104`) has `ST_MultiPolygon` geometry type
- ✅ `field-map.tsx` component passes geometry directly to API endpoint

**Available Dates**:
- ✅ `get-available-dates` function:
  - Accepts `farm_id` or `polygon` parameter
  - Supports date range parameters (`start`, `end`, `months`)
  - Supports cloud cover filtering (`cloud` parameter)
  - Queries multiple satellites: Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR
  - Saves observations to `satellite_observations` table
  - Returns dates with available indices per satellite

**Agricultural Indices**:
- ✅ `agricultural-indices` function:
  - Accepts `index` parameter (default: 'ndvi')
  - Accepts `polygon` parameter (GeoJSON Polygon or MultiPolygon)
  - Accepts date range (`start`, `end`)
  - Supports multiple indices: NDVI, EVI, SAVI, MSAVI, NDWI, nitrogen, phosphorus, potassium, salinity, pH, moisture, carbon, sar_moisture
  - Returns statistics: mean, min, max, std_dev
  - Returns tile URL for visualization
  - Returns satellite sources used

## Database Structure

### Tables Used
1. **farms** - Stores farm polygons (Polygon or MultiPolygon geometry)
2. **satellite_observations** - Stores available satellite observation dates per farm
3. **agricultural_indices** - Caches calculated index values per farm/date/index_type

### Sample Farm Data
```sql
-- Farm: Evergreen Farms
id: d556697f-f6a0-457e-b5f8-61657c65c104
geometry_type: ST_MultiPolygon
```

### Sample Observation Dates (from MCP query)
- 2025-12-03: Sentinel-2
- 2025-12-01: Landsat-9
- 2025-11-28: Sentinel-2
- 2025-11-25: Sentinel-2
- 2025-11-24: Sentinel-1 SAR
- And more...

## Testing Backend Functions

### Using MCP Supabase
```typescript
// Check farms
mcp_supabase_execute_sql(`
  SELECT id, name, ST_GeometryType(geometry) as geom_type 
  FROM farms 
  ORDER BY created_at DESC 
  LIMIT 5;
`);

// Check available dates for a farm
mcp_supabase_execute_sql(`
  SELECT DISTINCT observation_date, satellite 
  FROM satellite_observations 
  WHERE farm_id = 'd556697f-f6a0-457e-b5f8-61657c65c104' 
  ORDER BY observation_date DESC 
  LIMIT 10;
`);

// Check cached indices
mcp_supabase_execute_sql(`
  SELECT observation_date, index_type, mean_value 
  FROM agricultural_indices 
  WHERE farm_id = 'd556697f-f6a0-457e-b5f8-61657c65c104' 
  ORDER BY observation_date DESC, index_type 
  LIMIT 15;
`);
```

### API Endpoints (HTTP)

**Get Available Dates**:
```
GET /functions/v1/get-available-dates?farm_id=<farm_id>&months=6
GET /functions/v1/get-available-dates?polygon=<geojson>&start=2025-11-01&end=2025-12-01
```

**Get Agricultural Indices**:
```
GET /functions/v1/agricultural-indices?index=ndvi&polygon=<geojson>&start=2025-11-01&end=2025-12-01
```

## Next Steps

1. ✅ Water distribution processing removed from DashboardKPIs
2. ✅ Verified multi-polygon support in backend functions
3. ✅ Verified available dates functionality
4. ✅ Verified agricultural indices functionality

The backend functions are ready to handle:
- Single Polygon farms
- Multi-Polygon farms (multiple separate fields)
- Multiple satellite sources (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR)
- Various agricultural indices
- Date range queries with cloud cover filtering





