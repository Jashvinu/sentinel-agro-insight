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
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := COALESCE(p_id, gen_random_uuid());
  v_user_id UUID := auth.uid();
  v_row_count INTEGER := 0;
BEGIN
  IF p_geometry IS NULL OR COALESCE(p_geometry->>'type', '') NOT IN ('Polygon', 'MultiPolygon') THEN
    RAISE EXCEPTION 'Farm geometry must be a GeoJSON Polygon or MultiPolygon';
  END IF;

  IF p_id IS NOT NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated session required to update an existing farm';
  END IF;

  INSERT INTO public.farms (id, name, geometry, bounds, area_hectares, user_id)
  VALUES (
    v_id,
    p_name,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::TEXT), 4326),
    p_bounds,
    p_area_hectares,
    v_user_id
  )
  ON CONFLICT ON CONSTRAINT farms_pkey DO UPDATE
  SET
    name = EXCLUDED.name,
    geometry = EXCLUDED.geometry,
    bounds = EXCLUDED.bounds,
    area_hectares = EXCLUDED.area_hectares,
    user_id = COALESCE(EXCLUDED.user_id, public.farms.user_id),
    updated_at = NOW()
  WHERE public.farms.user_id = v_user_id OR public.farms.user_id IS NULL;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'Farm upsert denied for the current user';
  END IF;

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
  FROM public.farms f
  WHERE f.id = v_id
    AND (f.user_id = v_user_id OR f.user_id IS NULL);
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
SECURITY INVOKER
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
  FROM public.farms f
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
SECURITY INVOKER
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
  FROM public.farms f
  WHERE f.id = p_id
    AND (f.user_id = auth.uid() OR f.user_id IS NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.upsert_farm_geojson(TEXT, JSONB, JSONB, NUMERIC, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_farms_geojson() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_farm_geojson(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_farm_geojson(TEXT, JSONB, JSONB, NUMERIC, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_farms_geojson() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_farm_geojson(UUID) TO anon, authenticated;
