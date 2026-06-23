/**
 * Diagnostic Service
 * Analyzes satellite data to detect problem areas on farms.
 * Supports threshold-based and trend-based detection.
 */

import { buildApiUrl, getSupabaseFunctionHeaders } from './api';
import { API_ENDPOINTS } from '@/constants';
import * as turf from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';
import { GrowthStage, deriveGrowthStage, parseCropFamily, STAGE_LABELS } from './phenology';

// Types
export type DiagnosticIndex = 'nitrogen' | 'phosphorus' | 'potassium' | 'moisture' | 'ndvi' | 'ph' | 'salinity';
export type DiagnosticConfidence = 'high' | 'medium' | 'low';
export type DiagnosticTrendUnit = 'percent' | 'points';
export type DiagnosticCropProfile = 'rice' | 'millet' | 'generic';
export type ThresholdDirection = 'low' | 'high';
type FarmGeometry = Polygon | MultiPolygon;

export interface SamplePoint {
  lat: number;
  lng: number;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  moisture: number | null;
  ndvi: number | null;
  ph: number | null;
  salinity: number | null;
}

export interface CellProblem {
  index: DiagnosticIndex;
  type: 'threshold' | 'trend' | 'both';
  currentValue: number;
  previousValue?: number;
  threshold: number;
  direction?: ThresholdDirection;
  changePercent?: number;
  changeUnit?: DiagnosticTrendUnit;
  confidence?: DiagnosticConfidence;
  severityScore?: number;
  message: string;
  urgent: boolean;
}

export interface GridCell {
  id: string;
  bounds: [[number, number], [number, number]]; // [[lat, lng], [lat, lng]]
  center: [number, number]; // [lat, lng]
  problems: CellProblem[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

export interface ProblemSummary {
  index: DiagnosticIndex;
  type: 'threshold' | 'trend' | 'both';
  cellCount: number;
  avgValue?: number;
  avgDecline?: number;
  avgDeclineUnit?: DiagnosticTrendUnit;
  confidence?: DiagnosticConfidence;
  color: string;
  label: string;
}

export interface AdvisoryIndexData {
  index: DiagnosticIndex;
  value: number;
  confidence: DiagnosticConfidence;
  label: string;
  color: string;
}

export interface DiagnosticResult {
  cells: GridCell[];
  problems: ProblemSummary[];
  /** Low-confidence / advisory-only indices (P, K, pH, salinity). Not flagged as problems. */
  advisory: AdvisoryIndexData[];
  /** True when cloud cover >60% or <2 clear observations suppressed flagging. */
  lowDataQuality: boolean;
  /** Derived growth stage from sowing date / phenology engine. */
  growthStage?: GrowthStage;
  /** Human-readable stage label. */
  growthStageName?: string;
  /** Sowing date used for threshold derivation (ISO). */
  sowingDate?: string;
  analysisDate: string;
  imagesAnalyzed: number;
  cloudCover?: number;
  history?: Record<DiagnosticIndex, TimeSeriesDataPoint[]>;
  nutrientModel?: {
    version: string;
    unit: string;
    confidenceByIndex?: Partial<Record<DiagnosticIndex, DiagnosticConfidence>>;
    references?: string[];
  };
  farmStats: {
    totalCells: number;
    problemCells: number;
    healthyCells: number;
    overlapCells: number;
  };
  /**
   * Composite health score 0–100. Weighted average of reliable flagging indices
   * (N, NDVI, moisture) normalised against stage-appropriate thresholds.
   * More meaningful than binary healthyCells/totalCells.
   */
  compositeHealthScore?: number;
}

export interface DiagnosticRasterResult extends DiagnosticResult {
  rasterUrls: Record<DiagnosticIndex, string>;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  cached?: boolean;
  expiresAt?: string;
}

export interface TimeSeriesDataPoint {
  date: string;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  cloudCover?: number;
}

interface TimeSeriesWindow {
  startDate?: string;
  endDate?: string;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  cloudCover?: number;
}

interface AgriculturalIndexResponse {
  data?: {
    windows?: TimeSeriesWindow[];
  };
  mean_value?: number;
  min_value?: number;
  max_value?: number;
  std_dev?: number;
  cloudCover?: number;
}

// Configuration
const DIAGNOSTIC_INDICES: DiagnosticIndex[] = ['nitrogen', 'phosphorus', 'potassium', 'moisture', 'ndvi', 'ph', 'salinity'];
const NPK_INDICES = new Set<DiagnosticIndex>(['nitrogen', 'phosphorus', 'potassium']);
const LOW_STRESS_INDICES = new Set<DiagnosticIndex>(['nitrogen', 'phosphorus', 'potassium', 'moisture', 'ndvi']);

// Indices that may raise a flagged problem (red cell / "detected issue").
// Published evidence: only Nitrogen retrieves reliably from satellite (red-edge,
// R²≈0.74–0.77); Phosphorus/Potassium are weak proxies and pH/salinity are
// low-confidence — these are surfaced as advisory context, never as flagged issues.
const FLAGGING_INDICES = new Set<DiagnosticIndex>(['nitrogen', 'ndvi', 'moisture']);
const ADVISORY_INDICES = new Set<DiagnosticIndex>(['phosphorus', 'potassium', 'ph', 'salinity']);

export function isAdvisoryIndex(index: DiagnosticIndex): boolean {
  return ADVISORY_INDICES.has(index);
}

interface IndexAnalysis {
  threshold: boolean;
  trend: boolean;
  value: number;
  change: number;
  changeUnit: DiagnosticTrendUnit;
  confidence: DiagnosticConfidence;
}

interface DiagnosticThreshold {
  low?: number;
  warning?: number;
  high?: number;
  warningHigh?: number;
}

type DiagnosticThresholds = Record<DiagnosticIndex, DiagnosticThreshold>;

// ---------------------------------------------------------------------------
// Stage × crop thresholds
// Replaces calendar-month seasons. Thresholds key to BBCH growth stage so a
// just-sown / bare-soil field is not penalised with peak-canopy expectations.
//
// NDVI (MSAVI2) ranges: pre-emergence bare soil ≈ 0–0.05; seedling ≈ 0.05–0.12;
//   tillering ≈ 0.12–0.35; heading/grain-fill ≈ 0.35–0.60+.
// Nitrogen (0-100 satellite sufficiency proxy): meaningful only once canopy is
//   established (≥ seedling); pre-emergence threshold set near 0 to suppress.
// Moisture: critical threshold rises with crop water demand; zero-indexed post-clamping.
// pH / salinity: unchanged across stages (soil property).
// ---------------------------------------------------------------------------
type StageThresholds = Record<GrowthStage, DiagnosticThresholds>;

const basePhSalinity: Pick<DiagnosticThresholds, 'ph' | 'salinity'> = {
  ph: { low: 5.5, warning: 6.0, high: 8.0, warningHigh: 7.6 },
  salinity: { high: 4.0, warningHigh: 3.0 },
};

const STAGE_THRESHOLDS: Record<DiagnosticCropProfile, StageThresholds> = {
  rice: {
    pre_emergence: {
      nitrogen:   { low: 0,  warning: 10 },  // no canopy — suppress N flagging
      phosphorus: { low: 0,  warning: 10 },
      potassium:  { low: 0,  warning: 10 },
      moisture:   { low: 2,  warning: 5  },   // pre-soak / puddle check
      ndvi:       { low: 0,  warning: 0.03 }, // bare soil expected
      ...basePhSalinity,
    },
    seedling: {
      nitrogen:   { low: 25, warning: 40 },
      phosphorus: { low: 20, warning: 35 },
      potassium:  { low: 20, warning: 38 },
      moisture:   { low: 5,  warning: 10 },
      ndvi:       { low: 0.04, warning: 0.08 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
    tillering: {
      nitrogen:   { low: 40, warning: 56 },
      phosphorus: { low: 30, warning: 45 },
      potassium:  { low: 35, warning: 50 },
      moisture:   { low: 8,  warning: 13 },
      ndvi:       { low: 0.12, warning: 0.20 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
    panicle_initiation: {
      nitrogen:   { low: 45, warning: 62 },
      phosphorus: { low: 32, warning: 48 },
      potassium:  { low: 38, warning: 55 },
      moisture:   { low: 10, warning: 15 },
      ndvi:       { low: 0.28, warning: 0.38 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
    heading: {
      nitrogen:   { low: 42, warning: 58 },
      phosphorus: { low: 28, warning: 42 },
      potassium:  { low: 35, warning: 52 },
      moisture:   { low: 9,  warning: 14 },
      ndvi:       { low: 0.32, warning: 0.42 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
    grain_fill: {
      nitrogen:   { low: 35, warning: 50 },
      phosphorus: { low: 25, warning: 40 },
      potassium:  { low: 30, warning: 48 },
      moisture:   { low: 7,  warning: 12 },
      ndvi:       { low: 0.22, warning: 0.32 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
    maturity: {
      nitrogen:   { low: 20, warning: 35 },  // senescence — suppress
      phosphorus: { low: 15, warning: 30 },
      potassium:  { low: 20, warning: 38 },
      moisture:   { low: 3,  warning: 6  },
      ndvi:       { low: 0.05, warning: 0.12 },
      ...basePhSalinity,
      salinity: { high: 3.0, warningHigh: 2.0 },
    },
  },
  millet: {
    pre_emergence: {
      nitrogen: { low: 0, warning: 10 }, phosphorus: { low: 0, warning: 10 }, potassium: { low: 0, warning: 10 },
      moisture: { low: 1, warning: 4 }, ndvi: { low: 0, warning: 0.03 }, ...basePhSalinity,
    },
    seedling: {
      nitrogen: { low: 20, warning: 36 }, phosphorus: { low: 18, warning: 32 }, potassium: { low: 18, warning: 35 },
      moisture: { low: 3, warning: 7 }, ndvi: { low: 0.04, warning: 0.08 }, ...basePhSalinity,
    },
    tillering: {
      nitrogen: { low: 35, warning: 50 }, phosphorus: { low: 25, warning: 40 }, potassium: { low: 30, warning: 45 },
      moisture: { low: 4, warning: 8 }, ndvi: { low: 0.10, warning: 0.18 }, ...basePhSalinity,
      ph: { low: 5.5, warning: 6.0, high: 8.2, warningHigh: 7.8 },
    },
    panicle_initiation: {
      nitrogen: { low: 38, warning: 54 }, phosphorus: { low: 28, warning: 42 }, potassium: { low: 32, warning: 48 },
      moisture: { low: 5, warning: 9 }, ndvi: { low: 0.22, warning: 0.32 }, ...basePhSalinity,
      ph: { low: 5.5, warning: 6.0, high: 8.2, warningHigh: 7.8 },
    },
    heading: {
      nitrogen: { low: 35, warning: 50 }, phosphorus: { low: 25, warning: 40 }, potassium: { low: 30, warning: 45 },
      moisture: { low: 4, warning: 8 }, ndvi: { low: 0.26, warning: 0.36 }, ...basePhSalinity,
      ph: { low: 5.5, warning: 6.0, high: 8.2, warningHigh: 7.8 },
    },
    grain_fill: {
      nitrogen: { low: 25, warning: 40 }, phosphorus: { low: 20, warning: 35 }, potassium: { low: 25, warning: 40 },
      moisture: { low: 3, warning: 7 }, ndvi: { low: 0.16, warning: 0.26 }, ...basePhSalinity,
      ph: { low: 5.5, warning: 6.0, high: 8.2, warningHigh: 7.8 },
    },
    maturity: {
      nitrogen: { low: 15, warning: 28 }, phosphorus: { low: 12, warning: 25 }, potassium: { low: 15, warning: 30 },
      moisture: { low: 2, warning: 5 }, ndvi: { low: 0.04, warning: 0.10 }, ...basePhSalinity,
      ph: { low: 5.5, warning: 6.0, high: 8.2, warningHigh: 7.8 },
    },
  },
  generic: {
    pre_emergence: {
      nitrogen: { low: 0, warning: 10 }, phosphorus: { low: 0, warning: 10 }, potassium: { low: 0, warning: 10 },
      moisture: { low: 1, warning: 4 }, ndvi: { low: 0, warning: 0.03 }, ...basePhSalinity,
    },
    seedling: {
      nitrogen: { low: 22, warning: 38 }, phosphorus: { low: 18, warning: 32 }, potassium: { low: 18, warning: 35 },
      moisture: { low: 3, warning: 7 }, ndvi: { low: 0.04, warning: 0.08 }, ...basePhSalinity,
    },
    tillering: {
      nitrogen: { low: 38, warning: 52 }, phosphorus: { low: 28, warning: 42 }, potassium: { low: 32, warning: 48 },
      moisture: { low: 5, warning: 10 }, ndvi: { low: 0.10, warning: 0.18 }, ...basePhSalinity,
    },
    panicle_initiation: {
      nitrogen: { low: 42, warning: 58 }, phosphorus: { low: 30, warning: 46 }, potassium: { low: 35, warning: 52 },
      moisture: { low: 7, warning: 12 }, ndvi: { low: 0.24, warning: 0.34 }, ...basePhSalinity,
    },
    heading: {
      nitrogen: { low: 40, warning: 55 }, phosphorus: { low: 28, warning: 42 }, potassium: { low: 32, warning: 50 },
      moisture: { low: 6, warning: 11 }, ndvi: { low: 0.28, warning: 0.38 }, ...basePhSalinity,
    },
    grain_fill: {
      nitrogen: { low: 30, warning: 45 }, phosphorus: { low: 22, warning: 38 }, potassium: { low: 28, warning: 44 },
      moisture: { low: 5, warning: 9 }, ndvi: { low: 0.18, warning: 0.28 }, ...basePhSalinity,
    },
    maturity: {
      nitrogen: { low: 18, warning: 30 }, phosphorus: { low: 12, warning: 25 }, potassium: { low: 16, warning: 32 },
      moisture: { low: 2, warning: 5 }, ndvi: { low: 0.04, warning: 0.10 }, ...basePhSalinity,
    },
  },
};

export function normalizeDiagnosticCrop(value?: string | null): DiagnosticCropProfile {
  const crop = String(value || '').trim().toLowerCase();
  if (['rice', 'paddy', 'paddy rice'].includes(crop)) return 'rice';
  if (['millet', 'jowar', 'sorghum', 'bajra', 'pearl millet', 'ragi', 'finger millet'].includes(crop)) {
    return 'millet';
  }
  return 'generic';
}

/**
 * Get diagnostic thresholds for the current crop growth stage.
 * @param crop       Crop profile
 * @param stage      GrowthStage from phenology engine (falls back to 'tillering' if unknown)
 */
function getStageThresholds(crop: DiagnosticCropProfile = 'generic', stage: GrowthStage = 'tillering'): DiagnosticThresholds {
  return STAGE_THRESHOLDS[crop]?.[stage] ?? STAGE_THRESHOLDS.generic[stage] ?? STAGE_THRESHOLDS.generic.tillering;
}

// Keep the old export name as an alias so callers that pass no stage still work.
// Will be removed once P3 wires sowing_date through the full call chain.
function getSeasonalThresholds(crop: DiagnosticCropProfile = 'generic', stage?: GrowthStage): DiagnosticThresholds {
  return getStageThresholds(crop, stage ?? 'tillering');
}

/**
 * Compute composite health score (0–100) from the flagging indices.
 * Each index is normalised against its stage-appropriate warning threshold:
 *   score_i = clamp(value_i / warning_i, 0, 1) × 100
 * Weighted by confidence: high=1.0, medium=0.7, low=0.4.
 * Returns undefined when no valid data is available.
 */
function computeCompositeHealth(
  indexProblems: Map<DiagnosticIndex, IndexAnalysis>,
  crop: DiagnosticCropProfile,
  stage: GrowthStage,
): number | undefined {
  const thresholds = getStageThresholds(crop, stage);
  const WEIGHTS: Partial<Record<DiagnosticIndex, number>> = {
    ndvi:     1.0,   // most reliable
    nitrogen: 0.85,  // reliable via red-edge
    moisture: 0.70,  // reliable via NDMI
  };
  const CONFIDENCE_WEIGHT: Record<DiagnosticConfidence, number> = { high: 1.0, medium: 0.7, low: 0.4 };

  let numerator = 0;
  let denominator = 0;

  for (const [index, weight] of Object.entries(WEIGHTS) as [DiagnosticIndex, number][]) {
    const analysis = indexProblems.get(index);
    if (!analysis) continue;
    const t = thresholds[index];
    const warningThreshold = t?.warning ?? t?.low;
    if (!warningThreshold || warningThreshold <= 0) continue;

    const normalised = Math.min(1, Math.max(0, analysis.value / warningThreshold));
    const confWeight = CONFIDENCE_WEIGHT[analysis.confidence] ?? 0.7;
    const effectiveWeight = weight * confWeight;
    numerator += normalised * effectiveWeight;
    denominator += effectiveWeight;
  }

  if (denominator === 0) return undefined;
  return Math.round((numerator / denominator) * 100);
}

const TREND_THRESHOLD_PERCENT = -30; // 30% decline triggers trend alert
const NUTRIENT_TREND_THRESHOLD_POINTS = -15;

const INDEX_COLORS: Record<DiagnosticIndex, string> = {
  nitrogen: '#ef4444',    // Red
  phosphorus: '#eab308',  // Yellow
  potassium: '#10b981',   // Emerald
  moisture: '#3b82f6',    // Blue
  ndvi: '#22c55e',        // Green
  ph: '#f59e0b',          // Amber
  salinity: '#dc2626',    // Red
};

const INDEX_LABELS: Record<DiagnosticIndex, string> = {
  nitrogen: 'Nitrogen',
  phosphorus: 'Phosphorus',
  potassium: 'Potassium',
  moisture: 'Soil Moisture',
  ndvi: 'Crop Health',
  ph: 'Soil pH',
  salinity: 'Soil Salinity',
};

const INDEX_CONFIDENCE: Record<DiagnosticIndex, DiagnosticConfidence> = {
  nitrogen: 'high',
  phosphorus: 'low',
  potassium: 'medium',
  moisture: 'medium',
  ndvi: 'high',
  ph: 'low',
  salinity: 'low',
};

const MULTIPLE_PROBLEM_COLOR = '#a855f7'; // Purple
const DIAGNOSTIC_REQUEST_TIMEOUT_MS = 120000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Main entry point - analyze a farm for problems
 * Uses the server's /diagnostics endpoint which fetches multiple satellite images
 * and calculates proper trends from Earth Engine
 */
export async function analyzeFarm(
  farmId: string,
  geometry: FarmGeometry,
  crop: DiagnosticCropProfile = 'generic',
  onProgress?: (progress: number, message: string) => void,
  sowingDate?: string,
): Promise<DiagnosticResult> {
  const startTime = Date.now();
  onProgress?.(0, 'Starting farm analysis...');

  try {
    if (!UUID_PATTERN.test(farmId)) {
      throw new Error(`Diagnostics require a Supabase farm UUID. Received "${farmId}".`);
    }

    // Call the server's diagnostics endpoint which handles Earth Engine analysis
    onProgress?.(10, 'Fetching satellite data from Earth Engine...');

    const polygon = JSON.stringify(geometry);
    const sowingParam = sowingDate ? `&sowing_date=${encodeURIComponent(sowingDate)}` : '';
    const url = buildApiUrl(
      `/diagnostics?polygon=${encodeURIComponent(polygon)}&farm_id=${encodeURIComponent(farmId)}&crop=${encodeURIComponent(crop)}&days=30&cloud=80${sowingParam}`
    );

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DIAGNOSTIC_REQUEST_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          ...getSupabaseFunctionHeaders(),
        },
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Diagnostics API error: ${response.status} - ${errorText}`);
    }

    const serverResult = await response.json();
    onProgress?.(50, 'Processing analysis results...');

    // Create grid cells for the farm
    const cells = createGridCells(geometry, 10);
    onProgress?.(60, `Created ${cells.length} grid cells...`);

    // Map server analysis results to our format
    const problemSummaries: ProblemSummary[] = [];
    const indexProblems: Map<DiagnosticIndex, IndexAnalysis> = new Map();

    // Process server analysis results
    const analysis = serverResult.data?.analysis || serverResult.analysis || {};
    const serverProblems = serverResult.data?.problems || serverResult.problems || [];
    const metadata = serverResult.data?.metadata || serverResult.metadata || {};

    // Extract cell-level sample data from server (for data-driven spot placement)
    const cellData: SamplePoint[] = serverResult.data?.cellData || serverResult.cellData || [];
    console.log(`[diagnosticService] Received ${cellData.length} sample points from server`);

    // Cloud/data-quality gate: if the satellite pass was mostly cloud-covered
    // (>60% cloud fraction) or fewer than 2 clear observations, suppress all flagging
    // for optical-only indices — clamped raw values are meaningless in this case.
    const cloudFraction = metadata.cloudCover ?? metadata.cloud_cover ?? 0;
    const imagesUsed = metadata.imagesAnalyzed ?? metadata.daysAnalyzed ?? 99;
    const lowDataQuality = cloudFraction > 60 || imagesUsed < 2;

    // Extract analysis for each index
    for (const index of DIAGNOSTIC_INDICES) {
      const indexData = analysis[index];
      if (!indexData) continue;

      const threshold = indexData.belowThreshold || false;
      const trend = indexData.trendDetected || false;
      const value = indexData.mean || 0;
      const confidence = getAnalysisConfidence(index, indexData, metadata);
      const changeUnit = getAnalysisTrendUnit(index, indexData);
      const change = normalizeTrendChange(index, indexData.trend || 0, value, changeUnit, indexData);

      indexProblems.set(index, { threshold, trend, value, change, changeUnit, confidence });

      // Only add to summaries if: (a) it's a flagging index and (b) data quality is adequate.
      // Advisory indices (P/K, pH, salinity) are stored in indexProblems for the
      // info panel but never pushed to problemSummaries (the flagged list).
      if (!FLAGGING_INDICES.has(index)) continue;
      if (lowDataQuality) continue;

      if (threshold || trend) {
        problemSummaries.push({
          index,
          type: threshold && trend ? 'both' : (threshold ? 'threshold' : 'trend'),
          cellCount: 0, // Will be updated after cell assignment
          avgValue: value,
          avgDecline: change,
          avgDeclineUnit: changeUnit,
          confidence,
          color: INDEX_COLORS[index],
          label: INDEX_LABELS[index],
        });
      }
    }

    onProgress?.(70, 'Assigning problems to grid cells...');

    if (cellData.length === 0) {
      throw new Error('Diagnostics API returned no cell-level satellite samples; refusing to synthesize map cells.');
    }

    // Derive growth stage from sowing date (falls back to 'tillering' if not provided)
    const cropFamily = parseCropFamily(crop);
    const phenology = sowingDate
      ? deriveGrowthStage(sowingDate, cropFamily)
      : null;
    const currentStage: GrowthStage = phenology?.stage ?? 'tillering';

    assignProblemsToCells(cells, indexProblems, problemSummaries, cellData, crop, currentStage);

    onProgress?.(90, 'Calculating statistics...');

    const problemCells = cells.filter(c => c.problems.length > 0);
    const overlapCells = cells.filter(c => c.problems.length > 1);

    const advisory: AdvisoryIndexData[] = [];
    for (const index of ADVISORY_INDICES) {
      const a = indexProblems.get(index);
      if (a) advisory.push({ index, value: a.value, confidence: a.confidence, label: INDEX_LABELS[index], color: INDEX_COLORS[index] });
    }

    const compositeHealthScore = computeCompositeHealth(indexProblems, crop, currentStage);

    const result: DiagnosticResult = {
      cells,
      problems: problemSummaries,
      advisory,
      lowDataQuality,
      growthStage: currentStage,
      growthStageName: phenology?.stageName ?? STAGE_LABELS[currentStage],
      sowingDate: phenology?.sowingDate,
      compositeHealthScore,
      analysisDate: new Date().toISOString(),
      imagesAnalyzed: metadata.imagesAnalyzed || metadata.daysAnalyzed || 14,
      cloudCover: metadata.cloudCover || metadata.cloud_cover,
      nutrientModel: metadata.nutrientModel,
      farmStats: {
        totalCells: cells.length,
        problemCells: problemCells.length,
        healthyCells: cells.length - problemCells.length,
        overlapCells: overlapCells.length,
      },
    };

    onProgress?.(100, `Analysis complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return result;

  } catch (error) {
    console.error('[diagnosticService] Error calling diagnostics API:', error);
    throw error;
  }
}

/**
 * Raster-backed farm analysis.
 * On cache hit (<24h): returns instantly with pre-rendered PNGs from Supabase Storage.
 * On cache miss: runs GEE analysis, uploads rasters, then returns results.
 */
export async function analyzeFarmWithRaster(
  farmId: string,
  geometry: FarmGeometry,
  crop: DiagnosticCropProfile = 'generic',
  onProgress?: (progress: number, message: string) => void,
  sowingDate?: string,
): Promise<DiagnosticRasterResult> {
  const startTime = Date.now();
  onProgress?.(0, 'Starting farm analysis...');

  try {
    if (!UUID_PATTERN.test(farmId)) {
      throw new Error(`Raster diagnostics require a Supabase farm UUID. Received "${farmId}".`);
    }

    onProgress?.(10, 'Fetching satellite data...');

    const polygon = JSON.stringify(geometry);
    const sowingParam = sowingDate ? `&sowing_date=${encodeURIComponent(sowingDate)}` : '';
    const apiUrl = buildApiUrl(
      `/diagnostics?polygon=${encodeURIComponent(polygon)}&farm_id=${encodeURIComponent(farmId)}&crop=${encodeURIComponent(crop)}&days=30&cloud=80${sowingParam}`
    );

    // Fetch server diagnostics and time-series history concurrently
    const [response, timeSeriesResults] = await Promise.all([
      fetch(apiUrl, { headers: { ...getSupabaseFunctionHeaders() } }),
      fetchAllIndicesTimeSeries(geometry)
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Diagnostics API error: ${response.status} - ${errorText}`);
    }

    const serverResult = await response.json();

    const isCached = serverResult.cached === true || serverResult.data?.cached === true;
    onProgress?.(isCached ? 80 : 50, isCached ? 'Loaded from cache...' : 'Processing analysis results...');

    const analysis = serverResult.data?.analysis || serverResult.analysis || {};
    const serverProblems = serverResult.data?.problems || serverResult.problems || [];
    const metadata = serverResult.data?.metadata || serverResult.metadata || {};
    const cellData: SamplePoint[] = serverResult.data?.cell_stats ?? serverResult.cell_stats ?? serverResult.data?.cellData ?? serverResult.cellData ?? [];
    const rasterUrlsRaw: Record<string, string> = serverResult.data?.raster_urls ?? serverResult.raster_urls ?? {};
    const boundsRaw: [[number, number], [number, number]] = serverResult.data?.bounds ?? serverResult.bounds ?? [[0, 0], [0, 0]];

    onProgress?.(60, 'Creating grid cells...');
    const cells = createGridCells(geometry, 10);
    const problemSummaries: ProblemSummary[] = [];
    const indexProblems: Map<DiagnosticIndex, IndexAnalysis> = new Map();

    const cloudFraction = metadata.cloudCover ?? metadata.cloud_cover ?? 0;
    const imagesUsed = metadata.imagesAnalyzed ?? metadata.daysAnalyzed ?? 99;
    const lowDataQuality = cloudFraction > 60 || imagesUsed < 2;

    for (const index of DIAGNOSTIC_INDICES) {
      const indexData = analysis[index];
      if (!indexData) continue;
      const threshold = indexData.belowThreshold || false;
      const trend = indexData.trendDetected || false;
      const value = indexData.mean || 0;
      const confidence = getAnalysisConfidence(index, indexData, metadata);
      const changeUnit = getAnalysisTrendUnit(index, indexData);
      const change = normalizeTrendChange(index, indexData.trend || 0, value, changeUnit, indexData);
      indexProblems.set(index, { threshold, trend, value, change, changeUnit, confidence });
      if (!FLAGGING_INDICES.has(index)) continue;
      if (lowDataQuality) continue;
      if (threshold || trend) {
        problemSummaries.push({
          index,
          type: threshold && trend ? 'both' : threshold ? 'threshold' : 'trend',
          cellCount: 0,
          avgValue: value,
          avgDecline: change,
          avgDeclineUnit: changeUnit,
          confidence,
          color: INDEX_COLORS[index],
          label: INDEX_LABELS[index],
        });
      }
    }

    onProgress?.(75, 'Assigning problems to grid cells...');
    if (cellData.length === 0) {
      throw new Error('Diagnostics API returned no cell-level satellite samples; refusing to synthesize raster map cells.');
    }

    const cropFamily = parseCropFamily(crop);
    const phenology = sowingDate ? deriveGrowthStage(sowingDate, cropFamily) : null;
    const currentStage: GrowthStage = phenology?.stage ?? 'tillering';

    assignProblemsToCells(cells, indexProblems, problemSummaries, cellData, crop, currentStage);

    onProgress?.(90, 'Calculating statistics...');
    const problemCells = cells.filter((c) => c.problems.length > 0);
    const overlapCells = cells.filter((c) => c.problems.length > 1);

    const advisory: AdvisoryIndexData[] = [];
    for (const index of ADVISORY_INDICES) {
      const a = indexProblems.get(index);
      if (a) advisory.push({ index, value: a.value, confidence: a.confidence, label: INDEX_LABELS[index], color: INDEX_COLORS[index] });
    }

    const compositeHealthScore = computeCompositeHealth(indexProblems, crop, currentStage);

    const result: DiagnosticRasterResult = {
      cells,
      problems: problemSummaries,
      advisory,
      lowDataQuality,
      growthStage: currentStage,
      growthStageName: phenology?.stageName ?? STAGE_LABELS[currentStage],
      sowingDate: phenology?.sowingDate,
      compositeHealthScore,
      analysisDate: new Date().toISOString(),
      imagesAnalyzed: metadata.imagesAnalyzed || metadata.daysAnalyzed || 14,
      cloudCover: metadata.cloudCover || metadata.cloud_cover,
      nutrientModel: metadata.nutrientModel,
      farmStats: {
        totalCells: cells.length,
        problemCells: problemCells.length,
        healthyCells: cells.length - problemCells.length,
        overlapCells: overlapCells.length,
      },
      rasterUrls: rasterUrlsRaw as Record<DiagnosticIndex, string>,
      bounds: boundsRaw,
      cached: isCached,
      expiresAt: serverResult.expires_at || serverResult.data?.expires_at,
      history: timeSeriesResults as Record<DiagnosticIndex, TimeSeriesDataPoint[]>,
    };

    onProgress?.(100, `Analysis complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return result;
  } catch (error) {
    console.error('[diagnosticService] analyzeFarmWithRaster error:', error);
    throw error;
  }
}

/**
 * Fetch time-series data for all diagnostic indices
 */
async function fetchAllIndicesTimeSeries(
  geometry: FarmGeometry
): Promise<Record<DiagnosticIndex, TimeSeriesDataPoint[]>> {
  const polygon = JSON.stringify(geometry);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 14 days

  const results: Record<DiagnosticIndex, TimeSeriesDataPoint[]> = {
    nitrogen: [],
    phosphorus: [],
    potassium: [],
    moisture: [],
    ndvi: [],
    ph: [],
    salinity: [],
  };

  // Fetch all indices in parallel
  const fetchPromises = DIAGNOSTIC_INDICES.map(async (index) => {
    const url = buildApiUrl(
      `${API_ENDPOINTS.agriculturalIndices}?index=${index}&polygon=${encodeURIComponent(polygon)}&start=${startDate}&end=${endDate}&timeseries=true`
    );

    const response = await fetch(url, {
      headers: {
        ...getSupabaseFunctionHeaders(),
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${index} time series: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as AgriculturalIndexResponse;
    if (!json.data?.windows) {
      throw new Error(`Time-series response for ${index} did not include data.windows.`);
    }

    const windows = json.data.windows;
    return {
      index,
      data: windows.map((w) => ({
        date: w.startDate || w.endDate,
        mean: w.mean,
        min: w.min,
        max: w.max,
        stdDev: w.stdDev,
        cloudCover: w.cloudCover,
      })),
    };
  });

  const fetchResults = await Promise.all(fetchPromises);
  fetchResults.forEach(({ index, data }) => {
    results[index] = data;
  });

  return results;
}

function getAnalysisConfidence(
  index: DiagnosticIndex,
  indexData: Record<string, unknown>,
  metadata: { nutrientModel?: DiagnosticResult['nutrientModel'] }
): DiagnosticConfidence {
  const explicit = indexData.confidence;
  if (explicit === 'high' || explicit === 'medium' || explicit === 'low') {
    return explicit;
  }

  const modelConfidence = metadata.nutrientModel?.confidenceByIndex?.[index];
  return modelConfidence || INDEX_CONFIDENCE[index];
}

function getAnalysisTrendUnit(
  index: DiagnosticIndex,
  indexData: Record<string, unknown>
): DiagnosticTrendUnit {
  if (indexData.trendUnit === 'points' || indexData.trendUnit === 'percent') {
    return NPK_INDICES.has(index) ? 'points' : indexData.trendUnit;
  }

  return NPK_INDICES.has(index) ? 'points' : 'percent';
}

function normalizeTrendChange(
  index: DiagnosticIndex,
  rawChange: number,
  currentValue: number,
  changeUnit: DiagnosticTrendUnit,
  indexData: Record<string, unknown>
): number {
  if (!Number.isFinite(rawChange)) return 0;
  if (!NPK_INDICES.has(index) || changeUnit === 'percent') return rawChange;

  const explicitUnit = indexData.trendUnit;
  const unitText = String(indexData.unit || '').toLowerCase();

  if (explicitUnit === 'points' || unitText.includes('sufficiency')) {
    return Math.max(-100, Math.min(100, rawChange));
  }

  // Legacy diagnostics responses reported nutrient trends as large percentage-like
  // values. Convert those to score-point movement from the current 0-100 score.
  const converted = (rawChange / 100) * Math.max(Math.abs(currentValue), 1);
  return Math.max(-100, Math.min(100, converted));
}

function derivePreviousValue(currentValue: number, analysis: IndexAnalysis): number | undefined {
  if (!analysis.trend) return undefined;

  if (analysis.changeUnit === 'points') {
    const previous = currentValue - analysis.change;
    return Number.isFinite(previous) && previous >= 0 ? previous : undefined;
  }

  const denominator = 1 + analysis.change / 100;
  if (denominator <= 0.05) return undefined;

  const previous = currentValue / denominator;
  return Number.isFinite(previous) && previous >= 0 ? previous : undefined;
}

/**
 * Create a grid of cells covering the farm polygon.
 * For MultiPolygon, iterates each polygon separately for reliable coverage.
 */
function createGridCells(geometry: FarmGeometry, resolution: number = 10): GridCell[] {
  const cells: GridCell[] = [];
  let cellId = 0;

  try {
    // Break MultiPolygon into individual polygons for per-polygon grid generation
    const polygons: Polygon[] = [];
    if (geometry.type === 'MultiPolygon') {
      for (const coords of geometry.coordinates) {
        polygons.push({ type: 'Polygon', coordinates: coords });
      }
    } else {
      polygons.push(geometry);
    }

    for (const poly of polygons) {
      const bboxArray = turf.bbox(poly);
      const [minLng, minLat, maxLng, maxLat] = bboxArray;

      const latCenter = (minLat + maxLat) / 2;
      const cellSizeLat = resolution / 111000;
      const cellSizeLng = resolution / (111000 * Math.cos(latCenter * Math.PI / 180));

      for (let lat = minLat; lat < maxLat; lat += cellSizeLat) {
        for (let lng = minLng; lng < maxLng; lng += cellSizeLng) {
          const cellPolygon = turf.bboxPolygon([lng, lat, lng + cellSizeLng, lat + cellSizeLat]);

          try {
            if (turf.booleanIntersects(cellPolygon, poly)) {
              cells.push({
                id: `cell-${cellId++}`,
                bounds: [[lat, lng], [lat + cellSizeLat, lng + cellSizeLng]],
                center: [lat + cellSizeLat / 2, lng + cellSizeLng / 2],
                problems: [],
                severity: 'none',
              });
            }
          } catch {
            // Skip cells that fail intersection test
          }
        }
      }
    }
  } catch (error) {
    console.error('[Diagnostics] Error creating grid cells:', error);
  }

  return cells;
}

/**
 * Map sample points to grid cells by bounding-box containment.
 * Each sample point is assigned to the cell whose bounds contain its lat/lng.
 * Returns a Map from cell id to array of sample points within that cell.
 */
function mapSamplePointsToCells(
  cells: GridCell[],
  samplePoints: SamplePoint[]
): Map<string, SamplePoint[]> {
  const cellSamples = new Map<string, SamplePoint[]>();

  for (const point of samplePoints) {
    for (const cell of cells) {
      const [[latMin, lngMin], [latMax, lngMax]] = cell.bounds;
      if (point.lat >= latMin && point.lat < latMax &&
          point.lng >= lngMin && point.lng < lngMax) {
        const existing = cellSamples.get(cell.id);
        if (existing) {
          existing.push(point);
        } else {
          cellSamples.set(cell.id, [point]);
        }
        break; // Each point belongs to one cell
      }
    }
  }

  return cellSamples;
}

/**
 * Propagate sample data to nearby cells within ~30m radius.
 * Since 30m samples cover 3x3 blocks of 10m cells, assign the same
 * sample value to neighboring cells that don't have their own sample.
 */
function propagateSamplesToNearbyCells(
  cells: GridCell[],
  cellSamples: Map<string, SamplePoint[]>
): Map<string, SamplePoint[]> {
  // Pre-compute cell center lookup for distance checks
  const cellsWithSamples = cells.filter(c => cellSamples.has(c.id));
  const cellsWithoutSamples = cells.filter(c => !cellSamples.has(c.id));

  // 30m radius in degrees (approximate)
  const radiusDeg = 30 / 111000;

  for (const emptyCell of cellsWithoutSamples) {
    const [eLat, eLng] = emptyCell.center;

    // Find nearest cell with samples within 30m
    let nearestDist = Infinity;
    let nearestSamples: SamplePoint[] | null = null;

    for (const sampleCell of cellsWithSamples) {
      const [sLat, sLng] = sampleCell.center;
      const dist = Math.sqrt((eLat - sLat) ** 2 + (eLng - sLng) ** 2);

      if (dist < radiusDeg && dist < nearestDist) {
        nearestDist = dist;
        nearestSamples = cellSamples.get(sampleCell.id) || null;
      }
    }

    if (nearestSamples) {
      cellSamples.set(emptyCell.id, nearestSamples);
    }
  }

  return cellSamples;
}

/**
 * Assign problems to grid cells.
 * Uses real per-pixel satellite samples from the diagnostics Edge Function.
 */
function assignProblemsToCells(
  cells: GridCell[],
  indexProblems: Map<DiagnosticIndex, IndexAnalysis>,
  problemSummaries: ProblemSummary[],
  cellData: SamplePoint[],
  crop: DiagnosticCropProfile = 'generic',
  stage: GrowthStage = 'tillering'
): void {
  const thresholdsByIndex = getStageThresholds(crop, stage);

  if (cellData.length === 0) {
    throw new Error('Cannot assign diagnostic problems without cell-level satellite samples.');
  }

  console.log(`[diagnosticService] Using data-driven placement with ${cellData.length} sample points`);

  let cellSamples = mapSamplePointsToCells(cells, cellData);
  cellSamples = propagateSamplesToNearbyCells(cells, cellSamples);

  console.log(`[diagnosticService] ${cellSamples.size} cells have sample data after propagation`);

  for (const cell of cells) {
    const samples = cellSamples.get(cell.id);
    if (!samples || samples.length === 0) continue;

    const avgValues: Record<string, number> = {};
    for (const index of DIAGNOSTIC_INDICES) {
      const validValues = samples
        .map(s => s[index])
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
      if (validValues.length > 0) {
        avgValues[index] = validValues.reduce((a, b) => a + b, 0) / validValues.length;
      }
    }

    for (const index of DIAGNOSTIC_INDICES) {
      // Only satellite-reliable indices may raise a flagged problem cell.
      // P/K, pH, salinity are advisory-only — they appear in the info panel but
      // never colour a cell red or inflate the problem count.
      if (!FLAGGING_INDICES.has(index)) continue;

      const analysis = indexProblems.get(index);
      if (!analysis) continue;
      const cellValue = avgValues[index];
      if (cellValue === undefined) continue;

      // Data-quality gate: physically impossible values (moisture < 0 after clamping
      // should not occur, but guard anyway) or index signals a no-data placeholder.
      if (!Number.isFinite(cellValue) || cellValue < 0) continue;

      const issue = evaluateThresholdIssue(cellValue, thresholdsByIndex[index]);
      const shouldFlag = issue.isCritical || (analysis.trend && issue.isWarning);

      if (!shouldFlag) continue;

      const problemType = issue.isCritical && analysis.trend ? 'both' : (issue.isCritical ? 'threshold' : 'trend');
      const changePercent = analysis.trend ? analysis.change : undefined;
      const severityScore = calculateProblemSeverity(index, cellValue, analysis, thresholdsByIndex[index], issue.direction);
      const previousValue = derivePreviousValue(cellValue, analysis);

      const problem: CellProblem = {
        index,
        type: problemType,
        currentValue: cellValue,
        previousValue,
        threshold: issue.threshold,
        direction: issue.direction,
        changePercent,
        changeUnit: analysis.changeUnit,
        confidence: analysis.confidence,
        severityScore,
        message: generateProblemMessage(index, analysis, cellValue, thresholdsByIndex[index], issue.direction),
        urgent: classifyUrgent({ type: problemType, index, changePercent, severityScore }),
      };

      cell.problems.push(problem);
    }
  }

  rebuildProblemSummaries(cells, indexProblems, problemSummaries);

  // Update cell severities from the strongest local signal and overlap risk.
  cells.forEach(cell => {
    if (cell.problems.length === 0) {
      cell.severity = 'none';
      return;
    }

    const maxSeverity = getCellSeverityScore(cell);
    if (cell.problems.length > 1 || maxSeverity >= 0.72 || cell.problems.some(p => p.urgent)) {
      cell.severity = 'high';
    } else if (maxSeverity >= 0.45) {
      cell.severity = 'medium';
    } else {
      cell.severity = 'low';
    }
  });
}

function calculateProblemSeverity(
  index: DiagnosticIndex,
  cellValue: number,
  analysis: IndexAnalysis,
  thresholds: DiagnosticThreshold,
  direction?: ThresholdDirection
): number {
  const issue = evaluateThresholdIssue(cellValue, thresholds);
  const activeDirection = direction || issue.direction;
  const warningThreshold = activeDirection === 'high'
    ? thresholds.warningHigh ?? thresholds.high ?? issue.threshold
    : thresholds.warning ?? thresholds.low ?? issue.threshold;
  const denominator = Math.max(Math.abs(warningThreshold), 1);
  const thresholdPressure = activeDirection === 'high'
    ? Math.max(0, (cellValue - warningThreshold) / denominator)
    : Math.max(0, (warningThreshold - cellValue) / denominator);
  const criticalBoost = issue.isCritical ? 0.32 : 0;
  const trendBoost = analysis.trend
    ? Math.min(Math.abs(analysis.change) / (analysis.changeUnit === 'points' ? 50 : 100), 0.35)
    : 0;
  const confidencePenalty = analysis.confidence === 'low' ? -0.08 : analysis.confidence === 'medium' ? -0.03 : 0;

  return Math.max(0.15, Math.min(1, thresholdPressure + criticalBoost + trendBoost + confidencePenalty));
}

function evaluateThresholdIssue(
  value: number,
  thresholds: DiagnosticThreshold
): { isCritical: boolean; isWarning: boolean; direction: ThresholdDirection; threshold: number } {
  const lowThreshold = thresholds.low;
  const warningLow = thresholds.warning ?? lowThreshold;
  const highThreshold = thresholds.high;
  const warningHigh = thresholds.warningHigh ?? highThreshold;

  const lowCritical = lowThreshold !== undefined && value < lowThreshold;
  const highCritical = highThreshold !== undefined && value > highThreshold;
  const lowWarning = warningLow !== undefined && value < warningLow;
  const highWarning = warningHigh !== undefined && value > warningHigh;

  if (highCritical || (!lowCritical && highWarning)) {
    return {
      isCritical: highCritical,
      isWarning: highWarning,
      direction: 'high',
      threshold: highThreshold ?? warningHigh ?? value,
    };
  }

  return {
    isCritical: lowCritical,
    isWarning: lowWarning,
    direction: 'low',
    threshold: lowThreshold ?? warningLow ?? value,
  };
}

function rebuildProblemSummaries(
  cells: GridCell[],
  indexProblems: Map<DiagnosticIndex, IndexAnalysis>,
  problemSummaries: ProblemSummary[]
): void {
  const nextSummaries: ProblemSummary[] = [];

  for (const index of DIAGNOSTIC_INDICES) {
    const problems = cells.flatMap((cell) => cell.problems.filter((problem) => problem.index === index));
    if (problems.length === 0) continue;

    const analysis = indexProblems.get(index);
    const hasBoth = problems.some((problem) => problem.type === 'both');
    const hasThreshold = problems.some((problem) => problem.type === 'threshold');
    const type: ProblemSummary['type'] = hasBoth ? 'both' : hasThreshold ? 'threshold' : 'trend';
    const avgValue = problems.reduce((sum, problem) => sum + problem.currentValue, 0) / problems.length;
    const changes = problems
      .map((problem) => problem.changePercent)
      .filter((value): value is number => value !== undefined);

    nextSummaries.push({
      index,
      type,
      cellCount: problems.length,
      avgValue,
      avgDecline: changes.length
        ? changes.reduce((sum, value) => sum + value, 0) / changes.length
        : analysis?.change,
      avgDeclineUnit: analysis?.changeUnit,
      confidence: analysis?.confidence || INDEX_CONFIDENCE[index],
      color: INDEX_COLORS[index],
      label: INDEX_LABELS[index],
    });
  }

  problemSummaries.splice(0, problemSummaries.length, ...nextSummaries);
}

/**
 * Generate a human-readable problem message
 */
function generateProblemMessage(
  index: DiagnosticIndex,
  analysis: IndexAnalysis,
  cellValue: number,
  thresholds: DiagnosticThreshold,
  direction?: ThresholdDirection
): string {
  const label = INDEX_LABELS[index];
  const issue = evaluateThresholdIssue(cellValue, thresholds);
  const activeDirection = direction || issue.direction;
  const messages: string[] = [];

  if (issue.isCritical) {
    const formattedValue = NPK_INDICES.has(index) ? cellValue.toFixed(0) : cellValue.toFixed(1);
    const unit = NPK_INDICES.has(index)
      ? 'satellite sufficiency score'
      : index === 'salinity'
        ? 'estimate'
        : 'value';
    const qualifier = activeDirection === 'high' ? 'high' : 'low';
    const comparator = activeDirection === 'high' ? 'above' : 'below';
    messages.push(`${label} ${unit} is ${qualifier} at ${formattedValue} (${comparator} ${issue.threshold})`);
  }

  if (analysis.trend && LOW_STRESS_INDICES.has(index)) {
    const suffix = analysis.changeUnit === 'points' ? ' points' : '%';
    messages.push(`${label} steep decline of ${Math.abs(analysis.change).toFixed(1)}${suffix}`);
  }

  return messages.join('; ');
}

/**
 * Get the color for a cell based on its problems
 */
export function getCellColor(cell: GridCell): string | null {
  if (cell.problems.length === 0) return null;
  if (cell.problems.length > 1) return MULTIPLE_PROBLEM_COLOR;
  return INDEX_COLORS[cell.problems[0].index];
}

/**
 * Get the fill opacity for a cell based on severity
 */
export function getCellOpacity(cell: GridCell): number {
  switch (cell.severity) {
    case 'high': return 0.8;  // Overlap/critical - very prominent
    case 'medium': return 0.55;
    case 'low': return 0.5;  // Single issue - visible but not dominant
    default: return 0;
  }
}

/**
 * Get index color
 */
export function getIndexColor(index: DiagnosticIndex): string {
  return INDEX_COLORS[index];
}

/**
 * Get index label
 */
export function getIndexLabel(index: DiagnosticIndex): string {
  return INDEX_LABELS[index];
}

/**
 * Get multiple problem color
 */
export function getMultipleProblemColor(): string {
  return MULTIPLE_PROBLEM_COLOR;
}

/**
 * Determine if a problem should be classified as urgent.
 * Urgent when: type is 'both', or steep trend decline (>50%), or critical NPK/crop health drop.
 */
function classifyUrgent(problem: Pick<CellProblem, 'type' | 'index' | 'changePercent' | 'severityScore'>): boolean {
  if (problem.type === 'both') return true;
  if ((problem.severityScore ?? 0) >= 0.78) return true;
  if (problem.type === 'trend' && problem.changePercent !== undefined && problem.changePercent < -50) return true;
  return false;
}

/**
 * Check if a cell has any urgent problems
 */
export function isUrgentCell(cell: GridCell): boolean {
  return cell.problems.some(p => p.urgent);
}

export function getCellSeverityScore(cell: GridCell): number {
  return cell.problems.reduce((max, problem) => Math.max(max, problem.severityScore ?? 0.35), 0);
}

/**
 * Get thresholds for an index (season-aware)
 */
export function getIndexThresholds(index: DiagnosticIndex): { low: number; warning: number } {
  const thresholds = getSeasonalThresholds()[index];
  return {
    low: thresholds.low ?? thresholds.high ?? 0,
    warning: thresholds.warning ?? thresholds.warningHigh ?? thresholds.low ?? thresholds.high ?? 0,
    ...thresholds,
  } as { low: number; warning: number };
}

/**
 * Get current season name for display
 */
export function getCurrentSeasonName(): string {
  return getCurrentSeason();
}
