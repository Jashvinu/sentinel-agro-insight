-- Disease detection v2: published indices, thermal confounder, multi-temporal
-- anomaly, and Getis-Ord Gi* hotspot significance.
-- All columns nullable for backward compatibility with existing rows.

-- Per-cell: published indices + thermal stress + temporal anomaly + Gi* z-score
ALTER TABLE disease_risk_cells
  ADD COLUMN IF NOT EXISTS ribinir        NUMERIC,  -- RIBInir blast index (Tian 2023)
  ADD COLUMN IF NOT EXISTS ribired        NUMERIC,  -- RIBIred red-edge variant / BLB proxy
  ADD COLUMN IF NOT EXISTS redsi          NUMERIC,  -- REDSI red-edge disease stress
  ADD COLUMN IF NOT EXISTS thermal_stress NUMERIC,  -- [0..1] Landsat/MODIS LST water-stress proxy
  ADD COLUMN IF NOT EXISTS anomaly_z      NUMERIC,  -- NDVI decline vs rolling baseline (stdDev units)
  ADD COLUMN IF NOT EXISTS gi_star_z      NUMERIC,  -- Getis-Ord Gi* hotspot z-score
  ADD COLUMN IF NOT EXISTS likely_abiotic BOOLEAN DEFAULT FALSE;  -- water-stress, not disease

-- Scout zones: Gi* significance of the cluster
ALTER TABLE disease_scout_zones
  ADD COLUMN IF NOT EXISTS hotspot_z    NUMERIC,    -- max Gi* z within the zone
  ADD COLUMN IF NOT EXISTS significance TEXT;       -- 'significant' | 'marginal'
