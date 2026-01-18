-- Enable PostGIS extension for geometry support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create farms table (base table for all other migrations)
CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    geometry geometry(Geometry, 4326) NOT NULL,
    bounds JSONB,
    area_hectares NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID
);

-- Add comments
COMMENT ON TABLE farms IS 'Stores farm polygons with PostGIS geometry support';
COMMENT ON COLUMN farms.geometry IS 'PostGIS geometry column accepting Polygon and MultiPolygon types';
COMMENT ON COLUMN farms.user_id IS 'References the authenticated user who owns this farm';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);
CREATE INDEX IF NOT EXISTS idx_farms_geometry ON farms USING GIST(geometry);

-- Enable Row Level Security
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own farms" ON farms
    FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert their own farms" ON farms
    FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own farms" ON farms
    FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete their own farms" ON farms
    FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Grant access to authenticated users
GRANT ALL ON farms TO authenticated;
GRANT SELECT ON farms TO anon;
