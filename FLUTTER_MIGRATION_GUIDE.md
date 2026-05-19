# wrkFarm — Flutter Migration Guide

Complete reference for rebuilding this app in Flutter using the same Supabase backend.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Supabase Backend Credentials](#supabase-backend-credentials)
3. [Authentication](#authentication)
4. [API Endpoints (Edge Functions)](#api-endpoints-edge-functions)
5. [Database Schema](#database-schema)
6. [Agricultural Indices Reference](#agricultural-indices-reference)
7. [Advanced Monitoring Algorithms](#advanced-monitoring-algorithms)
8. [Screen Structure](#screen-structure)
9. [Flutter Implementation Notes](#flutter-implementation-notes)

---

## Project Overview

**wrkFarm** is a precision agriculture platform that monitors crop health using:
- Sentinel-2 satellite imagery (10m resolution)
- Landsat 8/9 (30m resolution)
- Sentinel-1 SAR radar (all-weather moisture)
- Google Earth Engine for satellite computation
- Supabase for auth, database, and serverless functions

The app shows live satellite-derived maps and time-series for indices like NDVI, soil nitrogen, moisture, pH, carbon, etc.

---

## Supabase Backend Credentials

```
Supabase Project URL:  https://udbnskydigoqpxmmduvr.supabase.co
Edge Functions Base:   https://udbnskydigoqpxmmduvr.supabase.co/functions/v1
```

> **Anon Key**: Get this from your Supabase dashboard → Project Settings → API → `anon public` key.
> It is stored in the React app as `VITE_SUPABASE_ANON_KEY`.

### Required HTTP Headers (for every request)

Every call to a Supabase Edge Function must include:

```
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

If the user is logged in, replace the anon key in `Authorization` with their JWT session token:

```
Authorization: Bearer <USER_JWT_TOKEN>
```

---

## Authentication

Supabase Auth (email/password) is used. All tables have Row Level Security (RLS) enforced.

### Dart / Flutter Setup

Add `supabase_flutter` to `pubspec.yaml`:

```yaml
dependencies:
  supabase_flutter: ^2.0.0
```

Initialize in `main.dart`:

```dart
await Supabase.initialize(
  url: 'https://udbnskydigoqpxmmduvr.supabase.co',
  anonKey: '<YOUR_SUPABASE_ANON_KEY>',
);
```

### Auth Flows

| Action | Supabase call |
|--------|---------------|
| Sign up | `Supabase.instance.client.auth.signUp(email: ..., password: ...)` |
| Login | `Supabase.instance.client.auth.signInWithPassword(email: ..., password: ...)` |
| Logout | `Supabase.instance.client.auth.signOut()` |
| Current session | `Supabase.instance.client.auth.currentSession` |
| Listen to auth changes | `Supabase.instance.client.auth.onAuthStateChange` |

### Pages That Require Auth

- Dashboard
- Yield Prediction
- Advanced Monitoring
- Field Diagnostics
- Draw Polygon

Login and Signup are unauthenticated.

---

## API Endpoints (Edge Functions)

All endpoints live under:
```
https://udbnskydigoqpxmmduvr.supabase.co/functions/v1
```

---

### 1. Health Check

**GET** `/health`

No parameters required.

**Response:**
```json
{
  "success": true,
  "status": "OK",
  "message": "Server is running",
  "timestamp": "2026-03-22T00:00:00.000Z",
  "version": "1.0.0",
  "platform": "Supabase Edge Functions"
}
```

---

### 2. Agricultural Indices (Satellite Map Tiles)

**GET** `/agricultural-indices`

Calculates a satellite-derived vegetation/soil index and returns an Earth Engine map tile URL for rendering on a map.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `index` | string | Yes | One of: `ndvi`, `evi`, `savi`, `msavi`, `gndvi`, `ndre`, `ndwi`, `nitrogen`, `phosphorus`, `potassium`, `salinity`, `ph`, `moisture`, `carbon` |
| `start` | string | Yes | Start date `YYYY-MM-DD` |
| `end` | string | Yes | End date `YYYY-MM-DD` |
| `farm_id` | string | No | UUID of the farm (pulls geometry from DB) |
| `polygon` | string | No | URL-encoded GeoJSON geometry string (alternative to farm_id) |
| `satellite` | string | No | `Sentinel-2`, `Landsat-8`, `Landsat-9`, or omit for merged |
| `date` | string | No | Specific observation date `YYYY-MM-DD` |

**Response:**
```json
{
  "success": true,
  "index": "ndvi",
  "satellites": [
    {
      "satellite": "Sentinel-2",
      "urlFormat": "https://earthengine.googleapis.com/v1alpha/projects/.../maps/.../tiles/{z}/{x}/{y}",
      "mapid": "...",
      "token": "...",
      "cloudCover": 4.2,
      "min_value": 0.05,
      "max_value": 0.87,
      "mean_value": 0.52,
      "std_dev": 0.11,
      "data_source": {
        "satellites": ["Sentinel-2"],
        "description": "Sentinel-2 MSI harmonized optical imagery"
      },
      "metadata": {
        "algorithm": "NDVI",
        "calculationMethod": "...",
        "cloudFilter": "< 20%",
        "dateRange": { "start": "2024-01-01", "end": "2024-12-31" }
      }
    }
  ]
}
```

Use `urlFormat` (replacing `{z}/{x}/{y}` with tile coordinates) as a map tile layer. In Flutter with `flutter_map`, use it as a `TileLayer` URL template.

---

### 3. Get Available Satellite Dates

**GET** `/get-available-dates`

Returns all available satellite observation dates for a farm across all sensors.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `farm_id` | string | default farm | UUID of the farm |
| `polygon` | string | — | GeoJSON polygon string (alternative to farm_id) |
| `months` | int | 6 | How many months back to query |
| `cloud` | int | 100 | Maximum cloud cover % filter |
| `start` | string | — | Override start date `YYYY-MM-DD` |
| `end` | string | — | Override end date `YYYY-MM-DD` |

**Response:**
```json
{
  "success": true,
  "farm_id": "df43eedf-850d-454c-9fbf-36a052be10c0",
  "date_range": { "start": "2025-09-22", "end": "2026-03-17" },
  "total_images": 84,
  "available_dates": [
    {
      "date": "2026-03-15",
      "satellite": "Sentinel-2",
      "cloud_cover": 3.1,
      "tile_id": "T44NNJ",
      "available_indices": ["ndvi", "evi", "savi", "msavi", "gndvi", "ndre", "ndwi", "nitrogen", "phosphorus", "potassium", "salinity", "ph", "moisture", "carbon"]
    },
    {
      "date": "2026-03-12",
      "satellite": "Sentinel-1 SAR",
      "cloud_cover": null,
      "tile_id": "S1_2026-03-12",
      "available_indices": ["sar_moisture"]
    }
  ],
  "satellite_breakdown": {
    "Sentinel-2": 22,
    "Landsat-8": 15,
    "Landsat-9": 18,
    "Sentinel-1 SAR": 29
  },
  "data_sources": "Multi-satellite (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR)"
}
```

**Satellites & supported indices:**

| Satellite | Collection ID | Indices |
|-----------|---------------|---------|
| Sentinel-2 | `COPERNICUS/S2_SR_HARMONIZED` | All (ndvi, evi, savi, msavi, gndvi, ndre, ndwi, nitrogen, phosphorus, potassium, salinity, ph, moisture, carbon) |
| Landsat-8 | `LANDSAT/LC08/C02/T1_L2` | All optical indices |
| Landsat-9 | `LANDSAT/LC09/C02/T1_L2` | All optical indices |
| Sentinel-1 SAR | `COPERNICUS/S1_GRD` | sar_moisture only |

---

### 4. Farm Timeline

**GET** `/farm-timeline`

Returns all saved agricultural index observations for a farm, grouped by date.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `farm_id` | string | `df43eedf-...` | UUID of the farm |
| `index` | string | all | Optional filter by index type |

**Response:**
```json
{
  "success": true,
  "farm": {
    "id": "df43eedf-850d-454c-9fbf-36a052be10c0",
    "name": "Jash Farm",
    "bounds": {},
    "created_at": "2025-01-01T00:00:00Z"
  },
  "timeline": {
    "2026-03-15": [
      {
        "index_type": "ndvi",
        "min_value": 0.05,
        "max_value": 0.87,
        "mean_value": 0.52,
        "std_dev": 0.11,
        "tile_url": "https://...",
        "created_at": "2026-03-16T08:00:00Z"
      }
    ]
  },
  "observation_dates": ["2026-03-15", "2026-03-10", "..."],
  "stats": {
    "total_observations": 42,
    "total_indices": 156,
    "index_types": ["ndvi", "moisture", "nitrogen"],
    "date_range": { "earliest": "2025-09-01", "latest": "2026-03-15" }
  }
}
```

---

### 5. Sync Satellite Dates

**POST** (or GET) `/sync-satellite-dates`

Syncs new satellite observation dates from Earth Engine into the database. Call this on app startup (once per hour).

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `farm_id` | string | all farms | Limit to one farm |
| `months` | int | 6 | Look-back period |
| `dry_run` | bool | false | Preview without writing |

**Response:**
```json
{
  "success": true,
  "dry_run": false,
  "farms_processed": 1,
  "summary": {
    "total_images_found": 84,
    "new_observations": 5,
    "inserted": 5,
    "skipped_existing": 79
  }
}
```

---

### 6. Diagnostics

**GET** `/diagnostics`

Analyzes the farm for problem areas across multiple indices. Returns per-pixel cell data for heatmap overlays.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `polygon` | string | **Required** | URL-encoded GeoJSON geometry |
| `indices` | string | `nitrogen,moisture,ndvi,phosphorus` | Comma-separated index list |
| `days` | int | 14 | How many days of data to analyze |

**Response:**
```json
{
  "success": true,
  "analysis": {
    "ndvi": {
      "mean": 0.41,
      "min": 0.02,
      "max": 0.76,
      "stdDev": 0.12,
      "belowThreshold": false,
      "trend": -5.2,
      "trendDetected": false,
      "mapData": { "urlFormat": "...", "mapid": "...", "token": "..." }
    },
    "nitrogen": { "..." : "..." },
    "moisture": { "..." : "..." },
    "phosphorus": { "..." : "..." }
  },
  "problems": [
    {
      "index": "moisture",
      "type": "threshold",
      "avgValue": 3.2,
      "avgDecline": null,
      "threshold": 10
    }
  ],
  "cellData": [
    { "lat": 12.392, "lng": 77.773, "nitrogen": 142.3, "moisture": 18.5, "ndvi": 0.44, "phosphorus": 32.1 }
  ],
  "metadata": {
    "daysAnalyzed": 14,
    "dateRange": { "start": "2026-03-08", "end": "2026-03-22" },
    "resolution": "10m",
    "indices": ["ndvi", "nitrogen", "moisture", "phosphorus"],
    "season": "spring",
    "processingTimeMs": 18432
  }
}
```

---

### 7. Advanced Monitoring

**POST** `/advanced-monitoring`

Multi-algorithm time-series analysis using OPTRAM, SAR, and PCA algorithms.

**Request Body (JSON):**
```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[77.773, 12.392], [77.774, 12.391], [77.775, 12.392], [77.773, 12.392]]]
  },
  "farmId": "df43eedf-850d-454c-9fbf-36a052be10c0",
  "startDate": "2025-09-01",
  "endDate": "2026-03-22",
  "algorithms": ["optram_moisture", "nitrogen_gndvi", "pca_phosphorus"],
  "includeTrends": true,
  "aggregationLevel": "grid",
  "windowSizeDays": 10
}
```

**Valid algorithm values:**
- `optram_moisture` — OPTRAM soil moisture (optical trapezoid model)
- `sar_moisture_change` — Sentinel-1 SAR change detection
- `sar_moisture_fusion` — Fused optical + SAR moisture
- `pca_phosphorus` — PCA-based phosphorus index
- `pca_potassium` — PCA-based potassium index
- `nitrogen_gndvi` — Green NDVI nitrogen proxy
- `nitrogen_ndre` — Red-Edge nitrogen estimation

**Response:**
```json
{
  "success": true,
  "data": {
    "timeseries": [
      {
        "algorithm": "optram_moisture",
        "windows": [
          {
            "startDate": "2025-09-01",
            "endDate": "2025-09-11",
            "mean": 22.4,
            "stdDev": 3.1,
            "min": 14.2,
            "max": 31.8,
            "pixelCount": 412,
            "cloudCover": 0,
            "sensors": ["S2", "L8", "L9"]
          }
        ]
      }
    ],
    "trends": [
      {
        "algorithm": "optram_moisture",
        "theilsenSlope": 0.08,
        "trendDirection": "Increasing",
        "pValue": 0.03,
        "rSquared": 0.71,
        "confidenceIntervalLow": 0.04,
        "confidenceIntervalHigh": 0.13,
        "windowCount": 18
      }
    ],
    "metadata": {
      "farmId": "df43eedf-...",
      "dateRange": { "start": "2025-09-01", "end": "2026-03-22" },
      "windowCount": 18,
      "windowSizeDays": 10,
      "algorithmCount": 3,
      "aggregationLevel": "grid",
      "processingDate": "2026-03-22T00:00:00Z",
      "cached": false
    }
  }
}
```

---

## Database Schema

### `farms`

Stores farm polygons with PostGIS geometry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | auto-generated |
| `name` | TEXT | farm display name |
| `geometry` | geometry(4326) | PostGIS Polygon or MultiPolygon |
| `bounds` | JSONB | bounding box for map fitting |
| `area_hectares` | NUMERIC | farm area |
| `user_id` | UUID | owner (auth.uid()) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

RLS: users see only their own farms (`user_id = auth.uid()`). Farms with `user_id IS NULL` are publicly readable (demo farms).

**Default demo farm UUID:** `df43eedf-850d-454c-9fbf-36a052be10c0` (name: "Jash Farm")

---

### `satellite_observations`

Stores available satellite pass dates per farm.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `observation_date` | DATE | |
| `cloud_cover_percentage` | NUMERIC | null for SAR |
| `satellite` | TEXT | `Sentinel-2`, `Landsat-8`, `Landsat-9`, `Sentinel-1 SAR` |
| `processing_level` | TEXT | `L2A`, `L2`, `GRD` |
| `tile_id` | TEXT | e.g. `T44NNJ` |

Unique constraint: `(farm_id, observation_date, satellite, tile_id)`

---

### `agricultural_indices`

Stores computed index tiles per farm and date.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `index_type` | TEXT | e.g. `ndvi`, `moisture` |
| `observation_date` | DATE | |
| `min_value` | NUMERIC | |
| `max_value` | NUMERIC | |
| `mean_value` | NUMERIC | |
| `std_dev` | NUMERIC | |
| `tile_url` | TEXT | Earth Engine tile URL |
| `created_at` | TIMESTAMPTZ | |

---

### `agricultural_index_timeseries`

Per-satellite-observation cache for historical charting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `algorithm` | TEXT | `ndvi`, `evi`, `savi`, `msavi`, `gndvi`, `ndre`, `ndwi`, `moisture`, `nitrogen`, `phosphorus`, `potassium` |
| `observation_date` | DATE | |
| `mean_value` | FLOAT | |
| `std_dev` | FLOAT | |
| `min_value` | FLOAT | |
| `max_value` | FLOAT | |
| `cloud_cover` | FLOAT | |
| `satellite` | TEXT | `Sentinel-2`, `Landsat-8`, `Landsat-9`, `Sentinel-1 SAR` |
| `created_at` | TIMESTAMPTZ | |

Unique: `(farm_id, algorithm, observation_date)`

---

### `advanced_monitoring_timeseries`

Time-series windows for advanced algorithms (90-day cache).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `algorithm` | TEXT | See advanced monitoring algorithms |
| `window_start_date` | DATE | start of 10-day window |
| `window_end_date` | DATE | end of 10-day window |
| `mean_value` | NUMERIC | |
| `std_dev` | NUMERIC | |
| `min_value` | NUMERIC | |
| `max_value` | NUMERIC | |
| `pixel_count` | INTEGER | |
| `cloud_cover_percentage` | NUMERIC | |
| `sensors_used` | TEXT[] | e.g. `["S2", "L8"]` |
| `created_at` | TIMESTAMPTZ | |

Algorithm values: `optram_moisture`, `sar_moisture_change`, `sar_moisture_fusion`, `pca_phosphorus`, `pca_potassium`, `nitrogen_gndvi`, `nitrogen_ndre`, `nitrogen`, `phosphorus`, `potassium`, `ndwi`, `moisture`, `msavi`

---

### `trend_analysis`

Theil-Sen trend results.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `algorithm` | TEXT | |
| `analysis_start_date` | DATE | |
| `analysis_end_date` | DATE | |
| `theilsen_slope` | NUMERIC | median pairwise slope |
| `confidence_interval_low` | NUMERIC | |
| `confidence_interval_high` | NUMERIC | |
| `trend_direction` | TEXT | `Increasing`, `Decreasing`, `Stable` |
| `p_value` | NUMERIC | Mann-Kendall test |
| `window_count` | INTEGER | |
| `r_squared` | NUMERIC | |

---

### `water_metrics_cache`

14-day rolling water distribution metrics cache.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `farm_id` | UUID FK → farms | |
| `observation_date` | DATE | |
| `index_type` | TEXT | `ndwi`, `moisture`, `sar_moisture` |
| `mean_value` | NUMERIC | |
| `std_dev` | NUMERIC | |
| `min_value` | NUMERIC | |
| `max_value` | NUMERIC | |

Unique: `(farm_id, observation_date, index_type)`

---

## Agricultural Indices Reference

### Vegetation Indices

| Index | Formula | Range | Unit |
|-------|---------|-------|------|
| NDVI | `(B8 - B4) / (B8 + B4)` | 0–1 | Index |
| EVI | `2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)` | 0–1 | Index |
| SAVI | `((B8 - B4) / (B8 + B4 + 0.5)) × 1.5` | 0–1 | Index |
| MSAVI | `(2×B8 + 1 - √((2×B8+1)² - 8×(B8-B4))) / 2` | 0–1 | Index |
| GNDVI | `(B8 - B3) / (B8 + B3)` | 0–1 | Index |
| NDRE | `(B8 - B5) / (B8 + B5)` | 0–0.7 | Index |
| NDWI | `(B3 - B8) / (B3 + B8)` | -1–1 | Index |

### Soil Indices

| Index | Formula | Unit |
|-------|---------|------|
| Nitrogen | `N = 259.4 × NDVI - 58.6` | kg N/ha |
| Phosphorus | `P₂O₅ = 180 × EVI - 25` | kg P₂O₅/ha |
| Potassium | `K₂O = 250 × SAVI - 40` | kg K₂O/ha |
| Moisture | `NDMI = (B8 - B11) / (B8 + B11)` then `% = 45.2 × NDMI - 8.7` | % volumetric |
| Salinity | `SI = B2 × B4; ECe = 0.0045 × SI + 1.2` | dS/m |
| pH | `pH = 0.023×B2 - 0.015×B11 + 7.2` | pH units |
| Carbon | `SOC% = 12.5 × NDVI - 3.2` | % SOC |

### Sentinel-2 Band Reference

| Band | Name | Wavelength | Resolution |
|------|------|-----------|------------|
| B2 | Blue | 490 nm | 10m |
| B3 | Green | 560 nm | 10m |
| B4 | Red | 665 nm | 10m |
| B5 | Red Edge | 705 nm | 20m |
| B6 | Red Edge | 740 nm | 20m |
| B8 | NIR | 842 nm | 10m |
| B11 | SWIR-1 | 1610 nm | 20m |
| B12 | SWIR-2 | 2190 nm | 20m |

### Index Thresholds (Status Labels)

| Index | Low | Medium | High |
|-------|-----|--------|------|
| NDVI | < 0.3 | 0.3–0.6 | > 0.6 |
| Moisture | 5–15% (Dry) | 15–25% (Moderate) | 25–35% (Moist) |
| Nitrogen | < 100 (Deficient) | 100–200 (Adequate) | > 200 (Optimal) |
| Phosphorus | < 50 (Deficient) | 50–100 (Adequate) | > 100 (Optimal) |
| Potassium | < 100 (Deficient) | 100–200 (Adequate) | > 200 (Optimal) |
| Salinity | < 2 (Normal) | 2–8 (Moderate) | > 8 (High) |
| pH | < 6 (Acidic) | 6–7.5 (Neutral) | > 7.5 (Alkaline) |

---

## Advanced Monitoring Algorithms

| Algorithm ID | Label | Unit | Description |
|---|---|---|---|
| `optram_moisture` | OPTRAM Soil Moisture | % | Optical Trapezoid Model — optical imagery |
| `sar_moisture_change` | SAR Moisture Change | ΔdB | Sentinel-1 change detection (VV polarization) |
| `sar_moisture_fusion` | Fused Moisture | % | OPTRAM + SAR weighted fusion |
| `pca_phosphorus` | Phosphorus Index | Index | PCA multi-band phosphorus estimation |
| `pca_potassium` | Potassium Index | Index | PCA multi-band potassium estimation |
| `nitrogen_gndvi` | Nitrogen (GNDVI) | Index | Green NDVI nitrogen proxy |
| `nitrogen_ndre` | Nitrogen (NDRE) | Index | Red-Edge nitrogen estimation |

---

## Screen Structure

The React app has these pages — replicate them in Flutter:

### 1. Login (`/login`)
- Email + password form
- Links to Sign Up

### 2. Sign Up (`/signup`)
- Email + password + confirm password
- Auto-redirect to Draw Polygon after signup

### 3. Draw Polygon (`/draw-polygon`)
- Interactive map (Leaflet in web, use `flutter_map` in Flutter)
- User draws a polygon to define their farm boundary
- On submit: POST to `farms` table in Supabase with the polygon geometry and a name
- Redirect to Dashboard after saving

### 4. Dashboard (`/dashboard`)
- Select farm and observation date from available satellite dates
- Select agricultural index
- Shows:
  - Map with Earth Engine tile overlay (from `/agricultural-indices`)
  - KPI cards: NDVI, Moisture, Temperature, Rainfall
  - Time-series chart of selected index over past months
  - Water distribution metrics
- Data flow:
  1. Load farm list from `farms` table
  2. Call `/get-available-dates?farm_id=...` to get date picker options
  3. On date + index select → call `/agricultural-indices?index=ndvi&start=...&end=...&farm_id=...`
  4. Render `urlFormat` as a tile layer on the map

### 5. Yield Prediction (`/yield-prediction`)
- Uses NDVI + EVI time series to estimate yield
- Displays predicted yield in tonnes/ha
- Historical yield comparison chart
- Recommendation text based on current NDVI levels

### 6. Advanced Monitoring (`/advanced-monitoring`)
- Multi-algorithm selector (checkboxes for each algorithm)
- Date range picker
- POST to `/advanced-monitoring` with selected algorithms + farm polygon
- Displays time-series line charts (one line per algorithm)
- Trend cards: Increasing / Stable / Decreasing with slope info

### 7. Field Diagnostics (`/field-diagnostics`)
- GET `/diagnostics?polygon=...&days=14`
- Shows heatmap overlay on map using `cellData` (lat/lng + per-index values)
- Problem cards listing detected threshold violations or declining trends
- Per-index stat cards (mean, min, max, stdDev)
- Season-aware analysis (winter / spring / summer / fall)

---

## Flutter Implementation Notes

### Recommended Packages

```yaml
dependencies:
  supabase_flutter: ^2.0.0
  flutter_map: ^6.0.0          # Map rendering
  latlong2: ^0.9.0             # Coordinates
  http: ^1.0.0                 # HTTP calls
  fl_chart: ^0.69.0            # Charts
  provider: ^6.0.0             # State management
  go_router: ^14.0.0           # Routing
```

### Making API Calls

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

final supabase = Supabase.instance.client;
final session = supabase.auth.currentSession;
final token = session?.accessToken ?? '<YOUR_ANON_KEY>';

final response = await http.get(
  Uri.parse(
    'https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices'
    '?index=ndvi&start=2025-09-01&end=2026-03-22&farm_id=df43eedf-850d-454c-9fbf-36a052be10c0'
  ),
  headers: {
    'Content-Type': 'application/json',
    'apikey': '<YOUR_ANON_KEY>',
    'Authorization': 'Bearer $token',
  },
);
```

### Rendering Earth Engine Tiles on a Map

```dart
TileLayer(
  urlTemplate: urlFormat, // from agricultural-indices response
  // urlFormat already has the full path; flutter_map handles {z}/{x}/{y} substitution
  additionalOptions: const {},
)
```

Note: Earth Engine tile tokens expire. Cache the response and refresh when expired.

### Database Queries (Supabase Flutter)

```dart
// Get available farms
final farms = await supabase
  .from('farms')
  .select('id, name, bounds, area_hectares')
  .order('created_at', ascending: false);

// Get farm timeline
final timeline = await supabase
  .from('agricultural_indices')
  .select('*')
  .eq('farm_id', farmId)
  .order('observation_date', ascending: false);

// Insert a new farm
await supabase.from('farms').insert({
  'name': farmName,
  'geometry': geojsonGeometry,  // PostGIS-compatible GeoJSON
  'bounds': boundsJson,
  'area_hectares': areaHa,
  'user_id': supabase.auth.currentUser!.id,
});
```

### Default Farm Polygon (Demo / Fallback)

If no farm is selected, the backend defaults to this polygon (Jash Farm, Bangalore):

```json
{
  "type": "Polygon",
  "coordinates": [[
    [77.77333199305133, 12.392392446684909],
    [77.77285377084087, 12.391034719901086],
    [77.77415744218291, 12.390603704636632],
    [77.77438732135664, 12.391302225016886],
    [77.77376792469431, 12.391501801924363],
    [77.77399141833513, 12.392187846379386],
    [77.77333199305133, 12.392392446684909]
  ]]
}
```

Default map center: `lat: 12.3919, lng: 77.7736`, zoom: 15

### Auto-Sync on App Start

Call `/sync-satellite-dates?farm_id=<id>` once per session (throttle to once per hour) to keep observation dates fresh. Run silently in the background — do not block the UI.

```dart
// Run once per hour using shared_preferences to track last sync time
final prefs = await SharedPreferences.getInstance();
final lastSync = prefs.getInt('last_sync_${farmId}') ?? 0;
final now = DateTime.now().millisecondsSinceEpoch;

if (now - lastSync > 3600000) {
  // fire and forget
  http.post(Uri.parse('...supabase.co/functions/v1/sync-satellite-dates?farm_id=$farmId'), headers: headers);
  prefs.setInt('last_sync_${farmId}', now);
}
```

### Caching Strategy

| Data | Cache Duration | Storage |
|------|---------------|---------|
| Satellite dates | 1 hour | `shared_preferences` |
| Water metrics | 14 days | Supabase `water_metrics_cache` table |
| Advanced monitoring | 90 days | Supabase `advanced_monitoring_timeseries` table |
| Agricultural index tiles | Session | In-memory / `shared_preferences` |
| Weather data | 5 minutes | In-memory |

### API Retry Logic

Retry failed requests up to 3 times with exponential backoff starting at 1 second. The backend already implements retries for Earth Engine getMapId calls (3 retries, 1s delay).

### Error Handling

All endpoints return consistent error shapes:

```json
{
  "success": false,
  "error": "Human-readable message",
  "details": "Stack trace or raw error (optional)"
}
```

Check `success == false` and display the `error` field in the UI.

---

*Generated from the wrkFarm React codebase — Supabase project `udbnskydigoqpxmmduvr`.*
