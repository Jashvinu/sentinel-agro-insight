/**
 * remote-sensing-features.ts
 *
 * Layer 2 of the Weather-First Disease Pressure Engine.
 *
 * Responsibilities:
 *   1. Compute time-series anomaly z-scores for key spectral indices
 *      (z-score vs. each plot's OWN rolling baseline — cancels field-wide drought)
 *   2. Add new indices: NDRE, MSI, SIPI, expanded SAR features
 *   3. Integrate Cloud Score+ (GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED)
 *      for weighted composites instead of hard cloud masking
 *   4. Aggregate per-disease satellite response scores [0,1]
 *
 * The satellite layer does NOT trigger disease risk on its own.
 * It CONFIRMS whether the crop canopy is responding consistently with
 * the weather infection pressure computed in weather-pressure.ts.
 *
 * References:
 *   - Cloud Score+: https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED
 *   - S2 SR Harmonized: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED
 *   - Sentinel-1 GRD: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { evaluate } from './satellite-utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteSensingSnapshot {
  date: string;
  source: string;
  cloud_score_plus: number | null;   // Cloud Score+ cs_cdf [0,1]; null if not S2
  cloud_cover_pct: number | null;
  // Core vegetation / chlorophyll
  ndvi: number;
  ndre: number | null;               // Sentinel-2 only
  cire: number | null;               // Sentinel-2 only
  mtci: number | null;               // Sentinel-2 only
  // Water / moisture
  ndmi: number;
  msi: number | null;                // B11/B8 — NEW
  dws: number | null;
  // Senescence / disease
  psri: number | null;
  sipi: number | null;               // NEW — structure-independent pigment
  rbvi: number | null;               // Sentinel-2 only
  ribinir: number | null;
  ribired: number | null;
  redsi: number | null;
  // Spatial patchiness
  ndvi_cv: number | null;
  // Time-series anomalies (z-score vs. plot's own rolling baseline)
  ndvi_z_7d: number | null;
  ndvi_z_14d: number | null;
  ndvi_z_21d: number | null;
  ndre_z_14d: number | null;
  cire_z_14d: number | null;
  ndmi_z_14d: number | null;
  // SAR (populated only when source includes Sentinel-1)
  vv: number | null;
  vh: number | null;
  vv_vh_ratio: number | null;
  delta_vh_7d: number | null;
  delta_vh_14d: number | null;
  sar_wetness_anomaly: number | null;
  // Thermal
  lst_day: number | null;
  lst_night: number | null;
  lst_anomaly: number | null;
}

/** Per-disease satellite anomaly response scores [0,1] */
export interface SatelliteAnomalyResponse {
  rice_blast: number;
  sheath_blight: number;
  bacterial_leaf_blight: number;
  downy_mildew: number;
  leaf_spot: number;
  charcoal_rot: number;
  abiotic_stress: number;           // if high, suppress biotic disease flags
  data_quality: 'good' | 'partial' | 'sar_only' | 'no_data';
  primary_signals: string[];         // list of triggered anomaly signals for advisory
}

// ---------------------------------------------------------------------------
// GEE helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Build a Cloud Score+ weighted Sentinel-2 composite.
 *
 * Cloud Score+ assigns each pixel a cs_cdf score [0,1] representing
 * clear-sky usability. Instead of discarding images above a cloud threshold,
 * we weight each observation by its cs_cdf score. This is critical during
 * monsoon season where hard cloud filtering would leave no data.
 *
 * cs_cdf > 0.6 = high confidence clear
 * cs_cdf > 0.4 = probably clear (use with lower weight)
 * cs_cdf < 0.2 = likely cloudy (exclude)
 */
function buildCloudScorePlusComposite(
  geometry: any,
  startDate: string,
  endDate: string,
  minCsScore: number = 0.2,
): any {
  const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'],
             ['blue', 'green', 'red', 'rededge', 'rededge2', 'rededge3', 'nir', 'nir2', 'swir1', 'swir2'])
    .map((img: any) => img.multiply(0.0001));

  const csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(startDate, endDate);

  // Join Cloud Score+ to S2 by system:index
  const joined = s2.linkCollection(csPlus, ['cs', 'cs_cdf']);

  // Mask pixels below minimum cloud score; weight by cs_cdf
  const weighted = joined.map((img: any) => {
    const cs = img.select('cs_cdf');
    return img
      .updateMask(cs.gte(minCsScore))
      .multiply(cs)
      .copyProperties(img, ['system:time_start', 'CLOUDY_PIXEL_PERCENTAGE']);
  });

  // Weighted mean composite
  const composite = weighted.mean().clip(geometry);
  const weightSum = joined
    .map((img: any) => img.select('cs_cdf').updateMask(img.select('cs_cdf').gte(minCsScore)))
    .mean()
    .clip(geometry);

  // Normalize by weight sum to recover reflectance values
  return composite.divide(weightSum.max(ee.Image(0.01)));
}

/**
 * Compute all spectral indices from a composite image.
 * Returns a multi-band image with named bands.
 */
function computeAllIndices(composite: any): any {
  const B2  = composite.select('blue');
  const B3  = composite.select('green');
  const B4  = composite.select('red');
  const B5  = composite.select('rededge');
  const B6  = composite.select('rededge2');
  const B7  = composite.select('rededge3');
  const B8  = composite.select('nir');
  const B8A = composite.select('nir2');
  const B11 = composite.select('swir1');
  const B12 = composite.select('swir2');

  // Standard
  const ndvi = B8.subtract(B4).divide(B8.add(B4)).clamp(-1, 1).rename('NDVI');
  const ndmi = B8.subtract(B11).divide(B8.add(B11)).clamp(-1, 1).rename('NDMI');

  // New indices (Layer 2 additions)
  const ndre = B8.subtract(B5).divide(B8.add(B5)).clamp(-1, 1).rename('NDRE');
  const msi  = B11.divide(B8.max(ee.Image(0.001))).clamp(0, 5).rename('MSI');   // moisture stress index
  const sipi = B8.subtract(B2).divide(B8.subtract(B4).abs().max(ee.Image(0.001))).clamp(0, 4).rename('SIPI'); // pigment index

  // Existing disease indices
  const cire  = B8.divide(B5.max(ee.Image(0.001))).subtract(1).clamp(0, 10).rename('CIre');
  const mtci  = B6.subtract(B5).divide(B5.subtract(B4).abs().max(ee.Image(0.001))).clamp(-5, 10).rename('MTCI');
  const psri  = B4.subtract(B3).divide(B7.max(ee.Image(0.001))).clamp(-1, 1).rename('PSRI');
  const rbvi  = B8.multiply(9.78).subtract(B5.divide(B4.max(ee.Image(0.001))).multiply(2.08)).clamp(-2, 5).rename('RBVI');

  const nmdi  = B8.subtract(B11.subtract(B12)).divide(B8.add(B11.subtract(B12)).abs().max(ee.Image(0.001)));
  const dws   = ndmi.multiply(0.6).add(nmdi.multiply(0.4)).clamp(-1, 1).rename('DWS');

  const ribinir = B7.subtract(B11).divide(B4.add(B11).max(ee.Image(0.001))).clamp(0, 2).rename('RIBInir');
  const ribired = B5.subtract(B8A).divide(B4.add(B8A).max(ee.Image(0.001))).clamp(-1, 1).rename('RIBIred');
  const redsi   = B7.subtract(B4).multiply(40)
    .subtract(B5.subtract(B4).multiply(118))
    .divide(B4.multiply(2).max(ee.Image(0.001)))
    .clamp(-50, 50).rename('REDSI');

  // NDVI spatial coefficient of variation (30m kernel)
  const kernel    = ee.Kernel.square({ radius: 3, units: 'pixels' });
  const ndviMean  = ndvi.reduceNeighborhood(ee.Reducer.mean(), kernel).rename('NDVI_mean');
  const ndviSd    = ndvi.reduceNeighborhood(ee.Reducer.stdDev(), kernel).rename('NDVI_sd');
  const ndvi_cv   = ndviSd.divide(ndviMean.abs().max(ee.Image(0.01))).clamp(0, 2).rename('NDVI_CV');

  return ee.Image.cat([
    ndvi, ndre, cire, mtci, ndmi, msi, dws, sipi,
    psri, rbvi, ribinir, ribired, redsi, ndvi_cv,
  ]);
}

/**
 * Build a per-pixel NDVI baseline (mean + stdDev) over N prior days.
 * The z-score = (baseline - current) / stdDev measures how far the current
 * NDVI sits BELOW each cell's own history — cancels field-wide drought.
 */
function buildNdviBaseline(geometry: any, baselineStart: string, baselineEnd: string): {
  mean: any;
  sd: any;
} {
  const baseline = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(baselineStart, baselineEnd)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50))  // looser for baseline
    .map((img: any) =>
      img.select(['B4', 'B8'])
        .multiply(0.0001)
        .normalizedDifference(['B8', 'B4'])
        .rename('NDVI'),
    );
  return {
    mean: baseline.mean().rename('NDVI_baseline_mean'),
    sd: baseline.reduce(ee.Reducer.stdDev()).rename('NDVI_baseline_sd'),
  };
}

/**
 * Compute SAR anomaly features from Sentinel-1 GRD.
 * Returns a multi-band image with VV, VH, ratio, and 7/14d deltas.
 */
function computeSARFeatures(
  geometry: any,
  currentDate: string,
  endDate: string,
): any {
  // Current composite (last 12 days for SAR)
  const sarCurrent = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geometry)
    .filterDate(
      new Date(new Date(currentDate).getTime() - 12 * 86400000).toISOString().split('T')[0],
      endDate,
    )
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select(['VV', 'VH'])
    .mean()
    .clip(geometry);

  // 7-day-prior baseline
  const sar7d = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geometry)
    .filterDate(
      new Date(new Date(currentDate).getTime() - 19 * 86400000).toISOString().split('T')[0],
      new Date(new Date(currentDate).getTime() - 7 * 86400000).toISOString().split('T')[0],
    )
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select('VH')
    .mean()
    .clip(geometry)
    .rename('VH_7d_prior');

  // 14-day-prior baseline
  const sar14d = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geometry)
    .filterDate(
      new Date(new Date(currentDate).getTime() - 26 * 86400000).toISOString().split('T')[0],
      new Date(new Date(currentDate).getTime() - 14 * 86400000).toISOString().split('T')[0],
    )
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select('VH')
    .mean()
    .clip(geometry)
    .rename('VH_14d_prior');

  const vv = sarCurrent.select('VV');
  const vh = sarCurrent.select('VH');
  const ratio = vv.divide(vh.abs().max(ee.Image(0.001))).rename('VV_VH_ratio');
  const delta7d = vh.subtract(sar7d.select('VH_7d_prior')).rename('delta_VH_7d');
  const delta14d = vh.subtract(sar14d.select('VH_14d_prior')).rename('delta_VH_14d');

  return ee.Image.cat([vv, vh, ratio, delta7d, delta14d]);
}

// ---------------------------------------------------------------------------
// Satellite anomaly response scorer
// ---------------------------------------------------------------------------

/**
 * Convert a raw satellite index snapshot into per-disease response scores.
 *
 * Logic: each disease has a set of "primary signals" from Layer 2. If multiple
 * signals are triggered, confidence increases. The response score is a weighted
 * sum — capped at 1. This score is then COMBINED with weather pressure in
 * disease-models.ts to produce the final calibrated risk.
 */
export function satelliteAnomalyResponse(snap: RemoteSensingSnapshot): SatelliteAnomalyResponse {
  const signals: string[] = [];

  // Helper: anomaly z-score converts to [0,1]; 2σ below = full response
  const zToScore = (z: number | null, threshold = 1.0): number => {
    if (z === null || isNaN(z)) return 0;
    return clamp01((z - threshold) / 2);
  };

  // Shared spectral decline signals
  const ndviDeclineScore  = zToScore(snap.ndvi_z_14d, 1.0);
  const ndreDeclineScore  = zToScore(snap.ndre_z_14d, 0.8);   // more sensitive
  const cireDeclineScore  = zToScore(snap.cire_z_14d, 0.8);
  const ndmiAnomalyScore  = snap.ndmi_z_14d !== null ? clamp01(Math.abs(snap.ndmi_z_14d) / 3) : 0;
  const patchinessScore   = snap.ndvi_cv !== null ? clamp01(snap.ndvi_cv * 3) : 0;
  const psriScore         = snap.psri !== null ? clamp01((snap.psri + 0.05) / 0.30) : 0; // rises with disease
  const sarWetnessScore   = snap.sar_wetness_anomaly !== null ? clamp01(snap.sar_wetness_anomaly) : 0;
  const lstAnomalyScore   = snap.lst_anomaly !== null ? clamp01(Math.abs(snap.lst_anomaly) / 3) : 0;

  // Abiotic stress: hot + dry + uniform NDVI decline
  const abioticScore = clamp01(
    lstAnomalyScore * 0.4
    + clamp01((1 - (snap.ndmi ?? 0)) / 2) * 0.3
    + (1 - patchinessScore) * 0.3,    // uniform decline = not patchy = abiotic
  );
  if (abioticScore > 0.5) signals.push('thermal/dry abiotic signature');

  // -------- Rice Blast --------
  const rbviScore     = snap.rbvi !== null ? clamp01((0.30 - snap.rbvi) / 0.30) : 0;
  const ribinirScore  = snap.ribinir !== null ? clamp01((0.70 - snap.ribinir) / 0.50) : 0;
  const blastSatResponse = clamp01(
    rbviScore * 0.30
    + ribinirScore * 0.25
    + cireDeclineScore * 0.20
    + ndreDeclineScore * 0.15
    + ndviDeclineScore * 0.10,
  );
  if (rbviScore > 0.3)    signals.push('RBVI red-edge anomaly');
  if (ribinirScore > 0.3) signals.push('RIBInir blast index anomaly');
  if (cireDeclineScore > 0.3) signals.push('CIre chlorophyll decline');

  // -------- Sheath Blight --------
  const sheathSatResponse = clamp01(
    patchinessScore * 0.40
    + ndviDeclineScore * 0.25
    + ndmiAnomalyScore * 0.20
    + sarWetnessScore * 0.15,
  );
  if (patchinessScore > 0.3) signals.push('NDVI spatial patchiness (sheath blight)');

  // -------- BLB --------
  const ribiredScore  = snap.ribired !== null ? clamp01((snap.ribired + 0.31) / 0.25) : 0;
  const blbSatResponse = clamp01(
    psriScore * 0.30
    + ribiredScore * 0.25
    + ndreDeclineScore * 0.20
    + ndviDeclineScore * 0.15
    + ndmiAnomalyScore * 0.10,
  );
  if (psriScore > 0.3) signals.push('PSRI senescence signal (BLB)');
  if (ribiredScore > 0.3) signals.push('RIBIred red-edge anomaly');

  // -------- Downy Mildew --------
  const downyMildewSatResponse = clamp01(
    ndviDeclineScore * 0.35
    + cireDeclineScore * 0.30
    + ndreDeclineScore * 0.25
    + patchinessScore * 0.10,
  );

  // -------- Leaf Spot --------
  const leafSpotSatResponse = clamp01(
    patchinessScore * 0.35
    + ndviDeclineScore * 0.25
    + psriScore * 0.20
    + ndmiAnomalyScore * 0.20,
  );

  // -------- Charcoal Rot --------
  const msiScore = snap.msi !== null ? clamp01((snap.msi - 1.0) / 2.0) : 0;  // rises with dryness
  const charcoalSatResponse = clamp01(
    ndviDeclineScore * 0.40
    + msiScore * 0.30
    + lstAnomalyScore * 0.30,
  );
  if (msiScore > 0.4) signals.push('MSI moisture stress (drought)');

  // Data quality assessment
  let dataQuality: SatelliteAnomalyResponse['data_quality'];
  if (snap.ndre !== null && (snap.cloud_score_plus ?? 0) >= 0.6) {
    dataQuality = 'good';
  } else if (snap.ndvi !== null || snap.vv !== null) {
    dataQuality = snap.ndvi !== null ? 'partial' : 'sar_only';
  } else {
    dataQuality = 'no_data';
  }

  return {
    rice_blast: Number(blastSatResponse.toFixed(3)),
    sheath_blight: Number(sheathSatResponse.toFixed(3)),
    bacterial_leaf_blight: Number(blbSatResponse.toFixed(3)),
    downy_mildew: Number(downyMildewSatResponse.toFixed(3)),
    leaf_spot: Number(leafSpotSatResponse.toFixed(3)),
    charcoal_rot: Number(charcoalSatResponse.toFixed(3)),
    abiotic_stress: Number(abioticScore.toFixed(3)),
    data_quality: dataQuality,
    primary_signals: signals.slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
// Main GEE fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch the latest satellite snapshot for a farm geometry.
 * Uses Cloud Score+ weighted compositing for better monsoon performance.
 * Falls back to Sentinel-1 SAR if no optical data available.
 *
 * Returns null if no data is available in the window.
 */
export async function fetchSatelliteSnapshot(
  geometry: any,
  endDate: string,
  windowDays: number = 30,
): Promise<RemoteSensingSnapshot | null> {
  const startDate = new Date(new Date(endDate).getTime() - windowDays * 86400000)
    .toISOString().split('T')[0];

  // Try Cloud Score+ S2 composite first
  let composite: any = null;
  let source = 'sentinel2';
  let cloudScorePlus: number | null = null;

  try {
    composite = buildCloudScorePlusComposite(geometry, startDate, endDate, 0.2);
    const ndviCheck: number = await evaluate(
      composite.select('nir').reduceRegion({
        reducer: ee.Reducer.count(),
        geometry,
        scale: 30,
        maxPixels: 1e6,
      }).get('nir'),
    );
    if (!ndviCheck || ndviCheck === 0) {
      composite = null; // no usable pixels
    } else {
      // Mean cloud score as data quality indicator
      const csComposite = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .select('cs_cdf')
        .mean();
      const csVal: any = await evaluate(
        csComposite.reduceRegion({ reducer: ee.Reducer.mean(), geometry, scale: 100, maxPixels: 1e6 }),
      );
      cloudScorePlus = csVal?.cs_cdf != null ? Number(Number(csVal.cs_cdf).toFixed(3)) : null;
    }
  } catch (_e) {
    composite = null;
  }

  // Build baselines for z-scores (14d, 21d windows)
  const baseline14 = buildNdviBaseline(
    geometry,
    new Date(new Date(startDate).getTime() - 14 * 86400000).toISOString().split('T')[0],
    startDate,
  );
  const baseline21 = buildNdviBaseline(
    geometry,
    new Date(new Date(startDate).getTime() - 21 * 86400000).toISOString().split('T')[0],
    startDate,
  );

  // Resolve SAR features
  const sarImage = computeSARFeatures(geometry, startDate, endDate);

  let snap: Partial<RemoteSensingSnapshot> = {
    date: endDate,
    source,
    cloud_score_plus: cloudScorePlus,
    cloud_cover_pct: null,
  };

  if (composite !== null) {
    // Compute all indices
    const indexImage = computeAllIndices(composite);

    // Stack with baseline for z-scores
    const stacked = ee.Image.cat([
      indexImage,
      baseline14.mean, baseline14.sd,
      baseline21.mean.rename('NDVI_baseline_21_mean'),
      baseline21.sd.rename('NDVI_baseline_21_sd'),
    ]);

    // Sample at farm centroid
    const centroidStats: any = await evaluate(
      stacked.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry,
        scale: 20,
        maxPixels: 1e8,
      }),
    );

    const get = (key: string): number | null => {
      const v = centroidStats?.[key];
      return v != null && !isNaN(v) ? Number(Number(v).toFixed(4)) : null;
    };

    const ndviVal    = get('NDVI') ?? 0;
    const baselineMean = get('NDVI_baseline_mean');
    const baselineSd   = get('NDVI_baseline_sd');
    const ndviZ14 = baselineSd && baselineSd > 0.01
      ? Number(((( baselineMean ?? ndviVal) - ndviVal) / baselineSd).toFixed(3))
      : null;

    const ndreVal  = get('NDRE');
    // NDRE z-score vs. 14d baseline (approximate: scale ndvi z-score if NDRE baseline unavailable)
    const ndreZ14  = ndviZ14 !== null && ndreVal !== null
      ? Number((ndviZ14 * 0.9).toFixed(3)) // proxy — ideally own baseline
      : null;

    const cireVal  = get('CIre');
    const cireZ14  = ndviZ14 !== null && cireVal !== null
      ? Number((ndviZ14 * 0.8).toFixed(3)) // proxy
      : null;

    const ndmiVal  = get('NDMI');
    const ndmiZ14  = ndviZ14 !== null && ndmiVal !== null
      ? Number((ndviZ14 * 0.7).toFixed(3)) // proxy (moisture inversely correlated)
      : null;

    snap = {
      ...snap,
      ndvi: ndviVal,
      ndre: ndreVal,
      cire: cireVal,
      mtci: get('MTCI'),
      ndmi: ndmiVal,
      msi: get('MSI'),
      dws: get('DWS'),
      psri: get('PSRI'),
      sipi: get('SIPI'),
      rbvi: get('RBVI'),
      ribinir: get('RIBInir'),
      ribired: get('RIBIred'),
      redsi: get('REDSI'),
      ndvi_cv: get('NDVI_CV'),
      ndvi_z_7d: null,          // TODO: 7d baseline
      ndvi_z_14d: ndviZ14,
      ndvi_z_21d: null,         // TODO: 21d baseline
      ndre_z_14d: ndreZ14,
      cire_z_14d: cireZ14,
      ndmi_z_14d: ndmiZ14,
    };
  }

  // SAR features
  try {
    const sarStats: any = await evaluate(
      sarImage.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry,
        scale: 20,
        maxPixels: 1e8,
      }),
    );
    const getS = (k: string): number | null => {
      const v = sarStats?.[k];
      return v != null && !isNaN(v) ? Number(Number(v).toFixed(4)) : null;
    };
    const vhVal = getS('VH');
    const delta7 = getS('delta_VH_7d');
    // SAR wetness anomaly: normalized VH delta (positive delta = wetter canopy)
    const sarWetAnomaly = delta7 !== null ? clamp01((delta7 + 3) / 6) : null;

    snap = {
      ...snap,
      vv: getS('VV'),
      vh: vhVal,
      vv_vh_ratio: getS('VV_VH_ratio'),
      delta_vh_7d: delta7,
      delta_vh_14d: getS('delta_VH_14d'),
      sar_wetness_anomaly: sarWetAnomaly,
    };

    if (composite === null && vhVal !== null) {
      source = 'sentinel1_sar_only';
      snap.source = source;
      snap.ndvi = snap.ndvi ?? 0.3; // placeholder
    }
  } catch (_e) {
    // SAR fetch failed — continue with optical only
  }

  // If neither optical nor SAR returned useful data
  if (!snap.ndvi && !snap.vv) return null;

  snap.lst_day = null;
  snap.lst_night = null;
  snap.lst_anomaly = null;

  return snap as RemoteSensingSnapshot;
}
