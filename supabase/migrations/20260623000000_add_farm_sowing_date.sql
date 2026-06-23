-- Add sowing_date and crop_family to farms for phenology-aware diagnostics.
-- sowing_date: ISO date of sowing / transplanting for the current season.
-- crop_family: 'rice' | 'millet' | 'generic' — coarser than crop_type, used
--              for BBCH calendar selection. Derived from crop_type when null.

ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS sowing_date DATE,
  ADD COLUMN IF NOT EXISTS crop_family TEXT CHECK (crop_family IN ('rice', 'millet', 'generic'));

COMMENT ON COLUMN farms.sowing_date IS 'Sowing / transplant date for the current kharif/rabi season. Drives phenology-aware diagnostic thresholds.';
COMMENT ON COLUMN farms.crop_family IS 'Crop family used for BBCH stage calendar: rice | millet | generic.';
