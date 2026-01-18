-- Create water_metrics_cache table to store 14 days of water distribution metrics per farm
-- This table caches calculated metrics to avoid recalculating on every dashboard load

CREATE TABLE IF NOT EXISTS water_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  observation_date DATE NOT NULL,
  index_type TEXT NOT NULL CHECK (index_type IN ('ndwi', 'moisture', 'sar_moisture')),
  mean_value NUMERIC NOT NULL,
  std_dev NUMERIC NOT NULL DEFAULT 0,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one record per farm, date, and index type
  UNIQUE(farm_id, observation_date, index_type)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_water_metrics_cache_farm_date 
  ON water_metrics_cache(farm_id, observation_date DESC);

CREATE INDEX IF NOT EXISTS idx_water_metrics_cache_farm 
  ON water_metrics_cache(farm_id);

-- Add RLS policies
ALTER TABLE water_metrics_cache ENABLE ROW LEVEL SECURITY;

-- Users can only view their own farm's cache
CREATE POLICY "Users can view their own water metrics cache" 
  ON water_metrics_cache FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  );

-- Users can insert/update their own farm's cache
CREATE POLICY "Users can manage their own water metrics cache" 
  ON water_metrics_cache FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own water metrics cache" 
  ON water_metrics_cache FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own water metrics cache" 
  ON water_metrics_cache FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_water_metrics_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_water_metrics_cache_timestamp
  BEFORE UPDATE ON water_metrics_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_water_metrics_cache_updated_at();

-- Function to clean up old data (older than 14 days)
CREATE OR REPLACE FUNCTION cleanup_old_water_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM water_metrics_cache
  WHERE observation_date < CURRENT_DATE - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE water_metrics_cache IS 'Caches 14 days of water distribution metrics per farm for fast dashboard loading';
COMMENT ON COLUMN water_metrics_cache.farm_id IS 'References the farm this metric belongs to';
COMMENT ON COLUMN water_metrics_cache.observation_date IS 'Date of the observation';
COMMENT ON COLUMN water_metrics_cache.index_type IS 'Type of water index: ndwi, moisture, or sar_moisture';
COMMENT ON COLUMN water_metrics_cache.mean_value IS 'Mean value across the polygon for this date and index';

