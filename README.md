# wrkFarm — Sentinel Agro Insight

> Precision agriculture for smallholder rice and millet farmers in Maharashtra.
> Satellite imagery → AI disease detection → field photo diagnosis → district-specific advisory.

---

## What We Are Building

Most Indian smallholder farmers lose 20–40% of their rice/millet crop every kharif season to diseases they detect too late — blast, sheath blight, BLB, downy mildew. Extension workers (KVK agents) visit once a month at best. The farmer's only option is to ask a pesticide shop owner, who sells whatever maximises his margin.

**wrkFarm flips this.** We use Sentinel-2 satellite imagery (free, 10m resolution, every 5 days) to pre-screen every field for disease hotspots *before* symptoms are visible to the naked eye. When the satellite flags a zone, we GPS-pin it and ask the farmer to walk there and take one photo. Qwen vision model reads the photo, cross-references the satellite signals, and gives a confident diagnosis — specific disease, severity percentage, and a spray recommendation grounded in ICAR/KVK district data.

No agronomist needed. No app subscription. Works on any Android with a camera.

---

## The Goal

Build a three-stage pipeline that runs continuously for every registered farm:

1. **Satellite pre-screen** — every time a new Sentinel-2 image arrives (~5 days), score each 30m cell in the farm for disease risk using spectral disease indices. Cluster high-risk cells into GPS-pinned scout zones. No farmer action needed.

2. **Field photo diagnosis** — farmer opens the app, sees numbered red/orange pins on their farm map, walks to the highest-risk one, takes a photo. Qwen2.5-VL diagnoses the image with satellite context injected into the prompt.

3. **District-specific advisory** — Qwen3-235B generates a management plan using RAG retrieval grounded in the nearest KVK's district crop calendar, spray schedule, and variety recommendations.

The entire flow should work offline-first on a ₹8,000 Android, sync when connectivity returns, and output advice in Marathi (planned).

---

## What We Have Built So Far

### Frontend (React + TypeScript + Vite)

| Component | What it does |
|---|---|
| `FieldDiagnostics` page | Main dashboard: satellite index map, Disease Screen button, scout zone pins, sidebar cards |
| `DiagnosticMap` | Leaflet map with 10m grid cells coloured by problem type; now also renders scout zone overlays |
| `ScoutZoneMap` | Numbered orange/red Leaflet markers + radius circles for each scout zone; popup with disease chips, risk bar, Take Photo button |
| `ScoutZoneCapture` | 5-step modal: GPS validation → rear camera → upload → Qwen-VL diagnosis → result with visual evidence + scout action |
| `ScoutZoneSidebar` | Compact sidebar list of zones with risk bars and Scout buttons |
| `NearestKVKCard` | Shows closest KVK name, district, distance (km), primary crops, direct phone + website link |
| `Traceability` pages | Lot creation, event logging, QR passport, risk scoring, hash-chain integrity |

### Backend (Supabase Edge Functions — Deno)

| Function | What it does |
|---|---|
| `disease-risk-screen` | POST: loads farm geometry, calls Earth Engine for RBVI/CIre/MTCI/DWS/NDVI_CV indices at 30m, scores 500 sample points per farm against 6 disease models, clusters into scout zones, writes to DB |
| `disease-image-diagnose` | POST: receives submission ID, downloads photo from Supabase Storage, calls Qwen2.5-VL-7B with satellite context in prompt, returns structured diagnosis JSON |
| `rag-advisor` | POST: Qwen3-235B primary / Gemini fallback; pgvector RAG retrieval enriched with nearest KVK district; returns cited management advice + disease_management block |
| `rag-retrieve` | Debug: returns ranked chunks + citations |
| `agricultural-indices` | GET: NDVI, EVI, SAVI, MSAVI, NDWI via Earth Engine |
| `farm-timeline` | Farm health history |
| `field-overview` | Snapshot of farm state |
| `sync-satellite-dates` | Hourly sync of available Sentinel-2 dates |
| `trace-lots/events/reports/risk-score/hash-batch` | Traceability supply chain functions |
| `qr-public-passport` | Public QR endpoint for produce verification |

### AI Models

| Model | Role | API |
|---|---|---|
| Qwen3-235B-A22B | Primary text advisor, RAG synthesis, management plans | DashScope (`dashscope-intl.aliyuncs.com`) |
| Qwen2.5-VL-7B-Instruct | Image diagnosis (field photos + satellite context) | DashScope |
| qwen-vl-plus / qwen-vl-max | Fallback vision models | DashScope |
| Gemini 2.5 Flash | Fallback text advisor | Google AI Studio |

### Satellite Data Sources

| Dataset | Resolution | Cadence | Used for |
|---|---|---|---|
| `COPERNICUS/S2_SR_HARMONIZED` | 10m | ~5 days | All disease indices, NDVI, chlorophyll, moisture |
| `LANDSAT/LC09/C02/T1_L2` | 30m | 16 days | Fallback when S2 cloud-covered |
| `SENTINEL-1 GRD` | 10m | 6 days | SAR backscatter for soil moisture + flood |
| Open-Meteo API | Point | Hourly | Leaf wetness hours, blast temperature window, rainfall |

### Disease Models (per-cell scoring)

All models output a 0–1 risk score per 30m cell. IRRI EPIRICE growth-stage susceptibility multipliers applied at each stage.

| Disease | Primary spectral signal | Key weather trigger |
|---|---|---|
| Rice Blast | RBVI > 0.65, CIre decline | Temp 20–28°C × leaf wetness hours |
| Sheath Blight | NDVI_CV (patchiness) | High humidity post-tillering |
| Bacterial Leaf Blight | DWS water stress | Storm rainfall > 30mm/7d |
| Downy Mildew (millet) | NDVI decline, CIre drop | Cool-moist: temp < 25°C, RH > 80% |
| Leaf Spot (millet) | NDVI patchiness, mid-season | Moderate moisture |
| Charcoal Rot (sorghum) | DWS drought stress | Dry conditions, late season |

### KVK Nearest Institute (33 Maharashtra KVKs)

Static lookup table of all ICAR-ATARI Pune Zone-VIII + Zone-IX KVKs. Haversine distance computed client-side — no API call. KVK district injected into the pgvector RAG query so retrieved chunks are Gondia-specific (or Aurangabad-specific, etc.) instead of generic Maharashtra.

| Division | KVKs |
|---|---|
| Vidarbha | Gondia, Bhandara, Nagpur, Chandrapur, Amravati, Yavatmal, Wardha, Washim, Akola, Buldhana |
| Marathwada | Aurangabad, Nanded, Latur, Osmanabad, Parbhani, Jalna, Beed, Hingoli |
| Konkan | Raigad, Ratnagiri, Sindhudurg, Thane, Kolhapur |
| Khandesh | Jalgaon, Dhule, Nandurbar |
| Western Maharashtra | Pune, Nashik, Ahmednagar, Solapur, Satara, Sangli |

### Database (Supabase Postgres)

```
farms                      — farm boundaries, user ownership
disease_risk_cells         — per-cell satellite risk scores (30m, per scan date)
disease_scout_zones        — clustered hotspots (GPS-pinned, ranked, status tracked)
farmer_photo_submissions   — uploaded photos + VLM diagnosis JSON
rag_chunks                 — pgvector HNSW index for agronomy knowledge base
trace_lots / trace_events  — traceability supply chain records
```

---

## The Biggest Unsolved Problems

### 1. Earth Engine Initialization in Deno Edge Functions (CRITICAL)

**The problem:** Google Earth Engine's JavaScript client library was designed for Node.js and browsers. Deno has a different module system and stricter sandbox. When `disease-risk-screen` boots, it calls `initializeEarthEngine()` which internally uses `ee.data.authenticateViaPrivateKey()` — this spawns OAuth flows that depend on Node `http` and `fs` primitives that don't exist in Deno.

**Current state:** The existing `agricultural-indices` and `field-overview` functions work in production because they were deployed months ago with a patched version of the EE init flow. The new `disease-risk-screen` function gets a `BOOT_ERROR` 503 because it imports `calculateDiseaseIndices` from `optical-algorithms.ts` which calls `ee.Kernel` and `ee.Reducer` before EE is initialized.

**What we've tried:** Lazy initialization (call `initializeEarthEngine()` inside the request handler, not at module load time). This works for the existing functions but the EE object methods called inside `calculateDiseaseIndices` still expect the private key auth to have completed.

**What needs to happen:**
- Option A: Move all EE compute into a separate Cloud Run function (Node.js) and call it from the Deno Edge Function via HTTP. The Deno function becomes a thin orchestrator.
- Option B: Use the Earth Engine REST API (`earthengine.googleapis.com/v1alpha/projects/{project}/maps`) directly with `fetch()` and a service account JWT — no EE JS SDK needed. This is the cleanest Deno-native solution.
- Option C: Use Google Cloud Functions (Node.js) for EE compute, triggered by Supabase webhook, write results to DB, Edge Function just reads from DB.

**Recommended path:** Option B — Earth Engine REST API with hand-rolled JWT auth. The existing `satellite-utils.ts` already has JWT construction code for GEE tile URLs. Extend that to call the `computePixels` or `getRegion` REST endpoint directly.

---

### 2. Sentinel-2 Cloud Cover in Kharif Season (HIGH)

**The problem:** Maharashtra's kharif season (July–September) coincides with the southwest monsoon. Cloud cover regularly exceeds 80% for 10–15 consecutive days. Sentinel-2 revisit is 5 days but usable (< 30% cloud) images may arrive only once every 3–4 weeks during peak monsoon. Disease risk is highest precisely when imagery is worst.

**Current workaround:** We fall back to a 14-day composite median and lower the cloud filter to 30%. Still frequently returns zero images.

**What needs to happen:**
- Fuse Sentinel-1 SAR backscatter (cloud-penetrating, 6-day revisit) with Sentinel-2 optical. SAR can't detect chlorophyll directly but it tracks canopy water content and surface roughness — both are disease proxies.
- The `_shared/sensor-fusion.ts` file has a SAR-optical fusion skeleton but it's not wired into `disease-risk-screen` yet.
- Secondary: use Landsat 8/9 (30m, 16-day) as a fallback when S2 is clouded — already partially implemented in `optical-algorithms.ts`.

---

### 3. No Crop Type or Planting Date in Farm Metadata (HIGH)

**The problem:** Every disease model uses growth-stage susceptibility multipliers. Growth stage is derived from days-since-planting. But the `farms` table has no `crop_type` or `planting_date` column. We currently hardcode `crop: 'rice'` and `growthStage: 'tillering'` everywhere.

**What needs to happen:**
```sql
ALTER TABLE farms ADD COLUMN crop_type TEXT DEFAULT 'rice';
ALTER TABLE farms ADD COLUMN planting_date DATE;
ALTER TABLE farms ADD COLUMN season TEXT DEFAULT 'kharif';
```
Then derive growth stage automatically: `daysSincePlanting` → `parseGrowthStage()`. Also expose a simple "What crop did you plant and when?" onboarding screen — 2 taps.

---

### 4. Qwen-VL Image Diagnosis Needs Real Photos to Validate (MEDIUM)

**The problem:** The `disease-image-diagnose` function is built and deployed but has never been tested with real diseased crop photos. The structured JSON output schema (`confirmed_diagnosis`, `confidence`, `severity_pct`, `visual_evidence`, `scout_action`) is only as good as the prompt engineering. We don't know yet whether Qwen2.5-VL-7B gives consistent, accurate output for Maharashtra rice blast vs. sheath blight at different severity levels.

**What needs to happen:**
- Source 20–30 labelled field photos of rice blast, sheath blight, and BLB (IRRI image bank, ICAR Chhattisgarh, or field collection in Maharashtra).
- Run them through `disease-image-diagnose` with and without satellite context.
- Tune the prompt: add few-shot examples in base64 for the hardest confusable pairs (blast vs. brown spot, BLB vs. false smut).
- Track accuracy: model vs. ground truth label. Target > 80% top-1 accuracy before recommending spray.

---

### 5. pgvector RAG Knowledge Base is Sparse (MEDIUM)

**The problem:** The `rag_chunks` table exists with a pgvector HNSW index but has very few chunks for Maharashtra-specific crop management. The KVK district enrichment (injecting "gondia" into the RAG query) only helps if there are Gondia-specific chunks to retrieve. Currently the advisor falls back to generic agronomy text.

**What needs to happen:**
- Seed 200–300 district-specific chunks covering: kharif crop calendars by district, disease pressure windows (blast Aug–Sep Vidarbha, BLB Jul–Aug Marathwada), variety recommendations (MTU-1010, Swarna, Pooja for Gondia rice), KVK spray schedules, ICAR CRRI management guidelines.
- Embed using OpenAI `text-embedding-3-small` or Supabase's built-in embedding function.
- Tag each chunk with `regions[]`, `crops[]`, `disease_tags[]` for filtered retrieval.

---

### 6. Migrations Not Auto-Applied to Production (MEDIUM)

**The problem:** `supabase db push` requires a direct Postgres password and doesn't accept `--project-ref`. The disease detection tables (`disease_risk_cells`, `disease_scout_zones`, `farmer_photo_submissions`) and the `disease-photos` storage bucket have to be created manually via the Supabase SQL editor. This breaks CI/CD.

**What needs to happen:**
- Store `SUPABASE_DB_PASSWORD` in GitHub Actions secrets.
- Use `supabase db push --db-url postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.udbnskydigoqpxmmduvr.supabase.co:5432/postgres` in the deploy workflow.
- Or: migrate to Supabase's GitHub Actions integration which handles this automatically.

---

## Tech Stack

```
Frontend:   React 18 · TypeScript · Vite · Tailwind CSS · Leaflet / react-leaflet
UI:         Radix UI · Lucide icons · Recharts
Backend:    Deno · Supabase Edge Functions
Satellite:  Google Earth Engine (JS SDK / REST API)
AI:         Qwen3-235B (DashScope) · Qwen2.5-VL-7B (DashScope) · Gemini 2.5 Flash (fallback)
DB:         Supabase Postgres · pgvector HNSW for RAG
Storage:    Supabase Storage (disease-photos bucket)
Hosting:    Firebase Hosting (frontend) · Supabase (backend)
Weather:    Open-Meteo API (free, no key)
```

## Environment Variables

```env
# Frontend (.env)
VITE_SUPABASE_URL=https://udbnskydigoqpxmmduvr.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
VITE_GEMINI_API_KEY=...

# Edge Functions (Supabase secrets)
QWEN_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
GOOGLE_PROJECT_ID=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Commands

```bash
npm run dev                  # Frontend dev server (port 8080)
npm run type-check           # TypeScript check
npm run build                # Production build
./scripts/deploy-supabase.sh # Deploy all Edge Functions
npm run firebase:deploy      # Deploy frontend to Firebase
```
