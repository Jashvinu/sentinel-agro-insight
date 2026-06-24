-- Add PSRI (Plant Senescence Reflectance Index) column to disease_risk_cells.
-- PSRI = (B4 - B3) / B7; replaces HyMap-only RBBRI/RBBDI as BLB senescence signal.
-- Merzlyak et al. 1999, Plant Cell Environ.
ALTER TABLE disease_risk_cells
  ADD COLUMN IF NOT EXISTS psri REAL;
