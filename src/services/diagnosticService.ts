/**
 * Diagnostic Service
 * Analyzes satellite data to detect problem areas on farms.
 * Supports threshold-based and trend-based detection.
 */

import { buildApiUrl, getSupabaseFunctionHeaders } from './api';
import { API_ENDPOINTS } from '@/constants';
import * as turf from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';

// Types
export type DiagnosticIndex = 'nitrogen' | 'phosphorus' | 'potassium' | 'moisture' | 'ndvi';
export type DiagnosticConfidence = 'high' | 'medium' | 'low';
export type DiagnosticTrendUnit = 'percent' | 'points';
type FarmGeometry = Polygon | MultiPolygon;

export interface SamplePoint {
  lat: number;
  lng: number;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  moisture: number | null;
  ndvi: number | null;
}

export interface CellProblem {
  index: DiagnosticIndex;
  type: 'threshold' | 'trend' | 'both';
  currentValue: number;
  previousValue?: number;
  threshold: number;
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

export interface DiagnosticResult {
  cells: GridCell[];
  problems: ProblemSummary[];
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
const DIAGNOSTIC_INDICES: DiagnosticIndex[] = ['nitrogen', 'phosphorus', 'potassium', 'moisture', 'ndvi'];
const NPK_INDICES = new Set<DiagnosticIndex>(['nitrogen', 'phosphorus', 'potassium']);

interface IndexAnalysis {
  threshold: boolean;
  trend: boolean;
  value: number;
  change: number;
  changeUnit: DiagnosticTrendUnit;
  confidence: DiagnosticConfidence;
}

// Season-aware thresholds - adjusted for crop phenology
// Winter: dormant fields, low expectations
// Spring: early growth, moderate expectations
// Summer: peak growth, highest expectations
// Fall: senescence, declining expectations
type Season = 'winter' | 'spring' | 'summer' | 'fall';

function getCurrentSeason(): Season {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

const SEASONAL_THRESHOLDS: Record<Season, Record<DiagnosticIndex, { low: number; warning: number }>> = {
  winter: {
    nitrogen: { low: 35, warning: 50 },
    phosphorus: { low: 30, warning: 45 },
    potassium: { low: 35, warning: 50 },
    moisture: { low: 2, warning: 5 },
    ndvi: { low: 0.02, warning: 0.05 },      // MSAVI2 - bare soil/dormant
  },
  spring: {
    nitrogen: { low: 45, warning: 60 },
    phosphorus: { low: 35, warning: 50 },
    potassium: { low: 40, warning: 58 },
    moisture: { low: 6, warning: 10 },
    ndvi: { low: 0.08, warning: 0.15 },      // MSAVI2 - early growth
  },
  summer: {
    nitrogen: { low: 50, warning: 65 },
    phosphorus: { low: 35, warning: 52 },
    potassium: { low: 45, warning: 62 },
    moisture: { low: 8, warning: 14 },
    ndvi: { low: 0.12, warning: 0.20 },      // MSAVI2 - peak canopy
  },
  fall: {
    nitrogen: { low: 40, warning: 55 },
    phosphorus: { low: 32, warning: 48 },
    potassium: { low: 38, warning: 55 },
    moisture: { low: 5, warning: 9 },
    ndvi: { low: 0.06, warning: 0.12 },      // MSAVI2 - senescence
  },
};

function getSeasonalThresholds(): Record<DiagnosticIndex, { low: number; warning: number }> {
  return SEASONAL_THRESHOLDS[getCurrentSeason()];
}

const TREND_THRESHOLD_PERCENT = -30; // 30% decline triggers trend alert
const NUTRIENT_TREND_THRESHOLD_POINTS = -15;

const INDEX_COLORS: Record<DiagnosticIndex, string> = {
  nitrogen: '#ef4444',    // Red
  phosphorus: '#eab308',  // Yellow
  potassium: '#10b981',   // Emerald
  moisture: '#3b82f6',    // Blue
  ndvi: '#22c55e',        // Green
};

const INDEX_LABELS: Record<DiagnosticIndex, string> = {
  nitrogen: 'Nitrogen',
  phosphorus: 'Phosphorus',
  potassium: 'Potassium',
  moisture: 'Soil Moisture',
  ndvi: 'Crop Health',
};

const INDEX_CONFIDENCE: Record<DiagnosticIndex, DiagnosticConfidence> = {
  nitrogen: 'high',
  phosphorus: 'low',
  potassium: 'medium',
  moisture: 'medium',
  ndvi: 'high',
};

const MULTIPLE_PROBLEM_COLOR = '#a855f7'; // Purple

/**
 * Main entry point - analyze a farm for problems
 * Uses the server's /diagnostics endpoint which fetches multiple satellite images
 * and calculates proper trends from Earth Engine
 */
export async function analyzeFarm(
  farmId: string,
  geometry: FarmGeometry,
  onProgress?: (progress: number, message: string) => void
): Promise<DiagnosticResult> {
  const startTime = Date.now();
  onProgress?.(0, 'Starting farm analysis...');

  try {
    // Call the server's diagnostics endpoint which handles Earth Engine analysis
    onProgress?.(10, 'Fetching satellite data from Earth Engine...');

    const polygon = JSON.stringify(geometry);
    const url = buildApiUrl(`/diagnostics?polygon=${encodeURIComponent(polygon)}&days=14&cloud=50`);

    const response = await fetch(url, {
      headers: {
        ...getSupabaseFunctionHeaders(),
      },
    });

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

    // Assign problems to cells using real data when available, random fallback otherwise
    assignProblemsToCells(cells, indexProblems, problemSummaries, cellData);

    onProgress?.(90, 'Calculating statistics...');

    // Calculate farm statistics
    const problemCells = cells.filter(c => c.problems.length > 0);
    const overlapCells = cells.filter(c => c.problems.length > 1);

    const result: DiagnosticResult = {
      cells,
      problems: problemSummaries,
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

    // Fallback to local analysis if server fails
    onProgress?.(20, 'Server unavailable, using fallback analysis...');
    return await fallbackAnalyzeFarm(farmId, geometry, onProgress, startTime);
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
  onProgress?: (progress: number, message: string) => void
): Promise<DiagnosticRasterResult> {
  const startTime = Date.now();
  onProgress?.(0, 'Starting farm analysis...');

  try {
    onProgress?.(10, 'Fetching satellite data...');

    const polygon = JSON.stringify(geometry);
    const apiUrl = buildApiUrl(
      `/diagnostics?polygon=${encodeURIComponent(polygon)}&farm_id=${encodeURIComponent(farmId)}&days=14&cloud=50`
    );

    // Fetch server diagnostics and time-series history concurrently
    const [response, timeSeriesResults] = await Promise.all([
      fetch(apiUrl, { headers: { ...getSupabaseFunctionHeaders() } }),
      fetchAllIndicesTimeSeries(geometry).catch(e => {
        console.warn('Failed to fetch time series:', e);
        return {};
      })
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
    assignProblemsToCells(cells, indexProblems, problemSummaries, cellData);

    onProgress?.(90, 'Calculating statistics...');
    const problemCells = cells.filter((c) => c.problems.length > 0);
    const overlapCells = cells.filter((c) => c.problems.length > 1);

    const result: DiagnosticRasterResult = {
      cells,
      problems: problemSummaries,
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
    onProgress?.(20, 'Falling back to standard analysis...');
    const base = await analyzeFarm(farmId, geometry, onProgress);
    return {
      ...base,
      rasterUrls: {} as Record<DiagnosticIndex, string>,
      bounds: [[0, 0], [0, 0]],
    };
  }
}

/**
 * Fallback analysis when server is unavailable
 */
async function fallbackAnalyzeFarm(
  farmId: string,
  geometry: FarmGeometry,
  onProgress?: (progress: number, message: string) => void,
  startTime?: number
): Promise<DiagnosticResult> {
  const start = startTime || Date.now();

  // Fetch time-series data for all indices in parallel
  onProgress?.(30, 'Fetching satellite data (fallback)...');
  const timeSeriesResults = await fetchAllIndicesTimeSeries(geometry);
  onProgress?.(50, 'Analyzing data...');

  // Create grid cells for the farm
  const cells = createGridCells(geometry, 10);
  onProgress?.(60, `Created ${cells.length} grid cells...`);

  // Analyze each index for problems
  const problemSummaries: ProblemSummary[] = [];
  const indexProblems: Map<DiagnosticIndex, IndexAnalysis> = new Map();

  for (const index of DIAGNOSTIC_INDICES) {
    const data = timeSeriesResults[index];
    if (!data || data.length === 0) continue;

    const analysis = analyzeIndexData(index, data);
    indexProblems.set(index, analysis);

    if (analysis.threshold || analysis.trend) {
      problemSummaries.push({
        index,
        type: analysis.threshold && analysis.trend ? 'both' : (analysis.threshold ? 'threshold' : 'trend'),
        cellCount: 0, // Will be updated after cell assignment
        avgValue: analysis.value,
        avgDecline: analysis.change,
        avgDeclineUnit: analysis.changeUnit,
        confidence: analysis.confidence,
        color: INDEX_COLORS[index],
        label: INDEX_LABELS[index],
      });
    }
  }

  onProgress?.(70, 'Assigning problems to grid cells...');

  // Assign problems to cells
  assignProblemsToCells(cells, indexProblems, problemSummaries);

  onProgress?.(90, 'Calculating statistics...');

  // Calculate farm statistics
  const problemCells = cells.filter(c => c.problems.length > 0);
  const overlapCells = cells.filter(c => c.problems.length > 1);

  const result: DiagnosticResult = {
    cells,
    problems: problemSummaries,
    analysisDate: new Date().toISOString(),
    imagesAnalyzed: Math.min(...Object.values(timeSeriesResults).map(d => d?.length || 0)),
    farmStats: {
      totalCells: cells.length,
      problemCells: problemCells.length,
      healthyCells: cells.length - problemCells.length,
      overlapCells: overlapCells.length,
    },
  };

  onProgress?.(100, `Analysis complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return result;
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
  };

  // Fetch all indices in parallel
  const fetchPromises = DIAGNOSTIC_INDICES.map(async (index) => {
    try {
      const url = buildApiUrl(
        `${API_ENDPOINTS.agriculturalIndices}?index=${index}&polygon=${encodeURIComponent(polygon)}&start=${startDate}&end=${endDate}&timeseries=true`
      );

      const response = await fetch(url, {
        headers: {
          ...getSupabaseFunctionHeaders(),
        },
      });
      if (!response.ok) {
        console.warn(`[Diagnostics] Failed to fetch ${index}: ${response.statusText}`);
        return { index, data: [] };
      }

      const json = (await response.json()) as AgriculturalIndexResponse;

      // Handle time-series response format
      if (json.data?.windows) {
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
      }

      // Handle single response format (fallback)
      if (json.mean_value !== undefined) {
        return {
          index,
          data: [{
            date: endDate,
            mean: json.mean_value,
            min: json.min_value,
            max: json.max_value,
            stdDev: json.std_dev,
            cloudCover: json.cloudCover,
          }],
        };
      }

      return { index, data: [] };
    } catch (error) {
      console.error(`[Diagnostics] Error fetching ${index}:`, error);
      return { index, data: [] };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);
  fetchResults.forEach(({ index, data }) => {
    results[index] = data;
  });

  return results;
}

/**
 * Analyze index data for threshold violations and trends
 */
function analyzeIndexData(
  index: DiagnosticIndex,
  data: TimeSeriesDataPoint[]
): IndexAnalysis {
  if (data.length === 0) {
    return {
      threshold: false,
      trend: false,
      value: 0,
      change: 0,
      changeUnit: 'percent',
      confidence: INDEX_CONFIDENCE[index],
    };
  }

  // Get current value (most recent)
  const currentValue = normalizeDiagnosticValue(index, data[data.length - 1].mean);
  const thresholds = getSeasonalThresholds()[index];

  // Only flag critical threshold violations (below 'low', not 'warning')
  const threshold = currentValue < thresholds.low;

  // Trend detection (compare first and last)
  let change = 0;
  let trend = false;
  const changeUnit: DiagnosticTrendUnit = NPK_INDICES.has(index) ? 'points' : 'percent';
  if (data.length >= 2) {
    const firstValue = normalizeDiagnosticValue(index, data[0].mean);
    const lastValue = currentValue;

    if (changeUnit === 'points') {
      change = lastValue - firstValue;
      trend = change < NUTRIENT_TREND_THRESHOLD_POINTS && lastValue < thresholds.warning;
    } else if (firstValue > 0) {
      change = ((lastValue - firstValue) / firstValue) * 100;
      trend = change < TREND_THRESHOLD_PERCENT && lastValue < thresholds.warning;
    }
  }

  return { threshold, trend, value: currentValue, change, changeUnit, confidence: INDEX_CONFIDENCE[index] };
}

function normalizeDiagnosticValue(index: DiagnosticIndex, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return NPK_INDICES.has(index) ? Math.max(0, Math.min(100, value)) : value;
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
 * Uses data-driven path when cellData is available (real per-pixel satellite data),
 * falls back to random assignment when cellData is empty.
 */
function assignProblemsToCells(
  cells: GridCell[],
  indexProblems: Map<DiagnosticIndex, IndexAnalysis>,
  problemSummaries: ProblemSummary[],
  cellData: SamplePoint[] = []
): void {
  const seasonalThresholds = getSeasonalThresholds();

  if (cellData.length > 0) {
    // --- DATA-DRIVEN PATH: use real per-pixel values ---
    console.log(`[diagnosticService] Using data-driven placement with ${cellData.length} sample points`);

    // Map sample points to grid cells
    let cellSamples = mapSamplePointsToCells(cells, cellData);

    // Propagate 30m samples to neighboring 10m cells
    cellSamples = propagateSamplesToNearbyCells(cells, cellSamples);

    console.log(`[diagnosticService] ${cellSamples.size} cells have sample data (after propagation)`);

    // Check each cell's sample values against seasonal thresholds
    for (const cell of cells) {
      const samples = cellSamples.get(cell.id);
      if (!samples || samples.length === 0) continue;

      // Average sample values for this cell
      const avgValues: Record<string, number> = {};
      for (const index of DIAGNOSTIC_INDICES) {
        const validValues = samples
          .map(s => s[index])
          .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
        if (validValues.length > 0) {
          avgValues[index] = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        }
      }

      // Check each available index locally. This catches nutrient hotspots even
      // when the farm-wide average is still acceptable.
      for (const index of DIAGNOSTIC_INDICES) {
        const analysis = indexProblems.get(index);
        if (!analysis) continue;
        const cellValue = avgValues[index];
        if (cellValue === undefined) continue;

        const thresholds = seasonalThresholds[index];

        const cellBelowThreshold = cellValue < thresholds.low;
        const cellBelowWarning = cellValue < thresholds.warning;
        const shouldFlag = cellBelowThreshold || (analysis.trend && cellBelowWarning);

        if (!shouldFlag) continue;

        const problemType = cellBelowThreshold && analysis.trend ? 'both' : (cellBelowThreshold ? 'threshold' : 'trend');
        const changePercent = analysis.trend ? analysis.change : undefined;
        const severityScore = calculateProblemSeverity(index, cellValue, analysis);
        const previousValue = derivePreviousValue(cellValue, analysis);

        const problem: CellProblem = {
          index,
          type: problemType,
          currentValue: cellValue,
          previousValue,
          threshold: thresholds.low,
          changePercent,
          changeUnit: analysis.changeUnit,
          confidence: analysis.confidence,
          severityScore,
          message: generateProblemMessage(index, analysis, cellValue),
          urgent: classifyUrgent({ type: problemType, index, changePercent, severityScore }),
        };

        cell.problems.push(problem);
      }
    }

    rebuildProblemSummaries(cells, indexProblems, problemSummaries);
  } else {
    // --- RANDOM FALLBACK: existing behavior when no cellData ---
    console.log('[diagnosticService] No sample data available, using random placement fallback');

    indexProblems.forEach((analysis, index) => {
      if (!analysis.threshold && !analysis.trend) return;

      const thresholds = seasonalThresholds[index];

      // Only flag 1-5% of cells
      const affectedRatio = analysis.threshold && analysis.trend
        ? 0.05
        : analysis.threshold
        ? 0.03
        : 0.02;
      const numAffected = Math.max(1, Math.floor(cells.length * affectedRatio));

      const shuffled = [...cells];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const affectedCells = shuffled.slice(0, numAffected);

      affectedCells.forEach(cell => {
        const variation = (Math.random() - 0.5) * analysis.value * 0.3;
        const cellValue = analysis.value + variation;
        const problemType = analysis.threshold && analysis.trend ? 'both' : (analysis.threshold ? 'threshold' : 'trend');
        const changePercent = analysis.trend ? analysis.change : undefined;
        const severityScore = calculateProblemSeverity(index, cellValue, analysis);
        const previousValue = derivePreviousValue(cellValue, analysis);

        const problem: CellProblem = {
          index,
          type: problemType,
          currentValue: cellValue,
          previousValue,
          threshold: thresholds.low,
          changePercent,
          changeUnit: analysis.changeUnit,
          confidence: analysis.confidence,
          severityScore,
          message: generateProblemMessage(index, analysis, cellValue),
          urgent: classifyUrgent({ type: problemType, index, changePercent, severityScore }),
        };

        cell.problems.push(problem);
      });

      const summary = problemSummaries.find(p => p.index === index);
      if (summary) {
        summary.cellCount = numAffected;
        summary.confidence = analysis.confidence;
      }
    });
  }

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
  analysis: IndexAnalysis
): number {
  const thresholds = getSeasonalThresholds()[index];
  const denominator = Math.max(thresholds.warning, 1);
  const thresholdPressure = Math.max(0, (thresholds.warning - cellValue) / denominator);
  const criticalBoost = cellValue < thresholds.low ? 0.32 : 0;
  const trendBoost = analysis.trend
    ? Math.min(Math.abs(analysis.change) / (analysis.changeUnit === 'points' ? 50 : 100), 0.35)
    : 0;
  const confidencePenalty = analysis.confidence === 'low' ? -0.08 : analysis.confidence === 'medium' ? -0.03 : 0;

  return Math.max(0.15, Math.min(1, thresholdPressure + criticalBoost + trendBoost + confidencePenalty));
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
  cellValue: number
): string {
  const label = INDEX_LABELS[index];
  const thresholds = getSeasonalThresholds()[index];
  const messages: string[] = [];

  if (cellValue < thresholds.low) {
    const formattedValue = NPK_INDICES.has(index) ? cellValue.toFixed(0) : cellValue.toFixed(1);
    const unit = NPK_INDICES.has(index) ? 'satellite sufficiency score' : 'value';
    messages.push(`${label} ${unit} is low at ${formattedValue} (below ${thresholds.low})`);
  }

  if (analysis.trend) {
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
  return getSeasonalThresholds()[index];
}

/**
 * Get current season name for display
 */
export function getCurrentSeasonName(): string {
  return getCurrentSeason();
}
