# Diagnostic Page Flow

This is the current end-to-end flow for `src/pages/FieldDiagnostics.tsx`.

## Current Guarantee

- Frontend API calls resolve only to Supabase Edge Functions. `src/services/api.ts` requires either `VITE_API_BASE_URL` ending in `/functions/v1` or `VITE_SUPABASE_URL`, plus `VITE_SUPABASE_ANON_KEY`.
- Supabase client creation fails if URL/key are missing. The app does not create a null/mock Supabase client.
- Farm selection for diagnostics comes from Supabase RPC `list_farms_geojson`; legacy `savedPolygons` are no longer merged into the diagnostic farm list.
- `analyzeFarm()` requires a Supabase UUID `farmId`; the `/diagnostics` Edge Function also requires `farm_id`.
- Diagnostic grid placement requires real `cellData` samples returned by the Edge Function. If sampling returns zero cells, the request fails instead of synthesizing cells.
- `/diagnostics` writes `diagnostics_cache` before returning. Cache write failure fails the request.
- The page weather card now calls Supabase `/weather`; Open-Meteo is contacted server-side by the Edge Function.
- Disease screen writes Supabase `disease_risk_cells` and `disease_scout_zones`; failed inserts now fail the request.

Map tiles still come from Esri/OpenStreetMap and the KVK lookup is a static local directory; those are display/context helpers, not diagnostic analysis data.

## Page Lifecycle

1. `FieldDiagnostics` loads authenticated user state through `useAbeFarm()`.
2. `useAbeFarm()` calls `getAllFarms()`.
3. `getAllFarms()` calls Supabase RPC `list_farms_geojson`.
4. The selected farm ID is stored in `localStorage` only as an active-selection pointer, not as source data.
5. When `farm.geometry` is present, the page auto-runs `runAnalysis()`.
6. `runAnalysis()` calls `analyzeFarm(farmId, farm.geometry)`.
7. `analyzeFarm()` calls Supabase Edge Function:

```text
GET /functions/v1/diagnostics
  ?polygon=<encoded GeoJSON Polygon/MultiPolygon>
  &farm_id=<Supabase UUID>
  &days=14
  &cloud=50
```

8. The returned `analysis`, `cellData`, and `metadata` are converted into a 10 m grid, problem summaries, severity, urgent flags, and farm statistics.
9. `DiagnosticMap` renders warning cells over the farm boundary.
10. `ProblemSummary`, `ProblemDetailPanel`, `DiagnosticLegend`, `DiagnosticsWeatherCard`, KVK card, and optional scout zones render the side panel.

## Primary Endpoints

| Flow | Endpoint / API | Source / Sink |
| --- | --- | --- |
| Farm list | Supabase RPC `list_farms_geojson` | `farms` |
| Farm diagnostics | `GET /functions/v1/diagnostics` | Google Earth Engine, `diagnostics_cache`, `diagnostics` Storage |
| Weather card | `GET /functions/v1/weather` | Open-Meteo via Supabase Edge Function |
| Existing scout zones | Supabase table read | `disease_scout_zones` |
| Disease screen | `POST /functions/v1/disease-risk-screen` | Google Earth Engine, Open-Meteo, `disease_risk_cells`, `disease_scout_zones` |
| Scout photo upload | Supabase Storage + table insert | `disease-photos`, `farmer_photo_submissions` |
| Photo diagnosis | `POST /functions/v1/disease-image-diagnose` | `farmer_photo_submissions`, VLM provider, Supabase update |

## Diagnostic Edge Function

File: `supabase/functions/diagnostics/index.ts`

Required query params:

- `polygon`: GeoJSON polygon/multipolygon.
- `farm_id`: Supabase UUID.

Optional query params:

- `indices`: comma list; defaults to `nitrogen,phosphorus,potassium,moisture,ndvi`.
- `days`: defaults to `14`.
- `cloud`: defaults to `50`.

Backend sequence:

1. Validate request method and params.
2. Check `diagnostics_cache` for a non-expired row for `farm_id`.
3. Return cache only if the nutrient model version, indices, cloud filter, and stored cell samples are valid.
4. Authenticate Google Earth Engine from Supabase function env.
5. Convert GeoJSON to Earth Engine geometry.
6. Build date window: `endDate = today`, `startDate = today - days`.
7. Build merged optical collection from Sentinel-2, Landsat 8, and Landsat 9.
8. Reject the request if no usable optical images are found.
9. Build a median composite plus first-half and second-half median images.
10. Process all indices in parallel.
11. Sample the stacked index image at 30 m resolution with geometries.
12. Reject zero cell samples.
13. Generate raster PNGs into Supabase Storage bucket `diagnostics`.
14. Upsert `diagnostics_cache`.
15. Return `analysis`, `problems`, `cellData`, `raster_urls`, `bounds`, and `metadata`.

## Diagnostic Math

Shared spectral features:

```text
NDVI = (NIR - RED) / (NIR + RED)
GNDVI = (NIR - GREEN) / (NIR + GREEN)
NDMI = (NIR - SWIR1) / (NIR + SWIR1)
SWIR_Balance = (SWIR1 - SWIR2) / (SWIR1 + SWIR2)
BSI = (SWIR1 + RED - NIR - BLUE) / (SWIR1 + RED + NIR + BLUE)
SAVI = 1.5 * (NIR - RED) / (NIR + RED + 0.5)
EVI = 2.5 * (NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1)
```

The displayed crop-health `ndvi` diagnostic uses MSAVI2:

```text
MSAVI2 = (2*NIR + 1 - sqrt((2*NIR + 1)^2 - 8*(NIR - RED))) / 2
```

Nutrient scores are satellite sufficiency scores on `0..100`, not lab kg/ha:

```text
scoreFromRange(x, min, max) = clamp(((x - min) / (max - min)) * 100, 0, 100)

Nitrogen =
  0.34*scoreFromRange(GNDVI, -0.05, 0.72)
+ 0.24*scoreFromRange(NDVI,  -0.05, 0.85)
+ 0.22*scoreFromRange(EVI,   -0.05, 0.65)
+ 0.20*scoreFromRange(NDMI,  -0.35, 0.45)

Phosphorus =
  0.34*scoreFromRange(EVI,        -0.05, 0.65)
+ 0.24*scoreFromRange(SAVI,       -0.05, 0.62)
+ 0.22*scoreFromRange(-BSI,       -0.45, 0.35)
+ 0.20*scoreFromRange(NDMI,       -0.35, 0.45)

Potassium =
  0.30*scoreFromRange(SAVI,         -0.05, 0.62)
+ 0.28*scoreFromRange(NDMI,         -0.35, 0.45)
+ 0.24*scoreFromRange(SWIR_Balance, -0.25, 0.35)
+ 0.18*scoreFromRange(GNDVI,        -0.05, 0.72)

Moisture = 45.2 * NDMI - 8.7
```

Seasonal thresholds:

| Season | N low/warn | P low/warn | K low/warn | Moisture low/warn | MSAVI2 low/warn |
| --- | --- | --- | --- | --- | --- |
| Winter | 35 / 50 | 30 / 45 | 35 / 50 | 2 / 5 | 0.02 / 0.05 |
| Spring | 45 / 60 | 35 / 50 | 40 / 58 | 6 / 10 | 0.08 / 0.15 |
| Summer | 50 / 65 | 35 / 52 | 45 / 62 | 8 / 14 | 0.12 / 0.20 |
| Fall | 40 / 55 | 32 / 48 | 38 / 55 | 5 / 9 | 0.06 / 0.12 |

Trend detection:

```text
N/P/K trend unit = score points
N/P/K trend flag = (lastMean - firstMean < -15) AND (lastMean < warningThreshold)

Moisture/MSAVI2 trend unit = percent
trendPercent = ((lastMean - firstMean) / firstMean) * 100
trend flag = (trendPercent < -30) AND (lastMean < warningThreshold)
```

`firstMean` comes from the first half of the 14-day window and `lastMean` from the second half. If a half-window has no images, the Edge Function uses first/last available image in the same real collection.

## Client Grid Math

File: `src/services/diagnosticService.ts`

1. `createGridCells(geometry, 10)` builds 10 m cells over each polygon using Turf bounding boxes and `booleanIntersects`.
2. `mapSamplePointsToCells()` assigns each 30 m Earth Engine sample to the containing 10 m cell.
3. `propagateSamplesToNearbyCells()` copies the nearest sample to unsampled neighboring cells within about 30 m.
4. For each cell and index, average valid sample values.
5. A cell is flagged when:

```text
cellValue < lowThreshold
OR
(farm/index trend is true AND cellValue < warningThreshold)
```

Severity:

```text
thresholdPressure = max(0, (warningThreshold - cellValue) / max(warningThreshold, 1))
criticalBoost = 0.32 if cellValue < lowThreshold else 0
trendBoost = min(abs(change) / (50 for points, 100 for percent), 0.35) if trend else 0
confidencePenalty = -0.08 for low, -0.03 for medium, 0 for high
severityScore = clamp(thresholdPressure + criticalBoost + trendBoost + confidencePenalty, 0.15, 1)
```

Cell severity:

```text
high   = multiple problems OR severityScore >= 0.72 OR any urgent problem
medium = severityScore >= 0.45
low    = otherwise
none   = no problems
```

Urgent:

```text
urgent = type == "both"
      OR severityScore >= 0.78
      OR (type == "trend" AND change < -50)
```

Farm health:

```text
totalCells = grid cell count
problemCells = cells with at least one problem
healthyCells = totalCells - problemCells
overlapCells = cells with more than one problem
healthPercent = round(healthyCells / totalCells * 100)
```

## Weather Flow

File: `supabase/functions/weather/index.ts`

Frontend call:

```text
GET /functions/v1/weather
  ?latitude=<farm centroid lat>
  &longitude=<farm centroid lng>
  &start_date=<YYYY-MM-DD>
  &end_date=<YYYY-MM-DD>
```

The Edge Function requests Open-Meteo hourly arrays for:

- `temperature_2m`
- `precipitation`
- `apparent_temperature`
- `wind_speed_10m`
- `cloud_cover`
- `weather_code`

The function rejects missing or length-mismatched arrays. The browser converts returned numeric arrays into `Float32Array` so existing weather UI logic stays unchanged.

## Disease Screen Flow

File: `supabase/functions/disease-risk-screen/index.ts`

Frontend call:

```text
POST /functions/v1/disease-risk-screen
{
  "farm_id": "<Supabase UUID>",
  "crop": "rice" | "millet",
  "growth_stage": "...",
  "season": "kharif" | "rabi",
  "geometry": <GeoJSON>
}
```

Backend sequence:

1. Create Supabase client from function env.
2. Load geometry from body or `farms`.
3. Initialize Earth Engine.
4. Build 14-day Sentinel-2 SR harmonized collection with cloud `< 30`.
5. Return no scout zones if no cloud-free Sentinel-2 images exist.
6. Calculate disease indices from Sentinel-2 red-edge bands.
7. Build 56-day NDVI baseline before the scan window.
8. Compute thermal water-stress image.
9. Sample up to 500 cells at 30 m.
10. Fetch 7-day weather context through Open-Meteo from inside the Edge Function.
11. Score each cell through crop disease models.
12. Compute Getis-Ord Gi* hotspot z-score.
13. Cluster significant hot cells into up to 5 scout zones.
14. Insert all risk cells into `disease_risk_cells`.
15. Replace pending zones for the farm/date and insert new rows into `disease_scout_zones`.

Disease spectral indices:

```text
RBVI = 9.78*B8 - 2.08*(B5/B4)
CIre = (B8/B5) - 1
MTCI = (B8 - B5) / (B5 - B4)
NDMI = (B8 - B11) / (B8 + B11)
NMDI = (B8 - (B11 - B12)) / (B8 + (B11 - B12))
DWS = 0.6*NDMI + 0.4*NMDI
NDVI_CV = localStdDev(NDVI, 30 m kernel) / max(abs(localMean(NDVI)), 0.01)
RIBInir = (B7 - B8A) / (B4 + B8A)
RIBIred = (B5 - B8A) / (B4 + B8A)
REDSI = (40*(B7 - B4) - 118*(B5 - B4)) / (2*B4)
```

Disease model helpers:

```text
clamp01(x) = min(max(x, 0), 1)
ndviAnomaly = clamp01(((baseline - ndvi) / baseline) * 2), baseline > 0.05
thermal water stress = clamp01(thermal*0.5 + dryCanopy*0.3 + uniformDecline*0.2)
thermal multiplier = 1 - waterStress*0.45
```

Rice models:

```text
riceBlast =
  stageMult * thermalMult * (
    0.42*spectralAnomaly
  + 0.18*ndviDecline
  + 0.15*moistureScore
  + 0.15*blastWeather
  + 0.05*redsiCheck
  + 0.05*stageMult
  )

sheathBlight =
  stageMult * thermalMult * (
    0.35*ndviHeterogeneity
  + 0.25*ndviDecline
  + 0.25*wetCanopy
  + 0.15*warmTemp
  )

bacterialLeafBlight =
  stageMult * thermalMult * (
    0.30*waterSignal
  + 0.10*redEdgeProxy
  + 0.20*ndviDecline
  + 0.25*wetCanopy
  + 0.15*stormScore
  )
```

Millet models:

```text
downyMildew =
  stageMult * thermalMult * (
    0.30*ndviDecline
  + 0.25*cireSignal
  + 0.30*coolMoistWeather
  + 0.15*moistureSignal
  )

leafSpot =
  stageMult * thermalMult * (
    0.30*heterogeneity
  + 0.25*ndviDecline
  + 0.25*wetCanopy
  + 0.15*dwsSignal
  + 0.05*redsiCheck
  )

charcoalRot =
  stageMult * (
    0.55*dryStress
  + 0.45*ndviDecline
  )
```

Scout-zone clustering:

```text
candidate cell = composite_risk >= 0.40 AND Gi* z >= 1.96
neighborhood distance = 90 m
merge distance = 50 m
max zones = 5
zone centroid = average member lat/lng
zone max risk = max(member composite_risk)
```

Gi*:

```text
Gi* = (sum(wij*xj) - mean(x)*sum(wij))
      / (S * sqrt((n*sum(wij^2) - sum(wij)^2) / (n - 1)))
```

## Scout Photo Flow

When a scout zone is clicked:

1. `ScoutZoneCapture` checks browser GPS distance to the zone using haversine distance.
2. Camera capture creates a JPEG blob.
3. `uploadDiseasePhoto()` uploads to Supabase Storage bucket `disease-photos`.
4. It inserts a `farmer_photo_submissions` row with farm, zone, location, crop, growth stage, and satellite context.
5. `triggerImageDiagnosis()` calls `POST /functions/v1/disease-image-diagnose`.
6. The Edge Function reads the photo, runs the VLM diagnosis, updates the submission, and returns diagnosis, model, confidence, severity, differential, evidence, and scout action.

## What The AI Can Reason With On This Page

- Farm polygon and area from Supabase `farms`.
- Satellite diagnostic per-index means/min/max/stdDev.
- Cell-level sampled values for N, P, K, moisture, and MSAVI2.
- Threshold and trend flags.
- Cell severity, urgency, and overlap.
- Weather returned through Supabase `/weather`.
- Disease risk cells and scout zones persisted in Supabase.
- Farmer photos and VLM diagnosis results persisted in Supabase.
- KVK nearest-center context from local static `kvkService`.

The diagnostic map should fail when required real data is unavailable. It should not create local warning cells, random problem cells, or use non-Supabase API routes for the diagnostic page data flow.
