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

export interface CellProblem {
  index: DiagnosticIndex;
  type: 'threshold' | 'trend' | 'both';
  currentValue: number;
  previousValue?: number;
  threshold: number;
  changePercent?: number;
  message: string;
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

const THRESHOLDS: Record<DiagnosticIndex, { low: number; warning: number }> = {
  nitrogen: { low: 100, warning: 150 },     // kg N/ha
  moisture: { low: 15, warning: 25 },       // % volumetric
  ndvi: { low: 0.3, warning: 0.5 },         // index (0-1)
  phosphorus: { low: 30, warning: 50 },     // kg P₂O₅/ha
};

const TREND_THRESHOLD_PERCENT = -15; // 15% decline triggers trend alert

const INDEX_COLORS: Record<DiagnosticIndex, string> = {
  nitrogen: '#ef4444',    // Red
  moisture: '#3b82f6',    // Blue
  ndvi: '#22c55e',        // Green
  phosphorus: '#eab308',  // Yellow
};

const INDEX_LABELS: Record<DiagnosticIndex, string> = {
  nitrogen: 'Nitrogen',
  moisture: 'Moisture',
  ndvi: 'Vegetation (NDVI)',
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
    const url = buildApiUrl(`/diagnostics?polygon=${encodeURIComponent(polygon)}&images=10`);

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
    const cells = createGridCells(geometry, 30);
    onProgress?.(60, `Created ${cells.length} grid cells...`);

    // Map server analysis results to our format
    const problemSummaries: ProblemSummary[] = [];
    const indexProblems: Map<DiagnosticIndex, { threshold: boolean; trend: boolean; value: number; change: number }> = new Map();

    // Process server analysis results
    const analysis = serverResult.data?.analysis || serverResult.analysis || {};
    const serverProblems = serverResult.data?.problems || serverResult.problems || [];
    const metadata = serverResult.data?.metadata || serverResult.metadata || {};

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
      imagesAnalyzed: metadata.imagesAnalyzed || 10,
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
  const timeSeriesResults = await fetchAllIndicesTimeSeries(geometry, 10);
  onProgress?.(50, 'Analyzing data...');

  // Create grid cells for the farm
  const cells = createGridCells(geometry, 30);
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
  geometry: any,
  numImages: number
): Promise<Record<DiagnosticIndex, TimeSeriesDataPoint[]>> {
  const polygon = JSON.stringify(geometry);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 90 days

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
        const windows = json.data.windows.slice(-numImages); // Last N images
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
  const thresholds = THRESHOLDS[index];

  // Threshold detection
  const threshold = currentValue < thresholds.warning;

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
 * Create a grid of cells covering the farm polygon
 */
function createGridCells(geometry: any, resolution: number = 30): GridCell[] {
  const cells: GridCell[] = [];

  try {
    // Get bounding box
    const bboxArray = turf.bbox(geometry);
    const [minLng, minLat, maxLng, maxLat] = bboxArray;

    // Convert resolution to degrees (approximate)
    // 1 degree latitude ≈ 111km, adjust for latitude
    const latCenter = (minLat + maxLat) / 2;
    const cellSizeLat = resolution / 111000; // ~30m in degrees
    const cellSizeLng = resolution / (111000 * Math.cos(latCenter * Math.PI / 180));

    let cellId = 0;

    for (let lat = minLat; lat < maxLat; lat += cellSizeLat) {
      for (let lng = minLng; lng < maxLng; lng += cellSizeLng) {
        // Create cell polygon
        const cellPolygon = turf.bboxPolygon([lng, lat, lng + cellSizeLng, lat + cellSizeLat]);

        // Only include cells that intersect with farm polygon
        try {
          if (turf.booleanIntersects(cellPolygon, geometry)) {
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
  } catch (error) {
    console.error('[Diagnostics] Error creating grid cells:', error);
  }

  return cells;
}

/**
 * Assign problems to grid cells
 * In a real implementation, each cell would have its own pixel values.
 * For now, we simulate spatial variation.
 */
function assignProblemsToCells(
  cells: GridCell[],
  indexProblems: Map<DiagnosticIndex, { threshold: boolean; trend: boolean; value: number; change: number }>,
  problemSummaries: ProblemSummary[]
): void {
  // For demonstration, assign problems to a percentage of cells
  // In production, this would use actual per-pixel Earth Engine data

  indexProblems.forEach((analysis, index) => {
    if (!analysis.threshold && !analysis.trend) return;

    const thresholds = THRESHOLDS[index];

    // Simulate spatial variation - assign problems to ~30-50% of cells
    const affectedRatio = 0.3 + Math.random() * 0.2;
    const numAffected = Math.floor(cells.length * affectedRatio);

    // Randomly select cells to have this problem
    const shuffled = [...cells].sort(() => Math.random() - 0.5);
    const affectedCells = shuffled.slice(0, numAffected);

    affectedCells.forEach(cell => {
      // Simulate value variation around the mean
      const variation = (Math.random() - 0.5) * analysis.value * 0.3;
      const cellValue = analysis.value + variation;

      const problem: CellProblem = {
        index,
        type: analysis.threshold && analysis.trend ? 'both' : (analysis.threshold ? 'threshold' : 'trend'),
        currentValue: cellValue,
        previousValue: analysis.trend ? cellValue / (1 + analysis.change / 100) : undefined,
        threshold: thresholds.warning,
        changePercent: analysis.trend ? analysis.change : undefined,
        message: generateProblemMessage(index, analysis, cellValue),
      };

      cell.problems.push(problem);
    });

    // Update problem summary with cell count
    const summary = problemSummaries.find(p => p.index === index);
    if (summary) {
      summary.cellCount = numAffected;
    }
  });

  // Update cell severities
  cells.forEach(cell => {
    if (cell.problems.length === 0) {
      cell.severity = 'none';
    } else if (cell.problems.length === 1) {
      const problem = cell.problems[0];
      cell.severity = problem.type === 'both' ? 'high' : 'medium';
    } else {
      cell.severity = 'high'; // Multiple problems = high severity
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
  const thresholds = THRESHOLDS[index];
  const messages: string[] = [];

  if (analysis.threshold) {
    messages.push(`${label} is ${cellValue.toFixed(1)} (below ${thresholds.warning})`);
  }

  if (analysis.trend) {
    messages.push(`${label} declined ${Math.abs(analysis.change).toFixed(1)}% recently`);
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
    case 'high': return 0.7;
    case 'medium': return 0.5;
    case 'low': return 0.3;
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
 * Get thresholds for an index
 */
export function getIndexThresholds(index: DiagnosticIndex): { low: number; warning: number } {
  return THRESHOLDS[index];
}
