-- Create table for caching agricultural index time series data (per-image observations)
-- This stores individual satellite observations for each agricultural index
-- Reduces Earth Engine API calls and improves performance

CREATE TABLE IF NOT EXISTS agricultural_index_timeseries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    algorithm TEXT NOT NULL,
    observation_date DATE NOT NULL,
    mean_value FLOAT NOT NULL,
    std_dev FLOAT,
    min_value FLOAT,
    max_value FLOAT,
    cloud_cover FLOAT,
    satellite TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one record per farm + algorithm + date combination
    UNIQUE(farm_id, algorithm, observation_date)
);

-- Add CHECK constraint for supported algorithms
ALTER TABLE agricultural_index_timeseries
ADD CONSTRAINT agricultural_index_timeseries_algorithm_check
CHECK (algorithm IN (
    -- Vegetation indices
    'ndvi',
    'evi',
    'savi',
    'msavi',
    'gndvi',
    'ndre',
    -- Water/moisture indices
    'ndwi',
    'moisture',
    -- NPK nutrients (for future expansion)
    'nitrogen',
    'phosphorus',
    'potassium'
));

-- Add CHECK constraint for satellite types
ALTER TABLE agricultural_index_timeseries
ADD CONSTRAINT agricultural_index_timeseries_satellite_check
CHECK (satellite IN (
    'Sentinel-2',
    'Landsat-8',
    'Landsat-9',
    'Sentinel-1 SAR'
));

-- Create indexes for faster queries
CREATE INDEX idx_agr_idx_ts_farm_algorithm_date
ON agricultural_index_timeseries(farm_id, algorithm, observation_date DESC);

CREATE INDEX idx_agr_idx_ts_farm_date
ON agricultural_index_timeseries(farm_id, observation_date DESC);

CREATE INDEX idx_agr_idx_ts_created
ON agricultural_index_timeseries(created_at DESC);

-- Enable Row Level Security
ALTER TABLE agricultural_index_timeseries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view time series data for their own farms
CREATE POLICY "Users can view their own agricultural index time series"
ON agricultural_index_timeseries
FOR SELECT
USING (
    farm_id IN (
        SELECT id FROM farms WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can insert time series data for their own farms
CREATE POLICY "Users can insert agricultural index time series for their farms"
ON agricultural_index_timeseries
FOR INSERT
WITH CHECK (
    farm_id IN (
        SELECT id FROM farms WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can update time series data for their own farms
CREATE POLICY "Users can update their own agricultural index time series"
ON agricultural_index_timeseries
FOR UPDATE
USING (
    farm_id IN (
        SELECT id FROM farms WHERE user_id = auth.uid()
    )
);

-- RLS Policy: Users can delete time series data for their own farms
CREATE POLICY "Users can delete their own agricultural index time series"
ON agricultural_index_timeseries
FOR DELETE
USING (
    farm_id IN (
        SELECT id FROM farms WHERE user_id = auth.uid()
    )
);

-- Add helpful comments
COMMENT ON TABLE agricultural_index_timeseries IS
'Caches per-image agricultural index observations from satellite data. Each row represents a single satellite observation for a specific farm, index, and date.';

COMMENT ON COLUMN agricultural_index_timeseries.algorithm IS
'Agricultural index type (ndvi, evi, savi, msavi, gndvi, ndre, ndwi, moisture, nitrogen, phosphorus, potassium)';

COMMENT ON COLUMN agricultural_index_timeseries.observation_date IS
'Date of the satellite observation (not a time range, single date)';

COMMENT ON COLUMN agricultural_index_timeseries.satellite IS
'Satellite sensor that captured this observation (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR)';
