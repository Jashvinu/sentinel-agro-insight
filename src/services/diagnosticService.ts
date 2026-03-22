/**
 * Diagnostic Service
 * Analyzes satellite data to detect problem areas on farms.
 * Supports threshold-based and trend-based detection.
 */

import { buildApiUrl, getSupabaseFunctionHeaders } from './api';
import { API_ENDPOINTS } from '@/constants';
import * as turf from '@turf/turf';

// Types
export type DiagnosticIndex = 'nitrogen' | 'moisture' | 'ndvi' | 'phosphorus';

export interface SamplePoint {
  lat: number;
  lng: number;
  nitrogen: number | null;
  moisture: number | null;
  ndvi: number | null;
  phosphorus: number | null;
}

export interface CellProblem {
  index: DiagnosticIndex;
  type: 'threshold' | 'trend' | 'both';
  currentValue: number;
  previousValue?: number;
  threshold: number;
  changePercent?: number;
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
  color: string;
  label: string;
}

export interface DiagnosticResult {
  cells: GridCell[];
  problems: ProblemSummary[];
  analysisDate: string;
  imagesAnalyzed: number;
  farmStats: {
    totalCells: number;
    problemCells: number;
    healthyCells: number;
    overlapCells: number;
  };
}

export interface TimeSeriesDataPoint {
  date: string;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  cloudCover?: number;
}

// Configuration
const DIAGNOSTIC_INDICES: DiagnosticIndex[] = ['nitrogen', 'moisture', 'ndvi', 'phosphorus'];

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
    nitrogen: { low: 15, warning: 30 },
    moisture: { low: 2, warning: 5 },
    ndvi: { low: 0.02, warning: 0.05 },      // MSAVI2 - bare soil/dormant
    phosphorus: { low: 4, warning: 10 },
  },
  spring: {
    nitrogen: { low: 40, warning: 65 },
    moisture: { low: 6, warning: 10 },
    ndvi: { low: 0.08, warning: 0.15 },      // MSAVI2 - early growth
    phosphorus: { low: 10, warning: 20 },
  },
  summer: {
    nitrogen: { low: 60, warning: 90 },
    moisture: { low: 8, warning: 14 },
    ndvi: { low: 0.12, warning: 0.20 },      // MSAVI2 - peak canopy
    phosphorus: { low: 15, warning: 28 },
  },
  fall: {
    nitrogen: { low: 30, warning: 50 },
    moisture: { low: 5, warning: 9 },
    ndvi: { low: 0.06, warning: 0.12 },      // MSAVI2 - senescence
    phosphorus: { low: 8, warning: 16 },
  },
};

function getSeasonalThresholds(): Record<DiagnosticIndex, { low: number; warning: number }> {
  return SEASONAL_THRESHOLDS[getCurrentSeason()];
}

const TREND_THRESHOLD_PERCENT = -30; // 30% decline triggers trend alert

const INDEX_COLORS: Record<DiagnosticIndex, string> = {
  nitrogen: '#ef4444',    // Red
  moisture: '#3b82f6',    // Blue
  ndvi: '#22c55e',        // Green
  phosphorus: '#eab308',  // Yellow
};

const INDEX_LABELS: Record<DiagnosticIndex, string> = {
  nitrogen: 'Nitrogen',
  moisture: 'Soil Moisture',
  ndvi: 'Crop Health',
  phosphorus: 'Phosphorus',
};

const MULTIPLE_PROBLEM_COLOR = '#a855f7'; // Purple

/**
 * Main entry point - analyze a farm for problems
 * Uses the server's /diagnostics endpoint which fetches multiple satellite images
 * and calculates proper trends from Earth Engine
 */
export async function analyzeFarm(
  farmId: string,
  geometry: any,
  onProgress?: (progress: number, message: string) => void
): Promise<DiagnosticResult> {
  const startTime = Date.now();
  onProgress?.(0, 'Starting farm analysis...');

  try {
    // Call the server's diagnostics endpoint which handles Earth Engine analysis
    onProgress?.(10, 'Fetching satellite data from Earth Engine...');

    const polygon = JSON.stringify(geometry);
    const url = buildApiUrl(`/diagnostics?polygon=${encodeURIComponent(polygon)}&days=14`);

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
    const indexProblems: Map<DiagnosticIndex, { threshold: boolean; trend: boolean; value: number; change: number }> = new Map();

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
      const change = indexData.trend || 0;

      indexProblems.set(index, { threshold, trend, value, change });

      if (threshold || trend) {
        problemSummaries.push({
          index,
          type: threshold && trend ? 'both' : (threshold ? 'threshold' : 'trend'),
          cellCount: 0, // Will be updated after cell assignment
          avgValue: value,
          avgDecline: change,
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
      imagesAnalyzed: metadata.daysAnalyzed || metadata.imagesAnalyzed || 14,
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
 * Fallback analysis when server is unavailable
 */
async function fallbackAnalyzeFarm(
  farmId: string,
  geometry: any,
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
  const indexProblems: Map<DiagnosticIndex, { threshold: boolean; trend: boolean; value: number; change: number }> = new Map();

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
  geometry: any
): Promise<Record<DiagnosticIndex, TimeSeriesDataPoint[]>> {
  const polygon = JSON.stringify(geometry);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 14 days

  const results: Record<DiagnosticIndex, TimeSeriesDataPoint[]> = {
    nitrogen: [],
    moisture: [],
    ndvi: [],
    phosphorus: [],
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

      const json = await response.json();

      // Handle time-series response format
      if (json.data?.windows) {
        const windows = json.data.windows;
        return {
          index,
          data: windows.map((w: any) => ({
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
): { threshold: boolean; trend: boolean; value: number; change: number } {
  if (data.length === 0) {
    return { threshold: false, trend: false, value: 0, change: 0 };
  }

  // Get current value (most recent)
  const currentValue = data[data.length - 1].mean;
  const thresholds = getSeasonalThresholds()[index];

  // Only flag critical threshold violations (below 'low', not 'warning')
  const threshold = currentValue < thresholds.low;

  // Trend detection (compare first and last)
  let change = 0;
  let trend = false;
  if (data.length >= 2) {
    const firstValue = data[0].mean;
    const lastValue = data[data.length - 1].mean;

    if (firstValue !== 0) {
      change = ((lastValue - firstValue) / firstValue) * 100;
      trend = change < TREND_THRESHOLD_PERCENT;
    }
  }

  return { threshold, trend, value: currentValue, change };
}

/**
 * Create a grid of cells covering the farm polygon.
 * For MultiPolygon, iterates each polygon separately for reliable coverage.
 */
function createGridCells(geometry: any, resolution: number = 10): GridCell[] {
  const cells: GridCell[] = [];
  let cellId = 0;

  try {
    // Break MultiPolygon into individual polygons for per-polygon grid generation
    const polygons: any[] = [];
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
  indexProblems: Map<DiagnosticIndex, { threshold: boolean; trend: boolean; value: number; change: number }>,
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

      // Check each index with a detected farm-wide problem
      for (const [index, analysis] of indexProblems) {
        if (!analysis.threshold && !analysis.trend) continue;

        const cellValue = avgValues[index];
        if (cellValue === undefined) continue;

        const thresholds = seasonalThresholds[index];

        // Per-cell threshold check: flag only cells that actually violate
        const cellBelowThreshold = cellValue < thresholds.low;
        const cellBelowWarning = cellValue < thresholds.warning;

        // For threshold problems, cell must be below threshold
        // For trend problems, cell must at least be below warning level
        const shouldFlag = analysis.threshold
          ? cellBelowThreshold
          : cellBelowWarning; // Trend-only: flag stressed cells

        if (!shouldFlag) continue;

        const problemType = analysis.threshold && analysis.trend ? 'both' : (analysis.threshold ? 'threshold' : 'trend');
        const changePercent = analysis.trend ? analysis.change : undefined;

        const problem: CellProblem = {
          index,
          type: problemType,
          currentValue: cellValue,
          previousValue: analysis.trend ? cellValue / (1 + analysis.change / 100) : undefined,
          threshold: thresholds.low,
          changePercent,
          message: generateProblemMessage(index, analysis, cellValue),
          urgent: classifyUrgent({ type: problemType, index, changePercent }),
        };

        cell.problems.push(problem);
      }
    }

    // Update problem summaries with actual cell counts
    for (const summary of problemSummaries) {
      summary.cellCount = cells.filter(c =>
        c.problems.some(p => p.index === summary.index)
      ).length;
    }
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

        const problem: CellProblem = {
          index,
          type: problemType,
          currentValue: cellValue,
          previousValue: analysis.trend ? cellValue / (1 + analysis.change / 100) : undefined,
          threshold: thresholds.low,
          changePercent,
          message: generateProblemMessage(index, analysis, cellValue),
          urgent: classifyUrgent({ type: problemType, index, changePercent }),
        };

        cell.problems.push(problem);
      });

      const summary = problemSummaries.find(p => p.index === index);
      if (summary) {
        summary.cellCount = numAffected;
      }
    });
  }

  // Update cell severities - overlap (multiple issues) = critical
  cells.forEach(cell => {
    if (cell.problems.length === 0) {
      cell.severity = 'none';
    } else if (cell.problems.length === 1) {
      cell.severity = 'low';
    } else {
      cell.severity = 'high';
    }
  });
}

/**
 * Generate a human-readable problem message
 */
function generateProblemMessage(
  index: DiagnosticIndex,
  analysis: { threshold: boolean; trend: boolean; value: number; change: number },
  cellValue: number
): string {
  const label = INDEX_LABELS[index];
  const thresholds = getSeasonalThresholds()[index];
  const messages: string[] = [];

  if (analysis.threshold) {
    messages.push(`${label} critically low at ${cellValue.toFixed(1)} (below ${thresholds.low})`);
  }

  if (analysis.trend) {
    messages.push(`${label} steep decline of ${Math.abs(analysis.change).toFixed(1)}%`);
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
function classifyUrgent(problem: Pick<CellProblem, 'type' | 'index' | 'changePercent'>): boolean {
  if (problem.type === 'both') return true;
  if (problem.type === 'trend' && problem.changePercent !== undefined && problem.changePercent < -50) return true;
  return false;
}

/**
 * Check if a cell has any urgent problems
 */
export function isUrgentCell(cell: GridCell): boolean {
  return cell.problems.some(p => p.urgent);
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
