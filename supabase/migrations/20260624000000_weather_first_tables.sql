-- ============================================================
-- Weather-First Disease Pressure Engine — Table Schema
-- Migration: 20260624000000_weather_first_tables.sql
-- Branch: feat/weather-first-disease-pressure-engine
--
-- Four tables:
--   1. weather_hourly                — raw hourly Open-Meteo data
--   2. weather_daily_features        — engineered disease-ready daily features
--   3. remote_sensing_observations   — per-field, per-date satellite snapshot
--   4. disease_risk_daily            — unified risk output (weather × satellite)
-- ============================================================

-- -----------------------------------------------------------
-- 1. weather_hourly
--    Stores raw hourly weather from Open-Meteo (past + forecast).
--    model_run_id distinguishes forecast runs for backtesting
--    using the Historical Forecast API (so we store the forecast
--    that would have been available at that time, not hindsight).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_hourly (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                  uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  timestamp                timestamptz NOT NULL,
  -- Core atmospheric
  temp_2m                  real,          -- °C
  rh_2m                    real,          -- %
  dewpoint_2m              real,          -- °C
  dewpoint_depression      real,          -- T - Tdew (°C) — derived
  vpd                      real,          -- kPa
  -- Precipitation & wind
  rain_mm                  real,          -- mm/h
  wind_speed               real,          -- m/s at 10m
  wind_gust                real,          -- m/s
  cloud_cover              real,          -- %
  -- Soil
  soil_temp_0_6cm          real,          -- °C
  soil_moisture_0_9cm      real,          -- m³/m³
  -- ET & wetness
  et0                      real,          -- mm/h reference ET
  leaf_wetness_probability real,          -- 0–1 (daily; backfilled to hourly)
  -- Metadata
  source                   text NOT NULL DEFAULT 'open-meteo', -- 'open-meteo' | 'era5' | 'imerg'
  model_run_id             text,          -- ISO datetime of forecast model run (null = historical)
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weather_hourly_farm_ts
  ON weather_hourly (farm_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS weather_hourly_model_run
  ON weather_hourly (farm_id, model_run_id, timestamp DESC);

-- Unique: one row per farm × hour × model_run (null model_run = historical)
CREATE UNIQUE INDEX IF NOT EXISTS weather_hourly_unique
  ON weather_hourly (farm_id, timestamp, COALESCE(model_run_id, 'historical'));

-- -----------------------------------------------------------
-- 2. weather_daily_features
--    Engineered disease-ready daily aggregates computed from
--    weather_hourly. These are the inputs to the infection
--    pressure models in weather-pressure.ts.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_daily_features (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                  uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date                     date NOT NULL,
  -- Wetness proxies
  leaf_wetness_hours       real,   -- count of hours RH>=90 OR LWP>=0.5 OR dewdep<=2°C
  night_rh_hours           real,   -- count of 18:00–06:00 hours with RH>=90%
  consecutive_wet_days     integer,-- streak of days with >4 leaf wetness hours
  -- Rainfall
  rain_24h                 real,   -- mm
  rain_72h                 real,   -- mm
  rain_7d                  real,   -- mm
  storm_flag               boolean, -- any hour with rain_mm >= 5
  rain_splash_pressure     real,   -- rain_24h + 0.5*rain_72h + storm_flag*20
  -- Temperature suitability (Gaussian kernel per pathogen)
  temp_suitability_blast   real,   -- [0,1] — optimal 20-28°C
  temp_suitability_blight  real,   -- [0,1] — optimal 20-32°C warm-moist
  temp_suitability_mildew  real,   -- [0,1] — cool-moist <25°C
  -- VPD & stress
  vpd_mean                 real,   -- kPa daily mean
  vpd_max                  real,   -- kPa daily max
  dry_stress_score         real,   -- [0,1] for charcoal rot / abiotic
  soil_moisture_score      real,   -- [0,1] (0 = dry = stress risk)
  -- Pre-computed disease pressure scores (Layer 1)
  blast_weather_pressure   real,   -- [0,1]
  sheath_blight_pressure   real,   -- [0,1]
  blb_pressure             real,   -- [0,1]
  downy_mildew_pressure    real,   -- [0,1]
  leaf_spot_pressure       real,   -- [0,1]
  charcoal_rot_pressure    real,   -- [0,1]
  -- Metadata
  source                   text DEFAULT 'open-meteo',
  is_forecast              boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS weather_daily_features_unique
  ON weather_daily_features (farm_id, date);
CREATE INDEX IF NOT EXISTS weather_daily_features_farm_date
  ON weather_daily_features (farm_id, date DESC);

-- -----------------------------------------------------------
-- 3. remote_sensing_observations
--    One row per field per observation date per source.
--    Stores both raw indices AND time-series anomaly features
--    (z-scores vs. plot baseline, patchiness, SAR features).
--    cloud_score_plus replaces binary cloud mask.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS remote_sensing_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date            date NOT NULL,
  source          text NOT NULL DEFAULT 'sentinel2', -- 'sentinel2' | 'landsat8' | 'landsat9' | 'sentinel1' | 'modis'
  -- Cloud / data quality
  cloud_score_plus real,    -- [0,1] Cloud Score+ cs_cdf weighted usability
  cloud_cover_pct  real,    -- legacy cloud cover %
  -- Vegetation / chlorophyll
  ndvi             real,
  ndre             real,    -- (B8-B5)/(B8+B5) — NEW, stronger disease signal
  cire             real,    -- (B8/B5)-1
  mtci             real,    -- (B6-B5)/(B5-B4)
  -- Water / moisture stress
  ndmi             real,    -- (B8-B11)/(B8+B11)
  msi              real,    -- B11/B8 moisture stress index — NEW
  dws              real,    -- 0.6*NDMI + 0.4*NMDI
  -- Senescence / disease-specific
  psri             real,    -- (B4-B3)/B7
  sipi             real,    -- (B8-B2)/(B8-B4) pigment index — NEW
  rbvi             real,    -- rice blast index
  ribinir          real,
  ribired          real,
  redsi            real,
  -- Spatial patchiness
  ndvi_cv          real,    -- spatial coefficient of variation
  -- Time-series anomaly z-scores vs. plot's own rolling baseline
  ndvi_z_7d        real,    -- z-score of current NDVI vs. 7d baseline
  ndvi_z_14d       real,    -- z-score vs. 14d baseline
  ndvi_z_21d       real,    -- z-score vs. 21d baseline
  ndre_z_14d       real,    -- NDRE z-score (more sensitive than NDVI)
  cire_z_14d       real,
  ndmi_z_14d       real,
  -- SAR (Sentinel-1) — populated when source='sentinel1'
  vv               real,
  vh               real,
  vv_vh_ratio      real,
  delta_vh_7d      real,    -- VH change vs. 7d rolling median
  delta_vh_14d     real,
  sar_wetness_anomaly real, -- normalized canopy wetness anomaly
  -- Thermal
  lst_day          real,    -- °C MODIS/Landsat LST daytime
  lst_night        real,    -- °C LST nighttime
  lst_anomaly      real,    -- z-score vs. seasonal baseline
  -- Metadata
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS remote_sensing_obs_unique
  ON remote_sensing_observations (farm_id, date, source);
CREATE INDEX IF NOT EXISTS remote_sensing_obs_farm_date
  ON remote_sensing_observations (farm_id, date DESC);

-- -----------------------------------------------------------
-- 4. disease_risk_daily
--    Unified daily risk output produced by the
--    weather-disease-pressure edge function.
--    weather_pressure + satellite_response → final_risk + forecast.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS disease_risk_daily (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                         uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date                            date NOT NULL,
  crop                            text NOT NULL DEFAULT 'rice',
  stage                           text,
  -- Layer 1: weather infection pressure scores [0,1]
  rice_blast_weather_pressure     real,
  sheath_blight_pressure          real,
  blb_pressure                    real,
  downy_mildew_pressure           real,
  leaf_spot_pressure              real,
  charcoal_rot_pressure           real,
  -- Layer 2: satellite anomaly response scores [0,1]
  rice_blast_satellite_response   real,
  sheath_blight_satellite_response real,
  blb_satellite_response          real,
  downy_mildew_satellite_response real,
  leaf_spot_satellite_response    real,
  charcoal_rot_satellite_response real,
  -- Abiotic stress disambiguation
  abiotic_stress_probability      real,  -- [0,1] — if high, suppress disease flags
  -- Combined output
  rice_blast_final_risk           real,
  sheath_blight_final_risk        real,
  blb_final_risk                  real,
  downy_mildew_final_risk         real,
  leaf_spot_final_risk            real,
  charcoal_rot_final_risk         real,
  composite_risk                  real,  -- max across applicable diseases
  top_disease                     text,  -- highest risk disease name
  -- Forecast
  forecast_3d_risk                real,  -- 3-day forward weather pressure
  forecast_7d_risk                real,  -- 7-day forward weather pressure
  -- Advisory
  confidence                      text,  -- 'low' | 'medium' | 'medium-high' | 'high'
  primary_driver                  text,  -- 'weather' | 'satellite' | 'both' | 'abiotic'
  scout_priority                  text,  -- 'low' | 'medium' | 'high'
  spray_window_flag               boolean, -- true if spray window is open
  recommended_action              text,  -- human-readable advisory sentence
  reason_summary                  text,  -- e.g. "14h leaf wetness + CIre decline"
  -- Data availability
  satellite_available             boolean DEFAULT false,
  satellite_source                text,
  weather_source                  text DEFAULT 'open-meteo',
  -- Metadata
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS disease_risk_daily_unique
  ON disease_risk_daily (farm_id, date);
CREATE INDEX IF NOT EXISTS disease_risk_daily_farm_date
  ON disease_risk_daily (farm_id, date DESC);
CREATE INDEX IF NOT EXISTS disease_risk_daily_risk
  ON disease_risk_daily (composite_risk DESC, date DESC)
  WHERE composite_risk >= 0.40;
