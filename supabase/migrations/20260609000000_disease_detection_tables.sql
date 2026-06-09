-- Disease detection pipeline tables
-- Stage 1: per-cell satellite risk scores
-- Stage 2: scout zones (clustered hotspots)
-- Stage 3: farmer photo submissions + VLM diagnosis

CREATE TABLE IF NOT EXISTS disease_risk_cells (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID REFERENCES farms(id) ON DELETE CASCADE,
  scan_date     DATE NOT NULL,
  crop          TEXT NOT NULL,          -- 'rice' | 'millet'
  growth_stage  TEXT,
  cell_lat      NUMERIC NOT NULL,
  cell_lng      NUMERIC NOT NULL,
  -- per-disease risk scores [0..1]
  rice_blast_risk      NUMERIC,
  sheath_blight_risk   NUMERIC,
  blb_risk             NUMERIC,         -- bacterial leaf blight
  downy_mildew_risk    NUMERIC,
  leaf_spot_risk       NUMERIC,
  charcoal_rot_risk    NUMERIC,
  composite_risk       NUMERIC,         -- max across applicable diseases
  -- contributing signals
  rbvi            NUMERIC,
  cire            NUMERIC,
  mtci            NUMERIC,
  dws             NUMERIC,
  ndvi_cv         NUMERIC,
  ndvi            NUMERIC,
  moisture        NUMERIC,
  weather_risk    NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disease_risk_cells_farm_date
  ON disease_risk_cells (farm_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS disease_risk_cells_risk
  ON disease_risk_cells (farm_id, composite_risk DESC);

-- Scout zones: spatial clusters of high-risk cells
CREATE TABLE IF NOT EXISTS disease_scout_zones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID REFERENCES farms(id) ON DELETE CASCADE,
  scan_date        DATE NOT NULL,
  zone_rank        INTEGER NOT NULL DEFAULT 1,  -- 1 = highest priority
  centroid_lat     NUMERIC NOT NULL,
  centroid_lng     NUMERIC NOT NULL,
  radius_meters    INTEGER NOT NULL DEFAULT 50,
  disease_candidates TEXT[] NOT NULL DEFAULT '{}',
  max_risk_score   NUMERIC NOT NULL,
  cell_count       INTEGER NOT NULL DEFAULT 1,
  crop             TEXT NOT NULL,
  growth_stage     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
    -- pending | scouted | confirmed | cleared
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disease_scout_zones_farm_date
  ON disease_scout_zones (farm_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS disease_scout_zones_status
  ON disease_scout_zones (farm_id, status);

-- Farmer photo submissions + VLM diagnosis results
CREATE TABLE IF NOT EXISTS farmer_photo_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID REFERENCES farms(id) ON DELETE CASCADE,
  scout_zone_id    UUID REFERENCES disease_scout_zones(id) ON DELETE SET NULL,
  storage_path     TEXT NOT NULL,
  taken_lat        NUMERIC,
  taken_lng        NUMERIC,
  crop             TEXT NOT NULL,
  growth_stage     TEXT,
  -- satellite context snapshot at time of submission
  satellite_context JSONB,
  -- VLM diagnosis result (filled async after upload)
  diagnosis_result  JSONB,
  diagnosis_model   TEXT,
  diagnosis_at      TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farmer_photos_farm
  ON farmer_photo_submissions (farm_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS farmer_photos_zone
  ON farmer_photo_submissions (scout_zone_id);

-- RLS: users see only their own farms' data
ALTER TABLE disease_risk_cells    ENABLE ROW LEVEL SECURITY;
ALTER TABLE disease_scout_zones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_photo_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only_risk_cells"
  ON disease_risk_cells FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

CREATE POLICY "owner_only_scout_zones"
  ON disease_scout_zones FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));

CREATE POLICY "owner_only_photo_submissions"
  ON farmer_photo_submissions FOR ALL
  USING (farm_id IN (SELECT id FROM farms WHERE user_id = auth.uid()));
