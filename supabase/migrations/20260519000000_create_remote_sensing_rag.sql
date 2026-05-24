-- GrainAI remote-sensing RAG substrate.
-- Uses pgvector for semantic retrieval, PostgreSQL full-text search for lexical
-- recall, and seeded Maharashtra rice/millet agronomy chunks for v1.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS rag_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  url TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  region TEXT NOT NULL DEFAULT 'maharashtra',
  evidence_types TEXT[] NOT NULL DEFAULT ARRAY['extension'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  crops JSONB NOT NULL DEFAULT '["all"]'::JSONB,
  seasons JSONB NOT NULL DEFAULT '["kharif","rabi"]'::JSONB,
  regions JSONB NOT NULL DEFAULT '["maharashtra"]'::JSONB,
  evidence_types JSONB NOT NULL DEFAULT '["extension"]'::JSONB,
  signal_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  disease_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  management_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  embedding VECTOR(384),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(content, '') || ' ' ||
      coalesce(crops::TEXT, '') || ' ' ||
      coalesce(signal_tags::TEXT, '') || ' ' ||
      coalesce(disease_tags::TEXT, '') || ' ' ||
      coalesce(management_tags::TEXT, '')
    )
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT REFERENCES rag_sources(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  chunks_added INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rag_advisory_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  crop TEXT NOT NULL CHECK (crop IN ('rice', 'millet')),
  season TEXT NOT NULL CHECK (season IN ('kharif', 'rabi')),
  question TEXT NOT NULL,
  remote_sensing_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  disease_risk_triage JSONB NOT NULL DEFAULT '[]'::JSONB,
  citations JSONB NOT NULL DEFAULT '[]'::JSONB,
  provider TEXT NOT NULL DEFAULT 'gemini',
  used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID
);

CREATE TABLE IF NOT EXISTS rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_run_id UUID REFERENCES rag_advisory_runs(id) ON DELETE SET NULL,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  issue_category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_rag_sources_region ON rag_sources(region);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_crops ON rag_chunks USING GIN(crops);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_seasons ON rag_chunks USING GIN(seasons);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_regions ON rag_chunks USING GIN(regions);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_signals ON rag_chunks USING GIN(signal_tags);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_diseases ON rag_chunks USING GIN(disease_tags);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_search ON rag_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_rag_advisory_runs_farm_created ON rag_advisory_runs(farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_farm_created ON rag_feedback(farm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION rag_hash_embedding(input_text TEXT)
RETURNS VECTOR(384)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  dims REAL[] := array_fill(0::REAL, ARRAY[384]);
  token TEXT;
  hash_value BIGINT;
  sign_hash BIGINT;
  idx INTEGER;
  norm DOUBLE PRECISION := 0;
  i INTEGER;
  vector_text TEXT;
BEGIN
  IF input_text IS NULL OR length(trim(input_text)) = 0 THEN
    RETURN ('[' || array_to_string(dims, ',') || ']')::VECTOR(384);
  END IF;

  FOR token IN
    SELECT lower(match[1])
    FROM regexp_matches(input_text, '([A-Za-z0-9_]+)', 'g') AS match
  LOOP
    hash_value := hashtextextended(token, 0);
    sign_hash := hashtextextended(token, 1);
    idx := (abs(hash_value % 384) + 1)::INTEGER;
    dims[idx] := dims[idx] + CASE WHEN abs(sign_hash % 2) = 0 THEN 1 ELSE -1 END;
  END LOOP;

  FOR i IN 1..384 LOOP
    norm := norm + (dims[i] * dims[i]);
  END LOOP;
  norm := sqrt(norm);

  IF norm > 0 THEN
    FOR i IN 1..384 LOOP
      dims[i] := dims[i] / norm;
    END LOOP;
  END IF;

  vector_text := '[' || array_to_string(dims, ',') || ']';
  RETURN vector_text::VECTOR(384);
END;
$$;

CREATE OR REPLACE FUNCTION set_rag_chunk_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.embedding := rag_hash_embedding(NEW.title || ' ' || NEW.content);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rag_chunks_embedding_trigger ON rag_chunks;
CREATE TRIGGER rag_chunks_embedding_trigger
BEFORE INSERT OR UPDATE OF title, content
ON rag_chunks
FOR EACH ROW
EXECUTE FUNCTION set_rag_chunk_embedding();

CREATE OR REPLACE FUNCTION touch_rag_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rag_sources_updated_at_trigger ON rag_sources;
CREATE TRIGGER rag_sources_updated_at_trigger
BEFORE UPDATE ON rag_sources
FOR EACH ROW
EXECUTE FUNCTION touch_rag_sources_updated_at();

CREATE OR REPLACE FUNCTION match_rag_chunks(
  p_query_embedding VECTOR(384),
  p_query_text TEXT DEFAULT '',
  p_match_count INTEGER DEFAULT 8,
  p_filter JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  id TEXT,
  source_id TEXT,
  source_title TEXT,
  publisher TEXT,
  url TEXT,
  title TEXT,
  content TEXT,
  crops JSONB,
  seasons JSONB,
  regions JSONB,
  evidence_types JSONB,
  signal_tags JSONB,
  disease_tags JSONB,
  management_tags JSONB,
  semantic_score DOUBLE PRECISION,
  keyword_score DOUBLE PRECISION,
  score DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  query_terms TSQUERY;
BEGIN
  IF p_query_text IS NOT NULL AND length(trim(p_query_text)) > 0 THEN
    query_terms := websearch_to_tsquery('english', p_query_text);
  ELSE
    query_terms := NULL;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.source_id,
    s.title AS source_title,
    s.publisher,
    s.url,
    c.title,
    c.content,
    c.crops,
    c.seasons,
    c.regions,
    c.evidence_types,
    c.signal_tags,
    c.disease_tags,
    c.management_tags,
    CASE
      WHEN p_query_embedding IS NULL OR c.embedding IS NULL THEN 0
      ELSE 1 - (c.embedding <=> p_query_embedding)
    END AS semantic_score,
    CASE
      WHEN query_terms IS NULL THEN 0
      ELSE ts_rank(c.search_vector, query_terms)::DOUBLE PRECISION
    END AS keyword_score,
    (
      0.58 * CASE
        WHEN p_query_embedding IS NULL OR c.embedding IS NULL THEN 0
        ELSE 1 - (c.embedding <=> p_query_embedding)
      END
      + 0.34 * CASE
        WHEN query_terms IS NULL THEN 0
        ELSE ts_rank(c.search_vector, query_terms)::DOUBLE PRECISION
      END
      + CASE WHEN p_filter ? 'crop' AND (c.crops ? (p_filter->>'crop') OR c.crops ? 'all') THEN 0.06 ELSE 0 END
      + CASE WHEN p_filter ? 'season' AND c.seasons ? (p_filter->>'season') THEN 0.04 ELSE 0 END
      + CASE WHEN p_filter ? 'region' AND c.regions ? lower(p_filter->>'region') THEN 0.04 ELSE 0 END
    )::DOUBLE PRECISION AS score
  FROM rag_chunks c
  JOIN rag_sources s ON s.id = c.source_id
  WHERE
    (NOT p_filter ? 'crop' OR c.crops ? (p_filter->>'crop') OR c.crops ? 'all')
    AND (NOT p_filter ? 'season' OR c.seasons ? (p_filter->>'season'))
    AND (NOT p_filter ? 'region' OR c.regions ? lower(p_filter->>'region') OR c.regions ? 'india')
  ORDER BY score DESC, keyword_score DESC, semantic_score DESC
  LIMIT greatest(1, least(coalesce(p_match_count, 8), 24));
END;
$$;

ALTER TABLE rag_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_ingest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_advisory_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read RAG sources" ON rag_sources;
CREATE POLICY "Public can read RAG sources"
  ON rag_sources FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public can read RAG chunks" ON rag_chunks;
CREATE POLICY "Public can read RAG chunks"
  ON rag_chunks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert RAG feedback" ON rag_feedback;
CREATE POLICY "Authenticated can insert RAG feedback"
  ON rag_feedback FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view own RAG feedback" ON rag_feedback;
CREATE POLICY "Users can view own RAG feedback"
  ON rag_feedback FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view own advisory runs" ON rag_advisory_runs;
CREATE POLICY "Users can view own advisory runs"
  ON rag_advisory_runs FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

GRANT SELECT ON rag_sources, rag_chunks TO anon, authenticated;
GRANT INSERT, SELECT ON rag_feedback TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_rag_chunks(VECTOR(384), TEXT, INTEGER, JSONB) TO anon, authenticated, service_role;
GRANT ALL ON rag_sources, rag_chunks, rag_ingest_runs, rag_advisory_runs, rag_feedback TO service_role;

INSERT INTO rag_sources (id, title, publisher, url, country, region, evidence_types)
VALUES
  ('icar-maharashtra-soils', 'Maharashtra agricultural profile', 'ICAR', 'https://www.icar.gov.in/index.php/en/node/17272', 'India', 'maharashtra', ARRAY['research','extension']),
  ('imd-agromet-weather', 'Agromet advisory services', 'India Meteorological Department', 'https://mausam.imd.gov.in/responsive/agromet_adv_ser_block_current_en.php', 'India', 'india', ARRAY['extension','weather']),
  ('icar-iirr-aerobic-rice', 'Aerobic system of rice cultivation', 'ICAR-Indian Institute of Rice Research', 'https://www.icar-iirr.org/index.php/en/component/content/article/33-iirr-technologies/116-technology-13', 'India', 'india', ARRAY['research','extension']),
  ('icar-nrri-dsr', 'Direct Seeded Rice climate resilience', 'ICAR-National Rice Research Institute', 'https://icar-nrri.in/wp-content/uploads/2024/08/NRRI_Research-Bulletin-No-50.pdf', 'India', 'india', ARRAY['research','extension']),
  ('kvk-gondia-paddy', 'Paddy package of practices', 'KVK Hiwara, Gondia / PDKV Akola', 'https://kvkhiwra.pdkv.ac.in/?page_id=858', 'India', 'maharashtra', ARRAY['extension']),
  ('icar-iimr-millets', 'ICAR-IIMR millet focus', 'ICAR-Indian Institute of Millets Research', 'https://www.millets.res.in/', 'India', 'india', ARRAY['research','extension']),
  ('mpkv-rabi-sorghum', 'Sorghum research recommendations', 'Mahatma Phule Krishi Vidyapeeth, Rahuri', 'https://mpkv.ac.in/Uploads/Research/3.%20Sorghum_20200110053526.pdf', 'India', 'maharashtra', ARRAY['research','extension']),
  ('kvk-yavatmal-jowar', 'Jowar cultivation technology', 'KVK Yavatmal / PDKV Akola', 'https://kvkyavatmal.pdkv.ac.in/?page_id=1110', 'India', 'maharashtra', ARRAY['extension'])
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  url = EXCLUDED.url,
  evidence_types = EXCLUDED.evidence_types;

INSERT INTO rag_chunks (
  id, source_id, title, content, crops, seasons, regions, evidence_types,
  signal_tags, disease_tags, management_tags, metadata
)
VALUES
  (
    'maharashtra-nutrient-constraints',
    'icar-maharashtra-soils',
    'Satellite nutrient stress needs soil-test confirmation',
    'Maharashtra has many rainfall-dependent farms and shallow soils with frequent nitrogen, phosphorus, zinc, and sulphur constraints. Treat satellite NPK as a zone-finding sufficiency signal, not as a lab nutrient value. Scout low-score zones, check moisture first, and confirm fertilizer changes with soil testing and local KVK guidance.',
    '["all"]', '["kharif","rabi"]', '["maharashtra","india"]', '["research","extension"]',
    '["nitrogen","phosphorus","potassium","soil","remote_sensing"]',
    '[]',
    '["soil_testing","nutrient_management","scouting"]',
    '{"source_priority": 1.0}'
  ),
  (
    'weather-aware-field-operations',
    'imd-agromet-weather',
    'Weather timing for fertilizer, spray, and scouting',
    'IMD agromet advisories emphasize timing field operations around district weather forecasts, rain, thunderstorm, wind, and heat warnings. Avoid spraying or top dressing before heavy rain or high wind. Use short-range rainfall forecasts to time irrigation, drainage checks, and scouting.',
    '["all"]', '["kharif","rabi"]', '["maharashtra","india"]', '["weather","extension"]',
    '["weather","rain","wind","heat","climate"]',
    '["fungal_risk","bacterial_risk"]',
    '["weather_timing","worker_safety","spray_timing"]',
    '{"source_priority": 0.95}'
  ),
  (
    'rice-aerobic-water-limits',
    'icar-iirr-aerobic-rice',
    'Aerobic rice under water-limited conditions',
    'Aerobic rice is a non-puddled, non-flooded rice system for water-limited fields. It can reduce irrigation needs where suitable varieties, field preparation, timely sowing, early weed control, and careful nutrient and moisture management are available. It is vulnerable to weed competition and moisture stress during establishment.',
    '["rice"]', '["kharif","rabi"]', '["india","maharashtra"]', '["research","extension"]',
    '["water","moisture","drought","ndvi","weed"]',
    '["seedling_blight_risk","blast_risk"]',
    '["direct_seeded_rice","water_management","weed_management"]',
    '{"source_priority": 1.0}'
  ),
  (
    'rice-dsr-establishment',
    'icar-nrri-dsr',
    'Direct seeded rice establishment and water productivity',
    'Direct seeded rice can improve climate resilience and water productivity but depends on establishment moisture, early weed control, and local variety guidance. If rainfall is weak or moisture stress appears in satellite diagnostics, protect the first 20 days after sowing and avoid top dressing immediately before runoff risk.',
    '["rice"]', '["kharif"]', '["india","maharashtra"]', '["research","extension"]',
    '["moisture","rain","nitrogen","ndvi","water"]',
    '["blast_risk","sheath_blight_risk"]',
    '["direct_seeded_rice","establishment","nutrient_management"]',
    '{"source_priority": 0.95}'
  ),
  (
    'vidarbha-paddy-local-package',
    'kvk-gondia-paddy',
    'Paddy local package anchor for eastern Maharashtra',
    'For paddy in eastern Maharashtra and Vidarbha, align seed, nursery, transplanting, nutrient, weed, and plant-protection decisions with the nearest KVK package and district agromet bulletin. Use remote-sensing stress zones to prioritize scouting rather than changing fertilizer uniformly across the entire field.',
    '["rice"]', '["kharif"]', '["maharashtra"]', '["extension"]',
    '["ndvi","nitrogen","phosphorus","moisture","weather"]',
    '["blast_risk","bacterial_leaf_blight_risk","sheath_blight_risk"]',
    '["local_extension","scouting","ipm"]',
    '{"source_priority": 1.0}'
  ),
  (
    'millet-crop-identification',
    'icar-iimr-millets',
    'Millet advisory must identify the actual crop',
    'Millets include sorghum or jowar, pearl millet or bajra, finger millet or ragi, and small millets. Management differs by crop and season. Use local seed guidance, drought-resilient varieties, early weed control, and field scouting when NDVI or moisture signals are weak.',
    '["millet"]', '["kharif","rabi"]', '["india","maharashtra"]', '["research","extension"]',
    '["ndvi","moisture","drought","weed"]',
    '["downy_mildew_risk","blast_risk","leaf_spot_risk"]',
    '["crop_identification","seed_selection","scouting"]',
    '{"source_priority": 1.0}'
  ),
  (
    'rabi-jowar-moisture-potassium',
    'mpkv-rabi-sorghum',
    'Rabi jowar moisture conservation and potassium stress',
    'For rabi sorghum or jowar in Maharashtra scarcity zones, protect stored monsoon moisture through in-situ conservation, timely sowing, thinning, hoeing, integrated nutrient management, and integrated pest management. If potassium stress overlaps dry weather, correct moisture constraints first and use soil-test-based potassium decisions.',
    '["millet"]', '["rabi"]', '["maharashtra"]', '["research","extension"]',
    '["potassium","moisture","drought","soil"]',
    '["leaf_spot_risk","charcoal_rot_risk"]',
    '["moisture_conservation","nutrient_management","ipm"]',
    '{"source_priority": 1.0}'
  ),
  (
    'kharif-jowar-weed-nitrogen',
    'kvk-yavatmal-jowar',
    'Kharif jowar early weed control and split nitrogen',
    'For kharif jowar in Vidarbha, keep the crop weed-free during the first 40 to 45 days, incorporate organic manure where available, use soil-test-based fertilizer, and split nitrogen only when moisture is available. Avoid top dressing immediately before runoff-producing rainfall.',
    '["millet"]', '["kharif"]', '["maharashtra"]', '["extension"]',
    '["nitrogen","moisture","rain","weed","ndvi"]',
    '["downy_mildew_risk","leaf_spot_risk"]',
    '["weed_management","nutrient_management","weather_timing"]',
    '{"source_priority": 0.95}'
  ),
  (
    'rice-wet-canopy-disease-triage',
    'kvk-gondia-paddy',
    'Rice disease-risk triage from wet canopy and crop-health decline',
    'When rice has persistent wet conditions, high moisture or water signals, cloudy weather, and declining NDVI or crop-health scores, prioritize scouting for blast, bacterial leaf blight, and sheath blight symptoms. Remote sensing can highlight risk zones, but field symptoms and local plant-protection guidance are required before treatment.',
    '["rice"]', '["kharif"]', '["maharashtra","india"]', '["extension"]',
    '["moisture","ndvi","weather","cloud","rain"]',
    '["blast_risk","bacterial_leaf_blight_risk","sheath_blight_risk"]',
    '["disease_scouting","ipm","plant_protection"]',
    '{"source_priority": 0.9}'
  ),
  (
    'millet-disease-risk-triage',
    'icar-iimr-millets',
    'Millet disease-risk triage from moisture and vegetation anomalies',
    'For millets, wet weather with canopy stress can raise risk of downy mildew, blast, and leaf spots depending on the crop and local disease history. Dryness with nutrient stress may look like disease in satellite maps, so scout leaves, stems, and root-zone moisture before making a plant-protection recommendation.',
    '["millet"]', '["kharif","rabi"]', '["maharashtra","india"]', '["research","extension"]',
    '["moisture","ndvi","nitrogen","weather","drought"]',
    '["downy_mildew_risk","blast_risk","leaf_spot_risk"]',
    '["disease_scouting","ipm","differential_diagnosis"]',
    '{"source_priority": 0.9}'
  )
ON CONFLICT (id) DO UPDATE SET
  source_id = EXCLUDED.source_id,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  crops = EXCLUDED.crops,
  seasons = EXCLUDED.seasons,
  regions = EXCLUDED.regions,
  evidence_types = EXCLUDED.evidence_types,
  signal_tags = EXCLUDED.signal_tags,
  disease_tags = EXCLUDED.disease_tags,
  management_tags = EXCLUDED.management_tags,
  metadata = EXCLUDED.metadata;

INSERT INTO rag_ingest_runs (source_id, status, chunks_added, completed_at)
VALUES ('icar-maharashtra-soils', 'completed', 10, NOW())
ON CONFLICT DO NOTHING;

COMMENT ON TABLE rag_sources IS 'Citation source registry for GrainAI remote-sensing RAG';
COMMENT ON TABLE rag_chunks IS 'Agronomy, IPM, disease-risk, and remote-sensing recommendation chunks with pgvector embeddings';
COMMENT ON FUNCTION match_rag_chunks(VECTOR(384), TEXT, INTEGER, JSONB) IS 'Hybrid semantic and full-text retrieval for GrainAI advisory Edge Functions';
