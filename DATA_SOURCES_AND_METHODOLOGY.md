# Sentinel Agro Insight — Data Sources, Methodology & AI/ML Documentation

> Last updated: 2026-06-09  
> This document covers every dataset, formula, AI/ML component, and numerical constant used in the platform.

---

## Table of Contents

1. [Satellite Datasets](#1-satellite-datasets)
2. [Agricultural Index Formulas](#2-agricultural-index-formulas)
3. [Soil Parameter Indices](#3-soil-parameter-indices)
4. [Yield Prediction Model](#4-yield-prediction-model)
5. [Advanced Monitoring Algorithms](#5-advanced-monitoring-algorithms)
6. [AI & RAG Advisory System](#6-ai--rag-advisory-system)
7. [Water Metrics Calculations](#7-water-metrics-calculations)
8. [Traceability Risk Scoring](#8-traceability-risk-scoring)
9. [Seasonal Thresholds & Diagnostics](#9-seasonal-thresholds--diagnostics)
10. [Mock Data vs. Real Data](#10-mock-data-vs-real-data)
11. [Scientific References](#11-scientific-references)
12. [Data Flow Architecture](#12-data-flow-architecture)

---

## 1. Satellite Datasets

### 1.1 Optical Imagery

#### Sentinel-2 L2A (Primary)
| Property | Value |
|---|---|
| Collection ID | `COPERNICUS/S2_SR_HARMONIZED` |
| Revisit Time | 5 days |
| Resolution | 10m (B2/B3/B4/B8), 20m (B5/B11/B12) |
| Scale Factor | 0.0001 |
| Cloud Filter | `CLOUDY_PIXEL_PERCENTAGE < 20%` |

**Bands used:**

| Band | Name | Wavelength | Use |
|---|---|---|---|
| B2 | Blue | 490nm | EVI, salinity |
| B3 | Green | 560nm | GNDVI, NDWI, pH |
| B4 | Red | 665nm | NDVI, salinity |
| B5 | Red Edge | 705nm | NDRE (nitrogen) |
| B8 | NIR | 842nm | NDVI, EVI, NDWI |
| B11 | SWIR1 | 1610nm | NDMI, pH |
| B12 | SWIR2 | 2190nm | NMDI |

#### Landsat 8 (Fallback)
| Property | Value |
|---|---|
| Collection ID | `LANDSAT/LC08/C02/T1_L2` |
| Revisit Time | 16 days |
| Scale Factor | 0.0000275 (+ offset −0.2) |
| Cloud Filter | `CLOUD_COVER` property |

**Band mapping (renamed to harmonized names):**

| Raw Band | Harmonized | Corresponds To |
|---|---|---|
| SR_B2 | Blue | S2 B2 |
| SR_B3 | Green | S2 B3 |
| SR_B4 | Red | S2 B4 |
| SR_B5 | NIR | S2 B8 |
| SR_B6 | SWIR1 | S2 B11 |
| SR_B7 | SWIR2 | S2 B12 |

#### Landsat 9
- Identical structure to Landsat 8
- Collection ID: `LANDSAT/LC09/C02/T1_L2`

---

### 1.2 SAR (Radar) Data

#### Sentinel-1 GRD
| Property | Value |
|---|---|
| Collection ID | `COPERNICUS/S1_GRD` |
| Mode | IW (Interferometric Wide swath) |
| Polarizations | VV (vertical-vertical), VH (vertical-horizontal) |
| Units | dB (log scale) |
| Pass Direction | Ascending + Descending (merged) |

**Speckle Filters:**
- **Refined Lee**: Adaptive edge-preserving filter (preferred for agricultural fields)
- **Boxcar (Mean)**: 3×3 averaging kernel (fallback)

**Filter configuration (Refined Lee):**
```
Window size: 9×9
Sigma: 0.9
ENL (Equivalent Number of Looks): 1
```

---

### 1.3 Date Ranges & Configuration

| Config | Value |
|---|---|
| Default start date | 2024-01-01 |
| Default end date | 2024-12-31 |
| Historical baseline window | 14 days |
| Cache duration (satellite indices) | 1 hour |
| Diagnostic cache (raster) | 24 hours (Supabase Storage) |

---

## 2. Agricultural Index Formulas

All band variables refer to surface reflectance values after scale factor correction.

### 2.1 Vegetation Indices

#### NDVI — Normalized Difference Vegetation Index
```
NDVI = (NIR - Red) / (NIR + Red)
     = (B8 - B4) / (B8 + B4)
```
- Range: −1 to 1 (healthy crops typically 0.4–0.9)
- Accuracy: R² = 0.85–0.95
- Used in: yield prediction (30% weight), diagnostics, trend analysis

#### EVI — Enhanced Vegetation Index
```
EVI = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1)
    = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)
```
- Reduces atmospheric noise and soil background effects vs. NDVI
- Accuracy: R² = 0.80–0.90
- Used in: phosphorus estimation, yield prediction, SOC calculation

#### GNDVI — Green NDVI
```
GNDVI = (NIR - Green) / (NIR + Green)
      = (B8 - B3) / (B8 + B3)
```
- More sensitive to chlorophyll concentration than NDVI
- Accuracy: R² = 0.85–0.92
- Used in: nitrogen estimation (primary), Landsat nitrogen fallback

#### NDRE — Red Edge NDVI (Sentinel-2 only)
```
NDRE = (NIR - RedEdge) / (NIR + RedEdge)
     = (B8 - B5) / (B8 + B5)
```
- Wavelength: 705nm red edge — optimal for nitrogen at saturation
- Nitrogen conversion: `N (kg/ha) = 45.2 × NDRE + 125.8`  (R² = 0.91)
- Not available on Landsat; falls back to GNDVI-only

#### SAVI — Soil Adjusted Vegetation Index
```
SAVI = ((NIR - Red) / (NIR + Red + 0.5)) × 1.5
     = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5
```
- L factor = 0.5 (standard for moderate vegetation)
- Adjusts for soil background reflectance
- Accuracy: R² = 0.80–0.90
- Used in: potassium estimation, SOC calculation

#### MSAVI — Modified SAVI
```
MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2
```
- Self-optimizing soil adjustment (no fixed L factor)

---

### 2.2 Water / Moisture Indices

#### NDWI — Normalized Difference Water Index
```
NDWI = (Green - NIR) / (Green + NIR)
     = (B3 - B8) / (B3 + B8)
```
- Values > 0.5 typically indicate open water
- Used in: water mapping, canopy moisture, yield prediction (10% weight)

#### NDMI — Normalized Difference Moisture Index
```
NDMI = (NIR - SWIR1) / (NIR + SWIR1)
     = (B8 - B11) / (B8 + B11)
```
- Volumetric moisture conversion: `Moisture (%) = 45.2 × NDMI − 8.7`
- Accuracy: R² = 0.65–0.80

#### NMDI — Normalized Multi-band Drought Index
```
NMDI = (NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))
     = (B8 - (B11 - B12)) / (B8 + (B11 - B12))
```
- Distinguishes water stress from vegetation stress

---

### 2.3 NPK Nutrient Proxies

> **Important:** These are satellite sufficiency scores (0–100 scale), not direct kg/ha measurements. They require field calibration before use in fertilizer decisions.

#### Nitrogen (N) — Sufficiency Score
**Weighted index approach (Diagnostics v2):**
```
N_score = (GNDVI_normalized × 0.4) + (NDVI_normalized × 0.3)
        + (EVI_normalized × 0.2) + (NDMI_normalized × 0.1)
```

**Direct conversion (when needed for display):**
```
N (kg/ha) = 259.4 × NDVI − 58.6          [R² = 0.90, NDVI-based]
N (kg/ha) = 45.2 × NDRE + 125.8          [R² = 0.91, NDRE-based, preferred late-season]
```

#### Phosphorus (P₂O₅) — Sufficiency Score
**Weighted index approach (Diagnostics v2):**
```
P_score = (EVI_normalized × 0.35) + (SAVI_normalized × 0.30)
        + (SWIR_balance × 0.20) + (NDMI_normalized × 0.15)
```

**Direct conversion:**
```
P₂O₅ (kg/ha) = 180 × EVI − 25
```
- Confidence: LOW — requires soil test confirmation

#### Potassium (K₂O) — Sufficiency Score
**Weighted index approach (Diagnostics v2):**
```
K_score = (SAVI_normalized × 0.35) + (NDMI_normalized × 0.25)
        + (SWIR_balance × 0.25) + (GNDVI_normalized × 0.15)
```

**Direct conversion:**
```
K₂O (kg/ha) = 250 × SAVI − 40
```
- Confidence: MEDIUM

**Model metadata:**
- Version: `npk-sufficiency-v2`
- Unit: 0–100 satellite sufficiency score
- Scientific basis: Dianati et al. 2025, Li et al. 2023, Zhang et al. 2025 (see §11)

---

## 3. Soil Parameter Indices

### 3.1 Soil Salinity (ECe)

#### Simple formula
```
SI = B2 × B4     (Salinity Index)
ECe (dS/m) = 0.0045 × SI + 1.2
```

#### Advanced formula
```
NDSI = (B4 - B8) / (B4 + B8)
BI   = √(B4² + B8²)
ECe  = 2.1×SI + 0.8×NDSI − 0.6×BI + 3.2
```

**Derived conversions:**
```
TDS (mg/L) = ECe × 800          [valid for EC < 5 dS/m]
Salt (%)   = ECe × 0.064 / 100
```
- Accuracy: R² = 0.70–0.85
- Calibration required for site-specific accuracy

---

### 3.2 Soil pH

#### Simple formula (±0.35 pH units)
```
pH = 0.023×B2 − 0.015×B11 + 7.2
```

#### Advanced formula
```
BI  = √(B4² + B8²)
SI₂ = B3² + B4²
pH  = 5.8 + 0.12×BI − 0.08×SI₂ + 0.05×B8
```
- Accuracy: R² = 0.70–0.87
- Optimal range for most crops: 6.0–7.0

---

### 3.3 Soil Organic Carbon (SOC)

| Formula | R² | Notes |
|---|---|---|
| `SOC (%) = 12.5 × NDVI − 3.2` | 0.79 | Simple |
| `SOC (%) = 8.5 × EVI + 2.1 × SAVI − 1.8` | ~0.82 | Enhanced |
| `SOC (%) = 15×NDVI + 8×EVI + 5×OSAVI − 7.5` | ~0.85 | Multi-index |
| `SOC (Mg/ha) = 85 × EVI − 15` | ~0.84 | Carbon stock (0–30cm depth) |

- Accuracy range: R² = 0.75–0.90

---

## 4. Yield Prediction Model

**File:** `src/services/yieldPredictionService.ts`  
**Architecture:** Ensemble of 5 base models with fixed weight averaging  
**Overall accuracy:** R² = 0.90, RMSE = 0.86 Mg/ha (based on Ens-6 ensemble research)

### 4.1 Base Models & Weights

#### Model 1: Vegetation Model (weight: 30%)
```
Yield_veg = 8.5 + (NDVI × 4.2) + (EVI × 2.1)
```
- Base yield: 8.5 Mg/ha (corn baseline)

#### Model 2: Soil Health Model (weight: 20%)
```
pH_factor  = 1 − |soilPh − 6.5| / 3
OM_factor  = min(soilOrganicMatter / 3.0, 1.0)
NPK_factor = (N/200 + P/50 + K/200) / 3

Yield_soil = 6.0 + (pH_factor × 1.5) + (OM_factor × 1.2) + (NPK_factor × 1.8)
```
- Optimal soil pH: 6.5

#### Model 3: Management Practices Model (weight: 25%)
```
Irrigation factor:
  rainfed   → 0.85
  flood     → 0.95
  sprinkler → 1.05
  drip      → 1.15

Fertilizer penalty: based on deviation from 175 kg/ha optimal
Seed rate penalty:  based on deviation from 22.5 kg/ha optimal

Yield_mgmt = base_yield × irrigation_factor × fertilizer_factor × seed_factor
```

#### Model 4: Growth Stage Model (weight: 15%)
```
Corn growth stages (days since planting):
  V0 (Emergence):            <10 days   → stage_factor = 0.30
  V2-V4 (Early Vegetative):  10-20 days → stage_factor = 0.45
  V5-V8 (Mid Vegetative):    20-40 days → stage_factor = 0.60
  V9-V12 (Late Vegetative):  40-60 days → stage_factor = 0.75
  R1 (Silking):              60-75 days → stage_factor = 0.88
  R2-R3 (Blister to Milk):   75-90 days → stage_factor = 0.93
  R4-R5 (Dough to Dent):    90-110 days → stage_factor = 0.97
  R6 (Physiological Maturity): 110-130  → stage_factor = 1.00
  Harvest Ready:              >130 days → stage_factor = 1.00

Yield_stage = 8.0 × stage_factor
Days to harvest: 130 (corn default)
```

#### Model 5: Water Index Model (weight: 10%)
```
optimal_NDWI = 0.3
water_factor = 1 − |NDWI − optimal_NDWI|

Yield_water = 7.5 + (water_factor × 1.5)
```

### 4.2 Final Ensemble Prediction
```
Yield_final = 0.30×Yield_veg + 0.20×Yield_soil + 0.25×Yield_mgmt
            + 0.15×Yield_stage + 0.10×Yield_water
```

### 4.3 Confidence Calculation
```
CV (Coefficient of Variation) = stdDev(all_model_predictions) / mean(all_model_predictions)
Confidence (%) = (1 − CV) × 100
Confidence interval: ± 1.96 × stdDev          [95% CI]
```

---

## 5. Advanced Monitoring Algorithms

**File:** `supabase/functions/_shared/optical-algorithms.ts`, `sar-algorithms.ts`, `sensor-fusion.ts`

### 5.1 OPTRAM (Optical Trapezoid Model)

Estimates soil/canopy moisture from the STR–NDVI feature space.

```
STR (Soil Temperature Reflectance) = (1 - SWIR)² / (2 × SWIR)

Dry edge:  STR_dry = fitted to 95th percentile of STR distribution
Wet edge:  STR_wet = fitted to  5th percentile of STR distribution

Moisture = (STR - STR_dry) / (STR_wet - STR_dry)   → clamped to [0, 1]
```
- Sampling scale: 30m
- Output: Continuous moisture [0, 1]

### 5.2 PCA-based Nutrient Estimation

#### Phosphorus (SSRI weights)
```
Standardization: Z-score of [Blue, Green, NIR, SWIR1, SWIR2] bands

SSRI_P = 0.4×Blue_z + 0.3×Green_z + 0.0×NIR_z + 0.2×SWIR1_z + 0.1×SWIR2_z
```

#### Potassium (SSRI weights)
```
SSRI_K = 0.0×Blue_z + 0.1×Green_z + 0.1×NIR_z + 0.3×SWIR1_z + 0.3×SWIR2_z + 0.2×(other)
```
- PCA: 2 components extracted
- Explained variance: ~45% (PC1), ~35% (PC2)

### 5.3 Nitrogen Estimation (Multi-sensor)

```
GNDVI = (NIR - Green) / (NIR + Green)        [all sensors]
NDRE  = (NIR - RedEdge) / (NIR + RedEdge)    [Sentinel-2 only]

If Sentinel-2:
  N_index = 0.6 × GNDVI + 0.4 × NDRE

If Landsat (no red edge):
  N_index = GNDVI
```

### 5.4 SAR Moisture Change Detection (Sentinel-1)

```
Historical baseline: Mean (μ) and StdDev (σ) over prior observations

Z-score = (Current_backscatter - μ) / σ

Significance: |Z| > 1.96  (95% confidence)

Moisture_change = -1 × Z × 0.1     (sensitivity factor)
Output range: [-1, 1]
```

### 5.5 Optical–SAR Sensor Fusion

NDVI-weighted blending of OPTRAM and SAR moisture estimates:

```
If NDVI < 0.3:   optical_weight = 1.0,  sar_weight = 0.0   (bare/sparse)
If NDVI > 0.5:   optical_weight = 0.0,  sar_weight = 1.0   (dense canopy)
If 0.3 ≤ NDVI ≤ 0.5:  linear interpolation

Fused_moisture = (OPTRAM × optical_weight + SAR × sar_weight)
               / (optical_weight + sar_weight)
```
- Confidence is highest at weight extremes, lower in the 0.3–0.5 NDVI transition zone

---

## 6. AI & RAG Advisory System

### 6.1 Gemini API Integration

**File:** `supabase/functions/rag-advisor/index.ts`

| Parameter | Value |
|---|---|
| Primary model | `gemini-2.5-flash` |
| Fallback models | `gemini-2.5-flash-lite`, `gemini-2.5-pro` |
| API versions tried | `v1beta`, `v1` |
| Endpoint | `https://generativelanguage.googleapis.com/{version}/models/{model}:generateContent` |
| Temperature | 0.25 (near-deterministic) |
| Max output tokens | 1800 |
| Response format | JSON |
| Auth | `GEMINI_API_KEY` environment variable |

**Structured output schema:**
```json
{
  "answer": "string — main agronomic explanation",
  "priority_actions": ["list of actionable recommendations"],
  "disease_risk_triage": [
    {
      "risk": "disease or stress name",
      "severity": "low | medium | high",
      "why": "evidence from satellite data",
      "scout_action": "field verification step"
    }
  ],
  "followups": ["suggested follow-up questions"]
}
```

---

### 6.2 RAG System (Retrieval-Augmented Generation)

**Files:** `supabase/functions/_shared/rag-core.ts`, `rag-supabase.ts`

#### Embedding Generation
- Dimension: 384
- Method: Hash-based tokenization + L2-normalized vector
- Tokenization: regex `/[a-z0-9_]+/g` on lowercased text
- Hash: FNV-1a variant → maps tokens to float components
- Note: Not a trained neural embedding — deterministic hash projection

#### pgvector Database Configuration
```sql
CREATE EXTENSION vector;

-- Table
CREATE TABLE rag_chunks (
  id uuid PRIMARY KEY,
  content text,
  embedding vector(384),
  metadata jsonb
);

-- Index
CREATE INDEX ON rag_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search
CREATE INDEX ON rag_chunks USING gin(to_tsvector('english', content));
```
- Index type: HNSW (Hierarchical Navigable Small World)
- Distance metric: Cosine similarity

#### Retrieval Strategy
1. Keyword scoring (TF-IDF-like term frequency against chunk text)
2. Constraint filtering by `crop`, `season`, `region` metadata tags
3. Top-K selection (default K = 8, configurable)
4. Fallback: In-code knowledge base if DB unavailable

#### Fallback Knowledge Base (In-code)
4 hardcoded chunks focused on Maharashtra, India agriculture:
- Nutrients (ICAR recommendations)
- Weather patterns (IMD data)
- Rice diseases (KVK guidance)
- Millet diseases (KVK guidance)

**Source authorities:** ICAR, KVK (Krishi Vigyan Kendra), IMD (India Meteorological Department)

---

## 7. Water Metrics Calculations

**Files:** `src/services/waterMetricsService.ts`, `src/services/waterMetricsCacheService.ts`

### 7.1 Balance Calculation
```
CV (Coefficient of Variation) = stdDev / |meanValue|
Balance (%) = max(0, min(100, 100 − (CV × 100)))
```

**Status thresholds:**
| Balance % | Status |
|---|---|
| > 70% | `balanced` |
| 50–70% | `uneven` |
| < 50% | `critical` |

### 7.2 Trend Calculation (14-day window)
```
Trend (%) = ((mean(last_7_days) - mean(first_7_days)) / |mean(first_7_days)|) × 100
```

### 7.3 Data Source
- Supabase table: `water_metrics_cache`
- Cache duration: 14 days
- Fields: `mean_value`, `std_dev`, `observation_date`
- Aggregation: All available satellite sources combined

---

## 8. Traceability Risk Scoring

**File:** `src/services/traceabilityRisk.ts`, `supabase/functions/trace-risk-score/`

### 8.1 Risk Score Components
The composite risk score considers:
- **Evidence completeness**: Presence of required trace events (planting, harvest, chemical application)
- **Hash integrity**: SHA-256 hash chain validation — each event references prior event hash
- **Temporal consistency**: Event timestamps in logical order
- **Geolocation validation**: Coordinates within field boundary polygon (Turf.js point-in-polygon)
- **Chemical compliance**: Cross-reference against known prohibited substances list

### 8.2 Hash Chain Integrity
```
event_hash = SHA-256(lot_id + event_type + timestamp + payload_json + prev_hash)
```
- Tamper detection: Any modification breaks the chain from that point forward
- Verification: Recalculate all hashes and compare to stored values

### 8.3 Risk Score Output
- Range: 0–100 (higher = more risk)
- Thresholds:
  - 0–30: Low risk (green)
  - 31–60: Medium risk (amber)
  - 61–100: High risk (red)

---

## 9. Seasonal Thresholds & Diagnostics

**File:** `src/services/diagnosticService.ts`

### 9.1 NPK Sufficiency Thresholds by Season (0–100 scale)

| Season | N Low / Warning | P Low / Warning | K Low / Warning | Moisture (NDMI) Low / Warning | Vegetation (NDVI) Low / Warning |
|---|---|---|---|---|---|
| Winter | 35 / 50 | 30 / 45 | 35 / 50 | 0.02 / 0.05 | 0.02 / 0.05 |
| Spring | 45 / 60 | 35 / 50 | 40 / 58 | 0.06 / 0.10 | 0.08 / 0.15 |
| Summer | 50 / 65 | 35 / 52 | 45 / 62 | 0.08 / 0.14 | 0.12 / 0.20 |
| Fall   | 40 / 55 | 32 / 48 | 38 / 55 | 0.05 / 0.09 | 0.06 / 0.12 |

### 9.2 Trend Detection Logic
```
Trend alert triggered if:
  (last_value - first_value) / first_value < -0.30   [−30% decline]
  OR
  NPK_score_last - NPK_score_first < -15              [−15 points on 0–100 scale]
```

### 9.3 Grid Cell Configuration
| Parameter | Value |
|---|---|
| Cell resolution | 10m spacing |
| Aggregation scale | 30m (Landsat native; 3× Sentinel-2) |
| Intersection method | Turf.js boolean polygon intersection |
| Max cells per farm | ~100–300 (depends on farm size) |

---

## 10. Mock Data vs. Real Data

### 10.1 Traceability System

| Environment | Data Source |
|---|---|
| Default (dev/test) | Mock data (`traceabilityMockData.ts`) |
| Production with `VITE_TRACEABILITY_LIVE=true` | Live Supabase API |
| API failure fallback | Falls back to mock automatically |

**Mock farm locations (Pennsylvania orchards):**
| Farm | Crop | Coordinates |
|---|---|---|
| Centre Hall Honeycrisp | Apple | 40.847°N, 77.686°W |
| Boalsburg Gala | Apple | 40.775°N, 77.792°W |
| Bellefonte Cider | Apple | 40.913°N, 77.778°W |
| Warriors Mark Fuji | Apple | 40.703°N, 78.130°W |
| Port Matilda GoldRush | Apple | 40.800°N, 78.050°W |

**Offline queue:**
- Storage: `localStorage` key `offline_trace_queue`
- Entry structure: `{id, type, payload, createdAt, lastError}`
- Behavior: Client-side retry on reconnection

### 10.2 Diagnostic Analysis

| Path | Trigger |
|---|---|
| Live (Earth Engine) | Server reachable + valid farm UUID |
| Synthetic grid fallback | Server unavailable or offline draft farm ID |
| Cached raster | Within 24-hour cache window (Supabase Storage) |

### 10.3 Test Farm (Constants)

**File:** `src/constants/index.ts`
- Location: Centre County, Pennsylvania, USA
- Area: 85 hectares
- Boundary coordinates:
  ```
  [−78.09880022071837, 40.65864666584693]
  [−78.09482469944236, 40.64757911378487]
  [−78.08724425633122, 40.65215460616687]
  ```

---

## 11. Scientific References

### 11.1 NPK Nutrient Model
1. **Dianati et al. 2025** — *Scientific Reports*  
   DOI: [10.1038/s41598-025-25034-z](https://doi.org/10.1038/s41598-025-25034-z)

2. **Li et al. 2023** — *Science of The Total Environment*  
   DOI: [10.1016/j.scitotenv.2023.161421](https://doi.org/10.1016/j.scitotenv.2023.161421)

3. **Zhang et al. 2025** — *Plant Methods*  
   DOI: [10.1186/s13007-025-01389-2](https://doi.org/10.1186/s13007-025-01389-2)

### 11.2 Yield Prediction Accuracy
- **Ensemble-6 (Ens-6) model**: R² = 0.90, RMSE = 0.86 Mg/ha

### 11.3 Index Accuracy Ranges

| Index | R² Range | Limitation |
|---|---|---|
| NDVI | 0.85–0.95 | Saturates at high biomass |
| EVI | 0.80–0.90 | Requires blue band |
| GNDVI | 0.85–0.92 | — |
| NDRE | 0.88–0.95 | Sentinel-2 only (705nm) |
| NDMI (moisture) | 0.65–0.80 | Site calibration needed |
| ECe (salinity) | 0.70–0.85 | Soil type dependent |
| pH | 0.70–0.87 | ±0.35 pH unit uncertainty |
| SOC | 0.75–0.90 | Vegetation cover interference |

---

## 12. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SATELLITE INPUTS                         │
│   Sentinel-2 L2A    Landsat 8/9         Sentinel-1 GRD SAR     │
│   (S2_SR_HARMONIZED) (LC08/LC09/C02)   (S1_GRD / VV+VH)       │
└─────────────┬──────────────┬──────────────────┬────────────────┘
              │              │                  │
              ▼              ▼                  ▼
     Band scaling    Band renaming         Speckle filter
     (× 0.0001)     (+ offset −0.2)       (Refined Lee)
              │              │                  │
              └──────────────┴──────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  AGRICULTURAL INDICES    │
              │  NDVI, EVI, GNDVI, NDRE  │
              │  SAVI, NDWI, NDMI, NMDI  │
              │  SI, NDSI, BI (salinity) │
              └─────────────┬────────────┘
                            │
              ┌─────────────┼─────────────────┐
              ▼             ▼                 ▼
        NPK Scoring    OPTRAM Model      SAR Z-score
        (sufficiency   (STR-NDVI         (moisture
         v2 formulas)   trapezoid)        change)
              │             │                 │
              │             └────────┬────────┘
              │                      ▼
              │              Sensor Fusion
              │              (NDVI-weighted
              │               optical+SAR)
              │                      │
              └──────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   DIAGNOSTICS ANALYSIS   │
              │  Seasonal thresholds     │
              │  Trend detection (−30%)  │
              │  Grid cell mapping       │
              │  10m/30m aggregation     │
              └─────────────┬────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
       Yield Prediction  Water Metrics  Traceability
       (Ensemble 5-model  (14-day cache  Risk Score
        R²=0.90)          balance)       (hash chain)
              │             │              │
              └─────────────┴──────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  RAG + GEMINI ADVISORY   │
              │  pgvector retrieval      │
              │  384-dim hash embeddings │
              │  gemini-2.5-flash        │
              │  T=0.25, max 1800 tokens │
              └──────────────────────────┘
                             │
                             ▼
                     UI Dashboard
                  (React + Leaflet maps)
```

---

*This document was generated from code analysis of the sentinel-agro-insight-1 repository. Formulas reflect the actual implementation in source files. Accuracy figures and scientific references are cited from code comments and documented metadata.*
