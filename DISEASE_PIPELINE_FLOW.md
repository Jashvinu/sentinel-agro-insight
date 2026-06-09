# Sentinel Agro Insight — Disease Detection Pipeline

Full end-to-end flow from satellite imagery to field-verified diagnosis, including the nearest KVK enrichment layer.

---

## System Architecture Overview

```
Sentinel-2 Satellite (every 5 days)
         │
         ▼
  Google Earth Engine
  (disease spectral indices)
         │
         ▼
  Supabase Edge Function        Open-Meteo Weather API
  disease-risk-screen  ◄────────────────────────────
         │
         ▼
  disease_risk_cells table  ──►  disease_scout_zones table
         │
         ▼
  Farmer Dashboard (React)
  FieldDiagnostics page
         │
         ├── Map: orange numbered pins on at-risk zones
         ├── Sidebar: ScoutZoneSidebar + NearestKVKCard
         │
  Farmer clicks zone → ScoutZoneCapture modal
         │
         ├── GPS check (must be near zone)
         ├── Camera capture (rear-facing, 1920×1080)
         │
         ▼
  Supabase Storage  (disease-photos bucket)
         │
         ▼
  Supabase Edge Function
  disease-image-diagnose
  (Qwen2.5-VL-7B via DashScope)
         │
         ▼
  DiagnosisResult → shown to farmer
         │
         ▼
  rag-advisor (Qwen3-235B)
  district-specific management advice
```

---

## Stage 1 — Satellite Pre-Screen

**Endpoint:** `POST /disease-risk-screen`

**Input:**
```json
{
  "farm_id": "uuid",
  "crop": "rice",
  "growth_stage": "tillering",
  "season": "kharif",
  "geometry": { "type": "Polygon", "coordinates": [...] }
}
```

### Spectral Indices Computed (Google Earth Engine)

| Index | Formula | What it detects |
|---|---|---|
| **RBVI** | `9.78 × B8 − 2.08 × (B5/B4)` | Rice blast canopy anomaly (MDPI Agronomy 2024, 95.9% accuracy) |
| **CIre** | `(B8/B5) − 1` | Red-edge chlorophyll loss (early disease signal) |
| **MTCI** | `(B8−B5)/(B5−B4)` | MERIS Terrestrial Chlorophyll Index |
| **DWS** | `0.6×NDMI + 0.4×NMDI` | Disease Water Stress composite |
| **NDVI_CV** | `stdDev(NDVI,30m) / mean(NDVI,30m)` | Spatial patchiness proxy for sheath blight |
| **NDVI** | `(B8−B4)/(B8+B4)` | Overall canopy health |

All indices are computed at **10m resolution** over a sampled grid of cells within the farm boundary.

### Per-Disease Risk Models

Each cell gets a risk score (0–1) for each disease. Scoring uses a **weighted linear combination** of spectral features, weather, and IRRI EPIRICE growth-stage susceptibility multipliers.

#### Rice Blast (`rice_blast_risk`)
```
score = 0.45 × spectral_anomaly
      + 0.20 × ndvi_decline
      + 0.15 × moisture_signal
      + 0.15 × weather_risk
      + 0.05 × stage_susceptibility
```
- `spectral_anomaly` = normalized RBVI deviation below healthy threshold
- `weather_risk` = hours in blast temperature window (20–30°C) × leaf wetness hours
- Stage susceptibility peaks at **tillering → heading** (0.9×)

#### Sheath Blight (`sheath_blight_risk`)
- Primary signal: **NDVI_CV** (spatial patchiness) — sheath blight creates characteristic patchy canopy
- Secondary: high moisture + dense stand temperature conditions
- Stage susceptibility peaks at **tillering → milk stage** (0.85×)

#### Bacterial Leaf Blight (`blb_risk`)
- Primary signal: **DWS** water stress composite + storm rainfall (>30mm/7d triggers +0.3)
- BLB spreads via flood water — high recent rain is the strongest predictor
- Stage susceptibility peaks at **tillering** (0.90×)

#### Downy Mildew (`downy_mildew_risk`) — Millet
- Early NDVI decline + cool-moist weather (temp < 25°C, humidity > 80%)
- Affects bajra/jowar at **seedling → tillering** (0.95×)

#### Leaf Spot (`leaf_spot_risk`) — Millet
- Mid-season NDVI patchiness + moderate moisture stress

#### Charcoal Rot (`charcoal_rot_risk`) — Millet/Sorghum
- **Dry stress** signal (high DWS in drought conditions, opposite of BLB)
- Rabi jowar, **dough stage → maturity** (0.90×)

### Scout Zone Clustering

After scoring all grid cells:
1. Any cell with `composite_risk ≥ 0.40` becomes a candidate
2. Greedy radius clustering merges cells within **50m** of each other
3. Up to **5 scout zones** are created per scan
4. Each zone stores: centroid GPS, radius, disease candidates array, max risk score

**Output:** Rows written to `disease_risk_cells` and `disease_scout_zones` tables.

---

## Stage 2 — Farmer Dashboard

**Page:** `/field-diagnostics`

After running Disease Screen (or on load if zones already exist):

- **Map:** Orange/red numbered circle badges appear on the Leaflet map at each zone centroid. Color intensity reflects risk: red ≥65%, orange ≥40%, yellow ≥20%.
- **ScoutZoneSidebar:** Compact card list below the Problem Summary showing zone rank, disease names, risk bar, and status badge.
- **NearestKVKCard:** Shows the closest Krishi Vigyan Kendra from a static table of 33 Maharashtra KVKs (ICAR-ATARI Pune Zone-VIII + Zone-IX), with district, distance, primary crops, and a direct phone/website link.

```
┌─────────────────────────────────────────────┐
│  Field Diagnostics          [Disease Screen] │
├──────────────────────────┬──────────────────┤
│                          │ Problem Summary  │
│   Leaflet Map            │                  │
│                          │ Scout Zones      │
│  ① (red)  ② (orange)    │  ① Rice Blast    │
│                          │    ████░ 78%     │
│                          │  ② Sheath Blight │
│                          │    ██░░░ 44%     │
│                          │                  │
│                          │ Nearest KVK      │
│                          │  KVK Gondia 12km │
│                          │  [Call] [Website]│
└──────────────────────────┴──────────────────┘
```

---

## Stage 3 — Field Photo Capture

When a farmer taps a scout zone pin or "Scout" button, `ScoutZoneCapture` opens as a full-screen modal with 5 steps:

### Step 1: Location Check
- Browser Geolocation API (`watchPosition`, high accuracy)
- Haversine distance computed client-side to zone centroid
- Warning shown if >200m away ("Walk closer for best accuracy")
- Farmer can proceed anyway if GPS is unavailable

### Step 2: Camera
- `getUserMedia({ facingMode: 'environment' })` — rear camera
- Resolution requested: 1920×1080
- Live viewfinder with large white shutter button

### Step 3: Processing
- Photo captured to canvas → JPEG blob at 92% quality
- Uploaded to Supabase Storage bucket `disease-photos` (private, RLS enforced)
- `farmer_photo_submissions` record created with GPS coordinates, crop, growth stage, and satellite context (RBVI, CIre, disease candidates, composite risk)

---

## Stage 4 — AI Image Diagnosis

**Endpoint:** `POST /disease-image-diagnose`

**Model cascade** (DashScope API):
1. `qwen2.5-vl-7b-instruct` — primary (fast, cost-effective)
2. `qwen-vl-plus` — fallback if primary fails
3. `qwen-vl-max` — fallback if plus fails
4. Rule-based heuristic — last resort if all models unavailable

### Prompt Construction
The prompt injects the satellite context alongside the image:

```
You are an expert plant pathologist reviewing a field photo.

SATELLITE CONTEXT (Sentinel-2, last 14 days):
  RBVI score: 0.72 (above blast threshold 0.65)
  CIre: 0.31 (chlorophyll decline detected)
  Composite risk: 0.78
  Disease candidates: Rice Blast, Sheath Blight
  Weather: 18h in blast temperature window, 12h leaf wetness

CROP: Rice, growth stage: Tillering

Examine the photo carefully. Return JSON with:
{
  "confirmed_diagnosis": "rice_blast",
  "confidence": 0.87,
  "severity_pct": 25,
  "visual_evidence": ["diamond-shaped lesions with gray centers", "yellow halos on leaf tips"],
  "differential": [...],
  "scout_action": "Mark affected rows. Spray Tricyclazole 75WP at 0.6g/L within 48h if >10% leaf area affected.",
  "requires_lab_confirmation": false,
  "safe_to_spray": true
}
```

### Result Display
```
📷 [field photo thumbnail]

⚠  Rice Blast                    87% confidence
   ~25% severity

• Diamond-shaped lesions with gray centers
• Yellow halos on leaf tips

Next step: Mark affected rows. Spray Tricyclazole 75WP at
0.6g/L within 48h if >10% leaf area affected.

Also consider…
  Sheath Blight (moderate) — look for water-soaked lesions at base

Model: qwen2.5-vl-7b-instruct
```

---

## Stage 5 — District-Specific Advisory (RAG + Qwen3)

**Endpoint:** `POST /rag-advisor`

After diagnosis, management advice is generated using:

### Qwen3-235B-A22B (Primary)
- Model: `qwen3-235b-a22b` via DashScope OpenAI-compatible API
- Temperature: 0.20, max_tokens: 2400
- `enable_thinking: false` for structured JSON output
- Falls back to `qwen3-72b` → `qwen3-32b` → Gemini 2.5 Flash

### KVK Context Injection
The nearest KVK's district and division enrich the pgvector RAG query:
```typescript
request.region = nearestKVK.district.toLowerCase();  // "gondia"
request.constraints = ["vidarbha"];
```
This causes pgvector HNSW retrieval to surface **Gondia-specific** crop calendar chunks rather than generic Maharashtra advice.

### RAG Chunks Retrieved (pgvector)
District-specific chunks cover:
- Kharif crop calendar: planting window, recommended varieties
- Disease pressure calendar: blast peaks Aug 10–Sep 15 in Vidarbha during tillering/heading
- Emergency contacts: KVK phone for field verification

### Response includes `disease_management` block:
```json
{
  "disease_management": {
    "disease": "Rice Blast",
    "immediate_actions": ["Spray Tricyclazole 75WP at 0.6g/L"],
    "preventive_measures": ["Avoid excess nitrogen", "Maintain field drainage"],
    "kvk_recommendation": "Contact KVK Gondia: 07182-226237 for Gondia district spray calendar",
    "safe_to_spray": true
  }
}
```

---

## KVK Nearest Institute Feature

33 Maharashtra KVKs from ICAR-ATARI Pune Zone-VIII + Zone-IX are stored in a static lookup table (`src/services/kvkService.ts`) with:
- GPS coordinates (lat/lng)
- District and division (Vidarbha / Marathwada / Konkan / Khandesh / Western Maharashtra)
- Primary crops
- Phone number and website URL

Distance is computed client-side using the **Haversine formula** — no API call required.

| Division | KVKs | Key Crops |
|---|---|---|
| Vidarbha | Gondia, Bhandara, Nagpur, Chandrapur, Amravati, Yavatmal, Wardha, Washim, Akola, Buldhana | Rice, Cotton, Soybean |
| Marathwada | Aurangabad, Nanded, Latur, Osmanabad, Parbhani, Jalna, Beed, Hingoli | Jowar, Cotton, Soybean |
| Konkan | Raigad, Ratnagiri, Sindhudurg, Thane, Kolhapur | Rice, Cashew, Mango |
| Khandesh | Jalgaon, Dhule, Nandurbar | Banana, Cotton, Maize |
| Western Maharashtra | Pune, Nashik, Ahmednagar, Solapur, Satara, Sangli | Wheat, Sugarcane, Grapes |

---

## Database Tables

```sql
-- One row per 10m grid cell per scan
disease_risk_cells (
  farm_id, scan_date, crop, growth_stage,
  cell_lat, cell_lng,
  rice_blast_risk, sheath_blight_risk, blb_risk,
  downy_mildew_risk, leaf_spot_risk, charcoal_rot_risk,
  composite_risk,
  rbvi, cire, mtci, dws, ndvi_cv, ndvi, moisture
)

-- Clustered high-risk zones for field scouting
disease_scout_zones (
  farm_id, scan_date, zone_rank,
  centroid_lat, centroid_lng, radius_meters,
  disease_candidates TEXT[],
  max_risk_score, cell_count,
  crop, growth_stage,
  status  -- pending | scouted | confirmed | cleared
)

-- Farmer photo submissions + VLM results
farmer_photo_submissions (
  farm_id, scout_zone_id,
  storage_path,
  taken_lat, taken_lng,
  crop, growth_stage,
  satellite_context JSONB,
  diagnosis_result JSONB,
  diagnosis_model, diagnosis_at
)
```

---

## New Files Added in This PR

| File | Purpose |
|---|---|
| `supabase/migrations/20260609000000_disease_detection_tables.sql` | DB schema for 3 disease tables |
| `supabase/functions/_shared/disease-models.ts` | 6 per-disease risk scoring models |
| `supabase/functions/_shared/kvk-locator.ts` | 33 Maharashtra KVK static table + Haversine finder |
| `supabase/functions/disease-risk-screen/index.ts` | Satellite pre-screen endpoint |
| `supabase/functions/disease-image-diagnose/index.ts` | Qwen-VL image diagnosis endpoint |
| `supabase/functions/rag-advisor/index.ts` | Updated: Qwen3 primary, KVK context, VLM injection |
| `src/services/diseaseService.ts` | Frontend service for all disease endpoints |
| `src/services/kvkService.ts` | Frontend KVK lookup (Haversine, no API call) |
| `src/components/features/diagnostics/ScoutZoneMap.tsx` | Leaflet overlay: numbered zone pins + popups |
| `src/components/features/diagnostics/ScoutZoneCapture.tsx` | 5-step GPS → camera → diagnosis modal |
| `src/components/features/diagnostics/ScoutZoneSidebar.tsx` | Sidebar card list of scout zones |
| `src/components/features/diagnostics/NearestKVKCard.tsx` | Nearest KVK card with call/website links |
| `src/components/features/diagnostics/DiagnosticMap.tsx` | Updated: accepts zones + onZoneSelect props |
| `src/pages/FieldDiagnostics.tsx` | Updated: Disease Screen button, zone state, capture modal |

---

## Environment Variables Required

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=...

# Qwen / DashScope (Edge Functions)
QWEN_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1

# Google Earth Engine (Edge Functions)
GOOGLE_PROJECT_ID=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...

# Optional fallback
VITE_GEMINI_API_KEY=...
```

---

## Deployment

```bash
# Deploy Edge Functions
./scripts/deploy-supabase.sh

# Run migrations
supabase db push

# Deploy frontend
npm run firebase:deploy
```

The deploy script includes: `disease-risk-screen`, `disease-image-diagnose`, `rag-advisor`, `rag-retrieve`.
