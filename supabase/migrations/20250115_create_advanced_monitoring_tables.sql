-- Advanced Monitoring Time Series Table
-- Stores 10-day window data for all algorithms
CREATE TABLE IF NOT EXISTS advanced_monitoring_timeseries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    algorithm TEXT NOT NULL CHECK (algorithm IN (
        'optram_moisture',
        'sar_moisture_change',
        'sar_moisture_fusion',
        'pca_phosphorus',
        'pca_potassium',
        'nitrogen_gndvi',
        'nitrogen_ndre'
    )),
    window_start_date DATE NOT NULL,
    window_end_date DATE NOT NULL,
    mean_value NUMERIC NOT NULL,
    std_dev NUMERIC,
    min_value NUMERIC,
    max_value NUMERIC,
    pixel_count INTEGER,
    cloud_cover_percent NUMERIC,
    sensor_sources TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_farm_algorithm_window UNIQUE(farm_id, algorithm, window_start_date, window_end_date)
);

-- Indexes for performance
CREATE INDEX idx_adv_mon_farm_algorithm ON advanced_monitoring_timeseries(farm_id, algorithm);
CREATE INDEX idx_adv_mon_dates ON advanced_monitoring_timeseries(window_start_date, window_end_date);
CREATE INDEX idx_adv_mon_created ON advanced_monitoring_timeseries(created_at);

-- Trend Analysis Table
-- Stores Theil-Sen trend analysis results
CREATE TABLE IF NOT EXISTS trend_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    algorithm TEXT NOT NULL,
    analysis_start_date DATE NOT NULL,
    analysis_end_date DATE NOT NULL,
    theilsen_slope NUMERIC NOT NULL,
    slope_confidence_interval_lower NUMERIC,
    slope_confidence_interval_upper NUMERIC,
    trend_direction TEXT NOT NULL CHECK (trend_direction IN ('Increasing', 'Decreasing', 'Stable')),
    significance_level NUMERIC,
    window_count INTEGER NOT NULL,
    r_squared NUMERIC,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_farm_algorithm_analysis_period UNIQUE(farm_id, algorithm, analysis_start_date, analysis_end_date)
);

-- Indexes for performance
CREATE INDEX idx_trend_farm_algorithm ON trend_analysis(farm_id, algorithm);
CREATE INDEX idx_trend_dates ON trend_analysis(analysis_start_date, analysis_end_date);
CREATE INDEX idx_trend_created ON trend_analysis(created_at);

-- Enable Row Level Security
ALTER TABLE advanced_monitoring_timeseries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for advanced_monitoring_timeseries
CREATE POLICY "Users can view their farm's monitoring data"
    ON advanced_monitoring_timeseries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM farms
            WHERE farms.id = advanced_monitoring_timeseries.farm_id
            AND farms.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert monitoring data"
    ON advanced_monitoring_timeseries
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can update monitoring data"
    ON advanced_monitoring_timeseries
    FOR UPDATE
    USING (true);

-- RLS Policies for trend_analysis
CREATE POLICY "Users can view their farm's trend analysis"
    ON trend_analysis
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM farms
            WHERE farms.id = trend_analysis.farm_id
            AND farms.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert trend analysis"
    ON trend_analysis
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can update trend analysis"
    ON trend_analysis
    FOR UPDATE
    USING (true);

-- Comments for documentation
COMMENT ON TABLE advanced_monitoring_timeseries IS 'Stores time series data for advanced monitoring algorithms with 10-day windows';
COMMENT ON TABLE trend_analysis IS 'Stores Theil-Sen trend analysis results for agricultural parameters';
COMMENT ON COLUMN advanced_monitoring_timeseries.algorithm IS 'Algorithm identifier: optram_moisture, sar_moisture_change, pca_phosphorus, etc.';
COMMENT ON COLUMN advanced_monitoring_timeseries.window_start_date IS 'Start date of the 10-day observation window';
COMMENT ON COLUMN advanced_monitoring_timeseries.window_end_date IS 'End date of the 10-day observation window';
COMMENT ON COLUMN advanced_monitoring_timeseries.sensor_sources IS 'Array of sensor sources used (e.g., [''S2'', ''L8'', ''L9'', ''S1''])';
COMMENT ON COLUMN trend_analysis.theilsen_slope IS 'Median of all pairwise slopes (non-parametric trend estimator)';
COMMENT ON COLUMN trend_analysis.trend_direction IS 'Trend classification based on confidence interval: Increasing, Decreasing, or Stable';
COMMENT ON COLUMN trend_analysis.significance_level IS 'P-value from Mann-Kendall test';
