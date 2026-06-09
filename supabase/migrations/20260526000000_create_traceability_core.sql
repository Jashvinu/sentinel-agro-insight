-- wrkFarm traceability core
-- Buyer-compliance first: lot/event traceability, evidence, reports, public QR
-- passports, and a hash-ledger-ready audit trail.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('farmer', 'field_agent', 'aggregator', 'processor', 'buyer', 'auditor', 'admin')),
  role TEXT,
  email TEXT,
  phone TEXT,
  user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farmer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  farmer_code TEXT,
  gender TEXT,
  district TEXT,
  block TEXT,
  village_gp TEXT,
  fpc_name TEXT,
  mobile_no TEXT,
  land_owned NUMERIC,
  land_leased NUMERIC,
  total_rainfed_land NUMERIC,
  total_irrigated_land NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  farmer_profile_id UUID REFERENCES farmer_profiles(id) ON DELETE SET NULL,
  plot_code TEXT,
  name TEXT NOT NULL,
  geometry geometry(Geometry, 4326),
  crop_focus TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  polygon_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'draft' CHECK (verification_status IN ('draft', 'field_verified', 'satellite_supported', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crop_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plot_id UUID REFERENCES plots(id) ON DELETE SET NULL,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  crop TEXT NOT NULL,
  variety TEXT,
  season TEXT,
  planting_date DATE,
  expected_harvest_date DATE,
  actual_harvest_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'planted', 'growing', 'harvested', 'closed', 'cancelled')),
  area_hectares NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE SET NULL,
  lot_code TEXT NOT NULL,
  crop TEXT NOT NULL,
  variety TEXT,
  season TEXT,
  production_area_hectares NUMERIC,
  initial_quantity NUMERIC NOT NULL DEFAULT 0,
  current_quantity NUMERIC NOT NULL DEFAULT 0,
  quantity_unit TEXT NOT NULL DEFAULT 'kg',
  owner_actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'planted', 'harvested', 'aggregated', 'quality_checked', 'stored', 'processed', 'packed', 'shipped', 'received', 'closed', 'flagged')),
  compliance_status TEXT NOT NULL DEFAULT 'not_assessed' CHECK (compliance_status IN ('not_assessed', 'incomplete', 'review_needed', 'ready', 'verified')),
  evidence_score NUMERIC NOT NULL DEFAULT 0 CHECK (evidence_score >= 0 AND evidence_score <= 100),
  risk_score NUMERIC NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_lot_code_per_org UNIQUE (organization_id, lot_code)
);

CREATE TABLE IF NOT EXISTS lot_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  source_lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
  source_crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE SET NULL,
  quantity NUMERIC,
  quantity_unit TEXT NOT NULL DEFAULT 'kg',
  relationship_type TEXT NOT NULL DEFAULT 'commingled' CHECK (relationship_type IN ('single_origin', 'commingled', 'split', 'repacked', 'transformed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'plot_registered',
    'crop_planted',
    'input_applied',
    'field_observed',
    'harvested',
    'aggregated',
    'quality_checked',
    'stored',
    'processed',
    'packed',
    'shipped',
    'received'
  )),
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  plot_id UUID REFERENCES plots(id) ON DELETE SET NULL,
  crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
  location geometry(Point, 4326),
  location_json JSONB,
  quantity_in NUMERIC,
  quantity_out NUMERIC,
  quantity_unit TEXT,
  source_system TEXT NOT NULL DEFAULT 'wrkfarm',
  device_id TEXT,
  cte_type TEXT,
  kde_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  confidence_score NUMERIC NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  hash_status TEXT NOT NULL DEFAULT 'pending' CHECK (hash_status IN ('pending', 'batched', 'anchored', 'verified', 'mismatch')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trace_event_id UUID NOT NULL REFERENCES trace_events(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'satellite_diagnostic',
    'agricultural_index',
    'water_metric',
    'weather',
    'field_photo',
    'survey',
    'lab_report',
    'weighbridge_slip',
    'invoice',
    'certificate',
    'field_agent_verification',
    'document_ai_extract',
    'other'
  )),
  source_kind TEXT NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual', 'supabase', 'earth_engine', 'gemini', 'iot', 'import')),
  title TEXT NOT NULL,
  uri TEXT,
  storage_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::JSONB,
  confidence_score NUMERIC NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  framework TEXT NOT NULL CHECK (framework IN ('buyer_due_diligence', 'eudr', 'fsma204', 'organic', 'carbon_mrv', 'custom')),
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'review_needed', 'ready', 'verified')),
  score NUMERIC NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  summary TEXT NOT NULL,
  missing_requirements JSONB NOT NULL DEFAULT '[]'::JSONB,
  risk_flags JSONB NOT NULL DEFAULT '[]'::JSONB,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('buyer_audit', 'cte_kde', 'qr_passport', 'farm_map_packet', 'evidence_bundle', 'commodity_checklist')),
  title TEXT NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  report_url TEXT,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('draft', 'generated', 'shared', 'revoked')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hash_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_date DATE NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  merkle_root TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'sha256-merkle-v1',
  event_hashes JSONB NOT NULL DEFAULT '[]'::JSONB,
  polygon_tx_hash TEXT,
  anchored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_hash_batch_per_day UNIQUE (organization_id, batch_date)
);

CREATE TABLE IF NOT EXISTS qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  public_slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  scan_count INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_trace_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  queue_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'synced', 'failed')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_actors_org_type ON actors(organization_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_farmer_profiles_org ON farmer_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_plots_org_farm ON plots(organization_id, farm_id);
CREATE INDEX IF NOT EXISTS idx_plots_geometry ON plots USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_crop_cycles_org_crop ON crop_cycles(organization_id, crop, status);
CREATE INDEX IF NOT EXISTS idx_lots_org_status ON lots(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_crop ON lots(crop, season);
CREATE INDEX IF NOT EXISTS idx_lot_sources_parent ON lot_sources(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_sources_source ON lot_sources(source_lot_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_org_time ON trace_events(organization_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_events_lot_time ON trace_events(lot_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_trace_events_hash ON trace_events(event_hash);
CREATE INDEX IF NOT EXISTS idx_trace_events_location ON trace_events USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_event_evidence_event ON event_evidence(trace_event_id);
CREATE INDEX IF NOT EXISTS idx_assessments_lot ON compliance_assessments(lot_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_lot ON compliance_reports(lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hash_batches_org_date ON hash_batches(organization_id, batch_date DESC);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_lot ON qr_tokens(lot_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_offline_trace_queue_status ON offline_trace_queue(status, created_at);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations',
    'actors',
    'farmer_profiles',
    'plots',
    'crop_cycles',
    'lots'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER touch_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_farm_geojson(
  p_name TEXT,
  p_geometry JSONB,
  p_bounds JSONB DEFAULT NULL,
  p_area_hectares NUMERIC DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  geometry JSONB,
  bounds JSONB,
  area_hectares NUMERIC,
  user_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := COALESCE(p_id, gen_random_uuid());
BEGIN
  INSERT INTO farms (id, name, geometry, bounds, area_hectares, user_id)
  VALUES (
    v_id,
    p_name,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::TEXT), 4326),
    p_bounds,
    p_area_hectares,
    p_user_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    geometry = EXCLUDED.geometry,
    bounds = EXCLUDED.bounds,
    area_hectares = EXCLUDED.area_hectares,
    user_id = COALESCE(EXCLUDED.user_id, farms.user_id),
    updated_at = NOW();

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    ST_AsGeoJSON(f.geometry)::JSONB AS geometry,
    f.bounds,
    f.area_hectares,
    f.user_id,
    f.created_at,
    f.updated_at
  FROM farms f
  WHERE f.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_farms_geojson()
RETURNS TABLE (
  id UUID,
  name TEXT,
  geometry JSONB,
  bounds JSONB,
  area_hectares NUMERIC,
  user_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.name,
    ST_AsGeoJSON(f.geometry)::JSONB AS geometry,
    f.bounds,
    f.area_hectares,
    f.user_id,
    f.created_at,
    f.updated_at
  FROM farms f
  WHERE f.user_id = auth.uid() OR f.user_id IS NULL
  ORDER BY f.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_farm_geojson(p_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  geometry JSONB,
  bounds JSONB,
  area_hectares NUMERIC,
  user_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.name,
    ST_AsGeoJSON(f.geometry)::JSONB AS geometry,
    f.bounds,
    f.area_hectares,
    f.user_id,
    f.created_at,
    f.updated_at
  FROM farms f
  WHERE f.id = p_id AND (f.user_id = auth.uid() OR f.user_id IS NULL)
  LIMIT 1;
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE hash_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_trace_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_trace_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organizations o
    WHERE o.id = p_org_id
      AND (
        o.owner_user_id = auth.uid()
        OR o.owner_user_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM actors a
          WHERE a.organization_id = o.id
            AND a.user_id = auth.uid()
        )
      )
  );
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'actors',
    'farmer_profiles',
    'plots',
    'crop_cycles',
    'lots',
    'lot_sources',
    'trace_events',
    'event_evidence',
    'compliance_assessments',
    'compliance_reports',
    'hash_batches',
    'qr_tokens',
    'offline_trace_queue'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Trace org members can read %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Trace org members can insert %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Trace org members can update %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Trace org members can delete %I" ON %I', table_name, table_name);
    EXECUTE format('CREATE POLICY "Trace org members can read %I" ON %I FOR SELECT USING (public.can_access_trace_org(organization_id))', table_name, table_name);
    EXECUTE format('CREATE POLICY "Trace org members can insert %I" ON %I FOR INSERT WITH CHECK (public.can_access_trace_org(organization_id))', table_name, table_name);
    EXECUTE format('CREATE POLICY "Trace org members can update %I" ON %I FOR UPDATE USING (public.can_access_trace_org(organization_id))', table_name, table_name);
    EXECUTE format('CREATE POLICY "Trace org members can delete %I" ON %I FOR DELETE USING (public.can_access_trace_org(organization_id))', table_name, table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Trace org members can read organizations" ON organizations;
DROP POLICY IF EXISTS "Trace org members can insert organizations" ON organizations;
DROP POLICY IF EXISTS "Trace org members can update organizations" ON organizations;

CREATE POLICY "Trace org members can read organizations"
  ON organizations FOR SELECT
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "Trace org members can insert organizations"
  ON organizations FOR INSERT
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "Trace org members can update organizations"
  ON organizations FOR UPDATE
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

DROP POLICY IF EXISTS "Trace org members can read audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Trace org members can insert audit logs" ON audit_logs;

CREATE POLICY "Trace org members can read audit logs"
  ON audit_logs FOR SELECT
  USING (organization_id IS NULL OR public.can_access_trace_org(organization_id));

CREATE POLICY "Trace org members can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (organization_id IS NULL OR public.can_access_trace_org(organization_id));

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON organizations, actors, farmer_profiles, plots, crop_cycles, lots, lot_sources, trace_events, event_evidence, compliance_assessments, compliance_reports, hash_batches, qr_tokens, audit_logs, offline_trace_queue TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_farm_geojson(TEXT, JSONB, JSONB, NUMERIC, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_farms_geojson() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_farm_geojson(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_trace_org(UUID) TO anon, authenticated;

COMMENT ON TABLE lots IS 'Buyer-facing traceability lots for crop, harvest, aggregation, processing, packing, and shipping flows';
COMMENT ON TABLE trace_events IS 'GS1-style critical tracking events with KDE payloads and deterministic hash fields';
COMMENT ON TABLE event_evidence IS 'Documents, satellite outputs, weather, field verification, and other proof attached to trace events';
COMMENT ON TABLE hash_batches IS 'Daily Merkle root batches; polygon_tx_hash is nullable for later L2 anchoring';
COMMENT ON TABLE qr_tokens IS 'Read-only public passport tokens for lot-level buyer and consumer verification';
