/**
 * Per-disease satellite risk models for rice and millets in Maharashtra.
 *
 * Each model is a weighted combination of:
 *   - Spectral anomaly signals (RBVI, CIre, MTCI, DWS, NDVI_CV, NDMI, NDVI)
 *   - Weather epidemiological risk (temperature window, leaf wetness hours, RH)
 *   - Crop growth-stage susceptibility multiplier (IRRI EPIRICE model principles)
 *
 * Output: score in [0, 1] — 0 = no risk, 1 = maximum satellite-indicated risk.
 * These are TRIAGE signals, not confirmed diagnoses. Field scouting is required.
 */

export type DiseaseName =
  | 'rice_blast'
  | 'sheath_blight'
  | 'bacterial_leaf_blight'
  | 'downy_mildew'
  | 'leaf_spot'
  | 'charcoal_rot';

export type GrowthStage =
  | 'seedling'
  | 'tillering'
  | 'panicle_initiation'
  | 'heading'
  | 'grain_fill'
  | 'maturity';

/** Spectral features derived from a single grid cell or field composite */
export interface SpectralFeatures {
  ndvi: number;           // [-1, 1]  — vegetation vigour
  ndvi_cv: number;        // [0, ∞]   — spatial coefficient of variation of NDVI (30m window)
  rbvi: number;           // [0, 1]   — Rice Blast Vegetation Index (MDPI Agronomy 2024)
  cire: number;           // [0, ∞]   — Red-Edge Chlorophyll Index
  mtci: number;           // [-∞, ∞]  — MERIS Terrestrial Chlorophyll Index
  dws: number;            // [-1, 1]  — Disease Water Stress composite
  moisture: number;       // [0, 100] — NDMI-derived volumetric moisture %
  ndvi_baseline: number;  // [−1, 1]  — 14-day historical mean NDVI for anomaly detection
  ribinir?: number;       // [0, 2]   — RIBInir (B7−B11)/(B4+B11), fixed S2 approximation
  ribired?: number;       // [−1, 1]  — RIBIred (B5−B8A)/(B4+B8A), raises with disease
  redsi?: number;         // [−50,50] — REDSI red-edge disease stress (cross-check)
  psri?: number;          // [−1, 1]  — PSRI senescence index (Merzlyak et al. 1999)
  thermal_stress?: number;// [0, 1]   — thermal water-stress proxy (Landsat/MODIS LST)
}

/** Weather epidemiological inputs (sourced from Open-Meteo 7-day lookback) */
export interface WeatherFeatures {
  hours_temp_20_28c: number;   // hours in 20-28°C band (blast sporulation window)
  leaf_wetness_hours: number;  // estimated leaf-wetness hours (RH > 80% proxy)
  max_rh_pct: number;          // max relative humidity (%)
  total_rain_mm: number;       // total rainfall last 7 days
  mean_temp_c: number;         // mean temperature °C
}

export interface DiseaseRiskScore {
  disease: DiseaseName;
  score: number;              // [0, 1]
  severity: 'low' | 'medium' | 'high';
  contributing_signals: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Growth-stage susceptibility tables
// ---------------------------------------------------------------------------

/** Rice blast susceptibility by growth stage (IRRI EPIRICE model principles) */
const RICE_BLAST_STAGE: Record<GrowthStage, number> = {
  seedling:           0.70,
  tillering:          1.00,  // peak susceptibility
  panicle_initiation: 0.90,
  heading:            0.85,  // neck blast window
  grain_fill:         0.40,
  maturity:           0.20,
};

/** Sheath blight susceptibility — peaks at tillering/panicle */
const SHEATH_BLIGHT_STAGE: Record<GrowthStage, number> = {
  seedling:           0.40,
  tillering:          1.00,
  panicle_initiation: 0.90,
  heading:            0.75,
  grain_fill:         0.50,
  maturity:           0.20,
};

/** BLB susceptibility — seedling and tillering phases */
const BLB_STAGE: Record<GrowthStage, number> = {
  seedling:           0.90,
  tillering:          0.85,
  panicle_initiation: 0.60,
  heading:            0.50,
  grain_fill:         0.30,
  maturity:           0.10,
};

/** Millet downy mildew — highest at early vegetative/seedling */
const DOWNY_MILDEW_STAGE: Record<GrowthStage, number> = {
  seedling:           0.90,
  tillering:          0.70,
  panicle_initiation: 0.50,
  heading:            0.30,
  grain_fill:         0.20,
  maturity:           0.10,
};

/** Millet leaf spot — peaks at tillering/panicle */
const LEAF_SPOT_STAGE: Record<GrowthStage, number> = {
  seedling:           0.40,
  tillering:          0.85,
  panicle_initiation: 1.00,
  heading:            0.90,
  grain_fill:         0.60,
  maturity:           0.20,
};

/** Charcoal rot (rabi jowar) — late-season dry stress disease */
const CHARCOAL_ROT_STAGE: Record<GrowthStage, number> = {
  seedling:           0.10,
  tillering:          0.20,
  panicle_initiation: 0.50,
  heading:            0.80,
  grain_fill:         1.00,
  maturity:           0.70,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function severity(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.65) return 'high';
  if (score >= 0.40) return 'medium';
  return 'low';
}

function confidence(signals: number): 'low' | 'medium' | 'high' {
  if (signals >= 4) return 'high';
  if (signals >= 2) return 'medium';
  return 'low';
}

function ndviAnomaly(ndvi: number, baseline: number): number {
  if (baseline <= 0.05) return 0;                          // bare soil — ignore
  const decline = (baseline - ndvi) / baseline;
  return clamp01(decline * 2);                            // 50 % decline → score = 1
}

/** RBVI anomaly: low (< 0.15) or negative suggests blast-related chlorophyll loss */
function rbviAnomaly(rbvi: number): number {
  return clamp01((0.30 - rbvi) / 0.30);
}

/** CIre anomaly: values < 1.5 can indicate chlorophyll drawdown */
function cireAnomaly(cire: number): number {
  return clamp01((2.5 - cire) / 2.5);
}

/**
 * RIBInir anomaly (Tian et al. 2023, RSE — B11-fixed S2 approximation).
 * Formula: (B7−B11)/(B4+B11). B11 (SWIR1, 1610nm) correctly approximates ρ1102;
 * the previous B8A (865nm, NIR plateau) was in the wrong spectral region.
 * Healthy paddy: NIR > SWIR1 → index ≈ +0.8–1.3. Blast drops it toward 0 as
 * mesophyll damage reduces B7 and leaf desiccation raises B11. Absent → 0.
 */
function ribinirAnomaly(ribinir: number | undefined): number {
  if (ribinir === undefined || Number.isNaN(ribinir)) return 0;
  return clamp01((0.70 - ribinir) / 0.50);  // 0 at ≥0.70 (healthy); 1 at ≤0.20 (diseased)
}

/**
 * RIBIred anomaly — (B5−B8A)/(B4+B8A). Observed healthy-paddy baseline ≈ −0.31.
 * Disease RAISES the index (less negative) as chlorophyll loss increases B5 (705nm)
 * reflectance. Direction fixed: anomaly fires when the index rises above baseline.
 * RBBRI/RBBDI are HyMap-only and cannot be reproduced on 10-band S2; PSRI
 * (psriAnomaly) serves as the BLB senescence signal instead.
 */
function ribiredAnomaly(ribired: number | undefined): number {
  if (ribired === undefined || Number.isNaN(ribired)) return 0;
  return clamp01((ribired + 0.31) / 0.25);  // 0 at ≤−0.31 (healthy); 1 at ≥−0.06 (diseased)
}

/**
 * PSRI anomaly (Plant Senescence Reflectance Index — Merzlyak et al. 1999).
 * PSRI = (B4 − B3) / B7. Healthy canopy: green > red → PSRI ≈ −0.05 to −0.15.
 * Disease / senescence elevates carotenoid:chlorophyll ratio → PSRI rises toward 0+.
 * Primary BLB senescence signal on S2, replacing HyMap-only RBBRI/RBBDI. Absent → 0.
 */
function psriAnomaly(psri: number | undefined): number {
  if (psri === undefined || Number.isNaN(psri)) return 0;
  return clamp01((psri - 0.05) / 0.25);  // 0 at ≤0.05 (healthy); 1 at ≥0.30 (diseased)
}

/**
 * REDSI anomaly (Zheng et al. 2018). Disease shrinks the red-edge triangle area,
 * lowering REDSI. Low-weight cross-check only; PROVISIONAL center. Absent → 0.
 */
function redsiAnomaly(redsi: number | undefined): number {
  if (redsi === undefined || Number.isNaN(redsi)) return 0;
  return clamp01((8 - redsi) / 16);
}

/**
 * Thermal water-stress gate (Landsat/MODIS LST). Returns a multiplier in
 * [floor, 1] that SUPPRESSES disease scores when a cell shows the abiotic
 * water-stress signature (hot + dry canopy + no spatial patchiness) rather than
 * a disease signature. Thermal never RAISES a disease score (per research doc).
 * Also reports whether the cell looks likely-abiotic.
 */
export function thermalConfounder(spec: SpectralFeatures): { mult: number; likely_abiotic: boolean } {
  const thermal = spec.thermal_stress;
  if (thermal === undefined || Number.isNaN(thermal)) return { mult: 1, likely_abiotic: false };
  const dryCanopy   = clamp01((20 - spec.moisture) / 20);   // low moisture
  const uniform     = clamp01((0.20 - spec.ndvi_cv) / 0.20); // low patchiness = not disease-like
  // Water-stress signature: hot AND dry AND spatially uniform decline.
  const waterStress = clamp01(thermal * 0.5 + dryCanopy * 0.3 + uniform * 0.2);
  const likely_abiotic = waterStress >= 0.6;
  // Suppress down to a 0.55 floor at full water-stress signature.
  const mult = 1 - waterStress * 0.45;
  return { mult, likely_abiotic };
}

/**
 * Weather blast risk (Yoshino model approximation):
 * Optimal blast: 20–28 °C with > 10 h leaf wetness per day
 */
function blastWeatherRisk(w: WeatherFeatures): number {
  const tempScore    = clamp01(w.hours_temp_20_28c / 72);   // 72 h in window = max
  const wetnessScore = clamp01(w.leaf_wetness_hours / 60);  // 60 h in 7 days = max
  const rhScore      = clamp01((w.max_rh_pct - 70) / 30);
  return (tempScore * 0.45) + (wetnessScore * 0.35) + (rhScore * 0.20);
}

/** Wet-canopy risk for sheath blight and BLB */
function wetCanopyRisk(w: WeatherFeatures): number {
  const rainScore    = clamp01(w.total_rain_mm / 80);
  const wetnessScore = clamp01(w.leaf_wetness_hours / 50);
  return (rainScore * 0.45) + (wetnessScore * 0.55);
}

/** Millet downy mildew weather: cool + moist early season */
function downyMildewWeatherRisk(w: WeatherFeatures): number {
  const coolScore    = clamp01((28 - w.mean_temp_c) / 10);  // cooler = higher risk
  const wetnessScore = clamp01(w.leaf_wetness_hours / 50);
  return (coolScore * 0.40) + (wetnessScore * 0.60);
}

/** Dry stress risk for leaf spot / charcoal rot */
function dryStressRisk(spec: SpectralFeatures, w: WeatherFeatures): number {
  const lowMoisture = clamp01((20 - spec.moisture) / 20);
  const dryWeather  = clamp01(Math.max(0, 20 - w.total_rain_mm) / 20);
  return (lowMoisture * 0.55) + (dryWeather * 0.45);
}

// ---------------------------------------------------------------------------
// Per-disease risk models
// ---------------------------------------------------------------------------

/**
 * Rice Blast Risk Model
 * Based on: RBVI (MDPI Agronomy 2024), CIre, MTCI, NDVI anomaly, blast weather model
 * Weights tuned to: spectral anomaly (0.45), NDVI decline (0.20), moisture (0.15),
 *                   weather (0.15), stage (0.05 applied as multiplier)
 */
export function riceBlastRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'tillering',
): DiseaseRiskScore {
  // Cross-validate the bespoke RBVI against the published RIBInir blast index
  // rather than trusting either alone, with CIre/MTCI as chlorophyll support.
  const spectralAnomaly = (rbviAnomaly(spec.rbvi) * 0.35)
    + (ribinirAnomaly(spec.ribinir) * 0.30)
    + (cireAnomaly(spec.cire) * 0.20)
    + (clamp01((3.0 - spec.mtci) / 3.0) * 0.15);

  const ndviDecline   = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const moistureScore = clamp01((spec.dws + 1) / 2);          // DWS: remap [-1,1] → [0,1]
  const weatherScore  = blastWeatherRisk(weather);
  const redsiCheck    = redsiAnomaly(spec.redsi);             // low-weight cross-check
  const stageMult     = RICE_BLAST_STAGE[stage];

  const rawScore = (
    spectralAnomaly * 0.42
    + ndviDecline   * 0.18
    + moistureScore * 0.15
    + weatherScore  * 0.15
    + redsiCheck    * 0.05
    + stageMult     * 0.05
  );

  // Thermal gate: suppress (never raise) when the cell looks abiotic water-stress.
  const { mult: thermalMult } = thermalConfounder(spec);
  const score = clamp01(rawScore * stageMult * thermalMult);

  const signals: string[] = [];
  if (rbviAnomaly(spec.rbvi) > 0.30)      signals.push('RBVI red-edge anomaly');
  if (ribinirAnomaly(spec.ribinir) > 0.30) signals.push('RIBInir blast index anomaly');
  if (cireAnomaly(spec.cire) > 0.30)      signals.push('CIre chlorophyll decline');
  if (ndviDecline > 0.25)                 signals.push('NDVI decline vs baseline');
  if (weatherScore > 0.40)                signals.push('blast-conducive weather');
  if (moistureScore > 0.55)               signals.push('wet canopy');

  return {
    disease: 'rice_blast',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

/**
 * Sheath Blight Risk Model
 * Key signal: spatial heterogeneity of NDVI (cv) + wet canopy + warm temperature
 */
export function sheathBlightRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'tillering',
): DiseaseRiskScore {
  const heterogeneity  = clamp01(spec.ndvi_cv * 3);           // CV > 0.33 → score = 1
  const ndviDecline    = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const wetScore       = wetCanopyRisk(weather);
  const warmScore      = clamp01((weather.mean_temp_c - 20) / 12); // 20–32°C optimal
  const stageMult      = SHEATH_BLIGHT_STAGE[stage];

  const rawScore = (
    heterogeneity * 0.35
    + ndviDecline * 0.25
    + wetScore    * 0.25
    + warmScore   * 0.15
  );

  const { mult: thermalMult } = thermalConfounder(spec);
  const score = clamp01(rawScore * stageMult * thermalMult);

  const signals: string[] = [];
  if (heterogeneity > 0.30)    signals.push('NDVI spatial patchiness');
  if (ndviDecline > 0.20)      signals.push('NDVI decline');
  if (wetScore > 0.40)         signals.push('wet canopy / rainfall');
  if (warmScore > 0.50)        signals.push('warm temperature window');

  return {
    disease: 'sheath_blight',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

/**
 * Bacterial Leaf Blight (BLB) Risk Model
 * Key signal: BLB involves water-soaked lesions → NDWI/DWS spike + warm wet weather
 */
export function blbRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'tillering',
): DiseaseRiskScore {
  const waterSignal  = clamp01((spec.dws + 1) / 2);
  const redEdgeProxy = ribiredAnomaly(spec.ribired);
  const psriSignal   = psriAnomaly(spec.psri);    // BLB senescence: replaces RBBRI/RBBDI
  const ndviDecline  = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const wetScore     = wetCanopyRisk(weather);
  const stormScore   = clamp01(weather.total_rain_mm / 60);
  const stageMult    = BLB_STAGE[stage];

  const rawScore = (
    waterSignal    * 0.25
    + redEdgeProxy * 0.10
    + psriSignal   * 0.10
    + ndviDecline  * 0.20
    + wetScore     * 0.25
    + stormScore   * 0.10
  );

  const { mult: thermalMult } = thermalConfounder(spec);
  const score = clamp01(rawScore * stageMult * thermalMult);

  const signals: string[] = [];
  if (waterSignal > 0.50)    signals.push('water-stress index elevated');
  if (redEdgeProxy > 0.30)   signals.push('RIBIred red-edge anomaly');
  if (psriSignal > 0.30)     signals.push('PSRI senescence signal');
  if (ndviDecline > 0.20)    signals.push('NDVI decline');
  if (stormScore > 0.40)     signals.push('high rainfall event');
  if (wetScore > 0.40)       signals.push('wet canopy');

  return {
    disease: 'bacterial_leaf_blight',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

/**
 * Millet Downy Mildew Risk Model
 * Key signal: seedling stage + cool moist weather + early NDVI decline
 * Source: ICAR-IIMR, MPKV Rahuri
 */
export function downyMildewRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'seedling',
): DiseaseRiskScore {
  const ndviDecline    = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const moistureSignal = clamp01((spec.moisture - 15) / 60);
  const weatherScore   = downyMildewWeatherRisk(weather);
  const cireSignal     = cireAnomaly(spec.cire);
  const stageMult      = DOWNY_MILDEW_STAGE[stage];

  const rawScore = (
    ndviDecline    * 0.30
    + cireSignal   * 0.25
    + weatherScore * 0.30
    + moistureSignal * 0.15
  );

  const { mult: thermalMult } = thermalConfounder(spec);
  const score = clamp01(rawScore * stageMult * thermalMult);

  const signals: string[] = [];
  if (ndviDecline > 0.20)     signals.push('NDVI early-season decline');
  if (weatherScore > 0.40)    signals.push('cool moist weather (downy mildew window)');
  if (cireSignal > 0.30)      signals.push('CIre chlorophyll drop');
  if (moistureSignal > 0.40)  signals.push('canopy moisture elevated');

  return {
    disease: 'downy_mildew',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

/**
 * Millet Leaf Spot Risk Model
 * Key signal: mid-season moisture + NDVI patchiness
 * Covers: grey leaf spot, anthracnose, turcicum blight (jowar/bajra)
 */
export function leafSpotRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'panicle_initiation',
): DiseaseRiskScore {
  const heterogeneity  = clamp01(spec.ndvi_cv * 2.5);
  const ndviDecline    = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const wetScore       = wetCanopyRisk(weather);
  const dwsSignal      = clamp01((spec.dws + 1) / 2);
  const redsiCheck     = redsiAnomaly(spec.redsi);   // red-edge foliar cross-check
  const stageMult      = LEAF_SPOT_STAGE[stage];

  const rawScore = (
    heterogeneity * 0.30
    + ndviDecline * 0.25
    + wetScore    * 0.25
    + dwsSignal   * 0.15
    + redsiCheck  * 0.05
  );

  const { mult: thermalMult } = thermalConfounder(spec);
  const score = clamp01(rawScore * stageMult * thermalMult);

  const signals: string[] = [];
  if (heterogeneity > 0.25)  signals.push('NDVI spatial patchiness');
  if (ndviDecline > 0.20)    signals.push('NDVI decline');
  if (redsiCheck > 0.30)     signals.push('REDSI red-edge stress');
  if (wetScore > 0.35)       signals.push('wet canopy / rainfall');

  return {
    disease: 'leaf_spot',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

/**
 * Charcoal Rot Risk Model (rabi jowar, Macrophomina phaseolina)
 * Key signal: late-season dry stress + K deficiency proxy + SAVI anomaly
 * Source: MPKV Rahuri rabi jowar package
 */
export function charcoalRotRisk(
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage = 'grain_fill',
): DiseaseRiskScore {
  const dryStress  = dryStressRisk(spec, weather);
  const ndviDecline = ndviAnomaly(spec.ndvi, spec.ndvi_baseline);
  const stageMult  = CHARCOAL_ROT_STAGE[stage];

  const rawScore = (
    dryStress   * 0.55
    + ndviDecline * 0.45
  );

  const score = clamp01(rawScore * stageMult);

  const signals: string[] = [];
  if (dryStress > 0.40)   signals.push('dry stress / low moisture');
  if (ndviDecline > 0.20) signals.push('late-season NDVI decline');

  return {
    disease: 'charcoal_rot',
    score,
    severity: severity(score),
    contributing_signals: signals,
    confidence: confidence(signals.length),
  };
}

// ---------------------------------------------------------------------------
// Dispatch: run applicable models for a crop
// ---------------------------------------------------------------------------

export interface CropDiseaseRisks {
  applicable_diseases: DiseaseRiskScore[];
  composite_risk: number;      // max score across applicable diseases
  top_disease: DiseaseName | null;
  scout_priority: 'low' | 'medium' | 'high';
}

export function scoreCropDiseases(
  crop: 'rice' | 'millet',
  season: 'kharif' | 'rabi',
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  stage: GrowthStage,
): CropDiseaseRisks {
  const scores: DiseaseRiskScore[] = [];

  if (crop === 'rice') {
    scores.push(riceBlastRisk(spec, weather, stage));
    scores.push(sheathBlightRisk(spec, weather, stage));
    scores.push(blbRisk(spec, weather, stage));
  } else {
    // millet (jowar / bajra / ragi)
    scores.push(downyMildewRisk(spec, weather, stage));
    scores.push(leafSpotRisk(spec, weather, stage));
    if (season === 'rabi') {
      scores.push(charcoalRotRisk(spec, weather, stage));
    }
  }

  const composite = Math.max(...scores.map((s) => s.score));
  const top = scores.sort((a, b) => b.score - a.score)[0];

  return {
    applicable_diseases: scores.sort((a, b) => b.score - a.score),
    composite_risk: composite,
    top_disease: top?.score > 0.10 ? top.disease : null,
    scout_priority: severity(composite),
  };
}

// ---------------------------------------------------------------------------
// ML model hook (scaffold — no trained model yet)
// ---------------------------------------------------------------------------

/**
 * JSON-coefficient schema a Colab-trained model exports to (see
 * ml/disease_feature_export.ipynb). Kept intentionally simple so inference runs
 * in pure TypeScript inside this Deno edge function — no Python runtime, no ONNX.
 *
 * `logistic`: per-disease linear-logistic coefficients over the named features.
 *   score = sigmoid(bias + Σ coef[f] · feature[f])
 * Extend with a tree variant later if a random forest outperforms.
 */
export interface DiseaseModelJSON {
  version: string;
  trained_at: string;
  type: 'logistic';
  features: string[];                              // ordered feature names
  models: Partial<Record<DiseaseName, { bias: number; coef: number[] }>>;
}

/** Feature vector handed to a trained model (mirrors the exported Colab schema). */
function featureVector(spec: SpectralFeatures, weather: WeatherFeatures, features: string[]): number[] {
  const lookup: Record<string, number> = {
    ndvi: spec.ndvi,
    ndvi_cv: spec.ndvi_cv,
    rbvi: spec.rbvi,
    cire: spec.cire,
    mtci: spec.mtci,
    dws: spec.dws,
    moisture: spec.moisture,
    ndvi_baseline: spec.ndvi_baseline,
    ribinir: spec.ribinir ?? 0,
    ribired: spec.ribired ?? 0,
    redsi: spec.redsi ?? 0,
    psri: spec.psri ?? 0,
    thermal_stress: spec.thermal_stress ?? 0,
    hours_temp_20_28c: weather.hours_temp_20_28c,
    leaf_wetness_hours: weather.leaf_wetness_hours,
    max_rh_pct: weather.max_rh_pct,
    total_rain_mm: weather.total_rain_mm,
    mean_temp_c: weather.mean_temp_c,
  };
  return features.map((f) => lookup[f] ?? 0);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Score a disease with a trained JSON model if one is supplied, else return null
 * so callers fall back to the hand-tuned heuristic models. This is the drop-in
 * seam: once labels accrue (from farmer_photo_submissions.diagnosis_result) and a
 * model is trained in Colab, load the JSON and pass it here — no other change.
 */
export function mlDiseaseScore(
  disease: DiseaseName,
  spec: SpectralFeatures,
  weather: WeatherFeatures,
  model: DiseaseModelJSON | null,
): number | null {
  if (!model || model.type !== 'logistic') return null;
  const m = model.models[disease];
  if (!m) return null;
  const x = featureVector(spec, weather, model.features);
  const z = m.bias + m.coef.reduce((s, c, i) => s + c * (x[i] ?? 0), 0);
  return clamp01(sigmoid(z));
}

/** Convert a text growth-stage string (from frontend) to GrowthStage enum */
export function parseGrowthStage(input: string | undefined): GrowthStage {
  if (!input) return 'tillering';
  const lower = input.toLowerCase();
  if (lower.includes('seedling') || lower.includes('transplant')) return 'seedling';
  if (lower.includes('tiller')) return 'tillering';
  if (lower.includes('panicle') || lower.includes('pi')) return 'panicle_initiation';
  if (lower.includes('head') || lower.includes('flower') || lower.includes('silk')) return 'heading';
  if (lower.includes('grain') || lower.includes('dough') || lower.includes('dent') || lower.includes('milk')) return 'grain_fill';
  if (lower.includes('matur') || lower.includes('harvest')) return 'maturity';
  return 'tillering';
}
