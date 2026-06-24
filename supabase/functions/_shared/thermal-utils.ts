/**
 * Thermal water-stress proxy for disease confounder reduction.
 *
 * Per the research doc (§4): a thermal-based crop-water-stress indicator separates
 * drought stress from disease and cuts false positives. Both sources are in the GEE
 * catalog (no commercial data needed):
 *   - Primary:  Landsat 8/9 Collection-2 L2 ST_B10 surface temperature (~100 m, 16-day)
 *   - Fallback: MODIS MOD11A2 LST_Day_1km (1 km, 8-day) when no clear Landsat scene
 *
 * Output is a single ee.Image band `thermal_stress` ∈ [0, 1], where higher = hotter
 * relative to the rest of the field (within-field unit-scaling). It is used ONLY to
 * SUPPRESS disease scores where the abiotic water-stress signature co-occurs — it
 * never raises a disease score (see thermalConfounder in disease-models.ts).
 *
 * KNOWN LIMITATION: Landsat thermal is ~100 m and revisits every 16 days, coarser
 * than the 10 m optical / 30 m sampling grid; values are resampled and should be read
 * as field-context, not pixel-precise.
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { evaluate } from './satellite-utils.ts';

/** Mask clouds/shadows on Landsat C2 L2 using QA_PIXEL bits 3 (cloud) and 4 (shadow). */
function maskLandsatC2(img: any): any {
  const qa = img.select('QA_PIXEL');
  const cloud  = qa.bitwiseAnd(1 << 3).eq(0);
  const shadow = qa.bitwiseAnd(1 << 4).eq(0);
  return img.updateMask(cloud.and(shadow));
}

/** Landsat C2 L2 ST_B10 → surface temperature in °C. */
function landsatLstCelsius(img: any): any {
  return img.select('ST_B10')
    .multiply(0.00341802).add(149.0)   // scale/offset → Kelvin
    .subtract(273.15)                  // → Celsius
    .rename('LST');
}

/**
 * Build a within-field normalized thermal-stress image for the date window.
 * Widens the window for thermal (16-day revisit) and falls back to MODIS.
 * Returns an ee.Image with a single band `thermal_stress` ∈ [0, 1].
 * Resolves to a constant 0 image only if neither source has data (no suppression).
 */
export async function computeThermalStress(
  geometry: any,
  startDate: string,
  endDate: string,
): Promise<any> {
  // Widen the thermal window to ±21 days to catch at least one Landsat overpass.
  const tStart = new Date(new Date(startDate).getTime() - 21 * 86400000)
    .toISOString().split('T')[0];

  const landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(geometry)
    .filterDate(tStart, endDate)
    .filter(ee.Filter.lt('CLOUD_COVER', 60))
    .map(maskLandsatC2)
    .map(landsatLstCelsius);

  let lstImage: any;
  const landsatCount: number = await evaluate(landsat.size());
  if (landsatCount > 0) {
    lstImage = landsat.median().select('LST');
  } else {
    // MODIS fallback: LST_Day_1km is in Kelvin × 0.02
    const modis = ee.ImageCollection('MODIS/061/MOD11A2')
      .filterBounds(geometry)
      .filterDate(tStart, endDate)
      .map((img: any) =>
        img.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST'),
      );
    const modisCount: number = await evaluate(modis.size());
    if (modisCount === 0) {
      // No thermal data → neutral image (thermalConfounder treats 0 as no suppression)
      return ee.Image.constant(0).clip(geometry).rename('thermal_stress');
    }
    lstImage = modis.median().select('LST');
  }

  // Within-field unit-scaling: hotter than the field's 5th–95th percentile = stress.
  const stats = lstImage.reduceRegion({
    reducer: ee.Reducer.percentile([5, 95]),
    geometry,
    scale: 100,
    maxPixels: 1e9,
    bestEffort: true,
  });
  const lo = ee.Number(stats.get('LST_p5'));
  const hi = ee.Number(stats.get('LST_p95'));
  const span = hi.subtract(lo).max(0.001);

  return lstImage
    .subtract(ee.Image(lo))
    .divide(ee.Image(span))
    .clamp(0, 1)
    .rename('thermal_stress');
}
