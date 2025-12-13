-- Create table to cache daily water distribution metrics for farms
-- Stores 14 days of rolling data per farm

CREATE TABLE IF NOT EXISTS water_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  observation_date DATE NOT NULL,
  mean_moisture NUMERIC NOT NULL,
  std_dev NUMERIC NOT NULL,
  balance_percentage INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('balanced', 'uneven', 'critical')),
  indices_data JSONB, -- Store raw data from different indices (ndwi, moisture, sar_moisture)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, observation_date)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_water_metrics_cache_farm_date 
  ON water_metrics_cache(farm_id, observation_date DESC);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_water_metrics_cache_date 
  ON water_metrics_cache(observation_date);

-- Add RLS policies
ALTER TABLE water_metrics_cache ENABLE ROW LEVEL SECURITY;

-- Users can view their own farm's metrics
CREATE POLICY "Users can view their own water metrics" 
  ON water_metrics_cache FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM farms 
      WHERE farms.id = water_metrics_cache.farm_id 
      AND farms.user_id = auth.uid()
    )
  );

-- Service role can insert/update (for background sync)
CREATE POLICY "Service role can manage water metrics" 
  ON water_metrics_cache FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_water_metrics_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER water_metrics_cache_updated_at
  BEFORE UPDATE ON water_metrics_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_water_metrics_cache_updated_at();

-- Function to clean up old data (older than 14 days)
CREATE OR REPLACE FUNCTION cleanup_old_water_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM water_metrics_cache
  WHERE observation_date < CURRENT_DATE - INTERVAL '14 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE water_metrics_cache IS 'Caches daily water distribution metrics for farms. Maintains rolling 14-day window.';
COMMENT ON COLUMN water_metrics_cache.indices_data IS 'Stores raw data from NDWI, moisture, and SAR moisture indices';

