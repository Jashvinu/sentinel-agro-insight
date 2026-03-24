-- Create diagnostics_cache table for storing pre-rendered raster map data
CREATE TABLE IF NOT EXISTS diagnostics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    date_range JSONB NOT NULL,            -- { "start": "2026-01-01", "end": "2026-03-24" }
    season TEXT NOT NULL,                 -- 'winter' | 'spring' | 'summer' | 'fall'
    indices JSONB NOT NULL,               -- ["ndvi", "nitrogen", "moisture", "phosphorus"]
    raster_urls JSONB NOT NULL,           -- { "ndvi": "diagnostics/farm-id/ts/ndvi.png", ... }
    bounds JSONB NOT NULL,                -- [[south, west], [north, east]]
    cell_stats JSONB NOT NULL,            -- Full GridCell[] array with problems
    analysis_summary JSONB NOT NULL,      -- { problems, farmStats, metadata }
    user_id UUID,
    CONSTRAINT unique_farm_cache UNIQUE (farm_id)
);

-- Comments
COMMENT ON TABLE diagnostics_cache IS 'Caches pre-rendered diagnostic raster images and cell stats per farm';
COMMENT ON COLUMN diagnostics_cache.raster_urls IS 'Paths to PNG raster images in Supabase Storage diagnostics bucket';
COMMENT ON COLUMN diagnostics_cache.cell_stats IS 'Per-cell problem data for click-to-popup interactivity';
COMMENT ON COLUMN diagnostics_cache.bounds IS 'Lat/lng bounding box for Leaflet ImageOverlay positioning';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_diagnostics_cache_farm_id ON diagnostics_cache(farm_id);
CREATE INDEX IF NOT EXISTS idx_diagnostics_cache_expires ON diagnostics_cache(expires_at);

-- Enable Row Level Security
ALTER TABLE diagnostics_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same permissive pattern as farms table)
CREATE POLICY "Users can view their own diagnostics cache" ON diagnostics_cache
    FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert diagnostics cache" ON diagnostics_cache
    FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update diagnostics cache" ON diagnostics_cache
    FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can delete diagnostics cache" ON diagnostics_cache
    FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Grant access
GRANT ALL ON diagnostics_cache TO authenticated;
GRANT SELECT ON diagnostics_cache TO anon;

-- Create storage bucket for diagnostics raster images
INSERT INTO storage.buckets (id, name, public)
VALUES ('diagnostics', 'diagnostics', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated users to upload/read
CREATE POLICY "Allow public read of diagnostic rasters"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'diagnostics');

CREATE POLICY "Allow authenticated upload of diagnostic rasters"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'diagnostics');

CREATE POLICY "Allow authenticated update of diagnostic rasters"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'diagnostics');

CREATE POLICY "Allow authenticated delete of diagnostic rasters"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'diagnostics');
