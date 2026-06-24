# Sentinel Agro Insight — Technical & Analytical Details

This document provides a comprehensive deep-dive into the technical mechanics of **wrkFarm's Sentinel Agro Insight** platform. It details the precise formulas for optical indices, the weighted risk models for disease detection, the vision-language model prompts, and the final advisory output structure.

---

## 1. System Overview

**Pipeline Architecture:**
1. **Satellite Pre-Screen:** Sentinel-2 imagery (every ~5 days) is processed via Google Earth Engine to compute disease-specific vegetation indices at a 30m resolution. Points are scored against epidemiological disease models, generating GPS-pinned "scout zones."
2. **Field Photo Diagnosis:** The farmer visits a scout zone, takes a photo, and the image is processed by a Vision-Language Model (VLM, Qwen2.5-VL-7B) enriched with the satellite context to generate a structured differential diagnosis.
3. **District-Specific Advisory:** A large language model (Qwen3-235B) uses RAG (Retrieval-Augmented Generation) grounded in local KVK data to synthesize an actionable crop management plan.

---

## 2. Satellite Data Sources

The platform fuses data from a constellation of Earth observation satellites and meteorological APIs to ensure continuous monitoring regardless of cloud cover.

### Optical & Multispectral
- **Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`):** 10m resolution, ~5-day revisit. The primary source for all disease and vegetation indices.
- **Landsat 8 & Landsat 9 (`LANDSAT/LC08...` and `LC09...`):** 30m resolution, 16-day revisit (8-day combined). Used as an optical fallback when Sentinel-2 is cloud-covered. Standardized via the HLS (Harmonized Landsat Sentinel) pipeline.

### Radar (Cloud Penetration)
- **Sentinel-1 (`COPERNICUS/S1_GRD`):** 10m resolution, ~6-day revisit. Synthetic Aperture Radar (SAR) backscatter used to measure canopy water content and surface roughness when clouds completely block optical sensors (e.g., during the monsoon season).

### Thermal (Abiotic Stress)
- **MODIS (`MODIS/061/MOD11A2`) & Landsat Thermal:** Used to measure Land Surface Temperature (LST). Identifies abiotic water stress (drought) to prevent false-positive disease flags.

### Meteorological Data
- **Open-Meteo API:** Provides hourly point-based weather telemetry (temperature windows, rainfall, leaf wetness hours) crucial for the epidemiological risk models.

---

## 3. Satellite Spectral Indices & Formulas

The platform utilizes a combination of standard and disease-specific optical indices calculated from Sentinel-2 bands (10m and 20m resolution).

| Index | Formula | Purpose |
|-------|---------|---------|
| **RBVI** (Rice Blast Vegetation Index) | `9.78 × B8 − 2.08 × (B5 / B4)` | Custom index for detecting rice blast chlorophyll degradation. |
| **CIre** (Red-Edge Chlorophyll Index) | `(B8 / B5) − 1` | Sensitive to chlorophyll drawdown from disease and nitrogen stress. |
| **MTCI** | `(B8 − B5) / (B5 − B4)` | Measures canopy-level chlorophyll content. |
| **DWS** (Disease Water Stress) | `0.6 × NDMI + 0.4 × NMDI` | Evaluates canopy wetness conditions favoring blast, BLB, and sheath blight. |
| **NDVI_CV** (Spatial Heterogeneity) | `stdDev(NDVI) / mean(NDVI)` (30m kernel) | Measures canopy patchiness; a proxy for sheath blight disruption. |
| **RIBInir** (Rice Blast Index NIR) | `(B7 − B11) / (B4 + B11)` | Evaluates mesophyll damage and leaf desiccation (decreases with blast). |
| **RIBIred** | `(B5 − B8A) / (B4 + B8A)` | Red-edge proxy. Rises with disease as chlorophyll loss lifts B5 (705nm) reflectance. |
| **PSRI** (Plant Senescence Reflectance) | `(B4 − B3) / B7` | Elevated carotenoid-to-chlorophyll ratio. Used as the BLB senescence signal. |
| **REDSI** (Red-Edge Disease Stress) | `(B7 - B4)×40 - (B5 - B4)×118 / (2×B4)` | Triangle area over B4/B5/B7 used as a red-edge foliar cross-check baseline. |

*(Note: B3=Green, B4=Red, B5=Red Edge 1, B7=Red Edge 3, B8=NIR, B8A=Narrow NIR, B11=SWIR 1, B12=SWIR 2).*

---

## 4. Disease Risk Models

Each disease model produces a risk score `[0, 1]` where 0 = healthy, 1 = maximum satellite-indicated risk. The models use weighted heuristics combining spectral anomalies, weather conditions, and growth stage multipliers. A **Thermal Confounder** suppresses scores if the signature looks like abiotic water stress (hot + dry + spatially uniform) rather than disease.

### 4.1. Rice Blast Risk Model
- **Spectral Anomaly (42%):** Includes RBVI, RIBInir, CIre, and MTCI decline.
- **NDVI Decline (18%):** Decline vs. 14-day baseline.
- **Moisture Score (15%):** Elevated DWS indicating wet canopy.
- **Weather Score (15%):** 20–28°C + >10h leaf wetness.
- **Cross-check & Stage (10%):** REDSI check and growth stage multiplier (peak at tillering: 1.0).

### 4.2. Sheath Blight Risk Model
- **Heterogeneity (35%):** High NDVI_CV indicating spatial patchiness.
- **NDVI Decline (25%)**
- **Wet Score (25%):** High rainfall + leaf wetness hours.
- **Warm Score (15%):** Mean temp > 20°C.
- **Stage Multiplier:** Peak at tillering (1.0).

### 4.3. Bacterial Leaf Blight (BLB) Risk Model
- **Water Signal (25%):** DWS spike (water-soaked lesions).
- **NDVI Decline (20%)**
- **Wet Score (25%)** + **Storm Score (10%):** Heavy recent rainfall.
- **Red Edge (10%)** + **Senescence (10%):** RIBIred and PSRI anomaly.
- **Stage Multiplier:** Peak at seedling (0.90) & tillering (0.85).

### 4.4. Millet Disease Risk Models
- **Downy Mildew:** Early-season NDVI decline (30%), CIre drop (25%), cool/moist weather (30%), canopy moisture (15%). Peak at seedling (0.90).
- **Leaf Spot:** NDVI patchiness (30%), NDVI decline (25%), wet canopy (25%), DWS signal (15%), REDSI check (5%). Peak at panicle initiation (1.0).
- **Charcoal Rot (Rabi Jowar):** Late-season dry stress (55%), late-season NDVI decline (45%). Peak at grain fill (1.0).

---

## 5. Vision-Language Model (VLM) Pipeline

**Model:** `qwen2.5-vl-7b-instruct` (Fallback: `qwen-vl-plus`, `qwen-vl-max`)

**Input Context:**
- Field photograph provided by the farmer.
- Crop type and current growth stage.
- **Satellite Context Injection:** RBVI, CIre, NDVI, Canopy Moisture, Top risk candidates, Weather blast pressure, and Composite risk score.

**Output Schema (Strict JSON):**
```json
{
  "confirmed_diagnosis": "<disease_name|abiotic_stress|healthy|unclear_image|uncertain>",
  "confidence": 0.85,
  "severity_pct": 30,
  "differential": [
    { 
      "disease": "Sheath Blight", 
      "likelihood": "medium", 
      "distinguishing_feature": "Look for oval, greenish-grey spots on leaf sheaths" 
    }
  ],
  "visual_evidence": ["diamond-shaped lesions", "gray centers with brown borders"],
  "scout_action": "Check lower canopy for advancing lesion borders",
  "requires_lab_confirmation": false,
  "safe_to_spray": true,
  "notes": "Clear blast symptoms, consistent with high RBVI anomaly."
}
```

---

## 6. RAG Advisory Output Model

**Model:** `qwen3-235b-a22b` (Fallback: `gemini-2.5-flash`)

**Context Injection:**
- VLM Confirmed Field Diagnosis (if available).
- Retrieved pgvector chunks matched to the closest district KVK (Krishi Vigyan Kendra).
- Farm context (crop, season, location constraints).

**Output Schema (Strict JSON):**
```json
{
  "answer": "Detailed localized advice synthesizing satellite, photo, and KVK recommendations...",
  "priority_actions": [
    "Apply Tricyclazole 75% WP at 0.6g/L immediately",
    "Drain field for 2-3 days to reduce humidity"
  ],
  "disease_management": {
    "confirmed_disease": "rice_blast",
    "urgency": "immediate",
    "action_steps": ["Step 1...", "Step 2..."],
    "spray_window": "Early morning or late afternoon, avoid rain",
    "variety_note": "MTU-1010 is highly susceptible in Vidarbha",
    "do_not": ["Do not apply excessive Nitrogen", "Do not spray during high winds"]
  },
  "disease_risk_triage": [
    { "disease": "rice_blast", "severity": "high", "score": 0.82 }
  ],
  "followups": [
    "How does the weather look for spraying tomorrow?",
    "Show me alternative fungicides available in Maharashtra."
  ]
}
```

## 7. Traceability and Data Storage (Supabase)

- `disease_risk_cells`: Stores per-cell satellite risk scores at 30m resolution per scan.
- `disease_scout_zones`: Clustered high-risk hotspots, GPS-pinned for the farmer.
- `farmer_photo_submissions`: Uploaded photos and the VLM structured JSON output.
- `rag_chunks`: pgvector HNSW index storing agronomy knowledge (e.g., KVK crop calendars, spray schedules).
- `trace_lots` / `trace_events`: Traceability and supply chain history.
