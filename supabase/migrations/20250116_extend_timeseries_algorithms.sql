-- Extend advanced_monitoring_timeseries to support agricultural indices
-- This allows historical tracking of standard agricultural indices (NPK, NDWI, Moisture, MSAVI)
-- alongside advanced monitoring algorithms

-- Drop existing CHECK constraint
ALTER TABLE advanced_monitoring_timeseries
DROP CONSTRAINT IF EXISTS advanced_monitoring_timeseries_algorithm_check;

-- Add new constraint with extended algorithm list
ALTER TABLE advanced_monitoring_timeseries
ADD CONSTRAINT advanced_monitoring_timeseries_algorithm_check
CHECK (algorithm IN (
    -- Existing advanced monitoring algorithms
    'optram_moisture',
    'sar_moisture_change',
    'sar_moisture_fusion',
    'pca_phosphorus',
    'pca_potassium',
    'nitrogen_gndvi',
    'nitrogen_ndre',
    -- New agricultural indices
    'nitrogen',
    'phosphorus',
    'potassium',
    'ndwi',
    'moisture',
    'msavi'
));

-- Create composite index for faster queries on new algorithms
-- This optimizes queries that filter by algorithm and date range
CREATE INDEX IF NOT EXISTS idx_adv_mon_algorithm_dates
ON advanced_monitoring_timeseries(algorithm, window_start_date, window_end_date);

-- Add documentation comment
COMMENT ON CONSTRAINT advanced_monitoring_timeseries_algorithm_check
ON advanced_monitoring_timeseries
IS 'Supported algorithms: advanced monitoring (optram_moisture, sar_*, pca_*, nitrogen_gndvi/ndre) and agricultural indices (nitrogen, phosphorus, potassium, ndwi, moisture, msavi)';
