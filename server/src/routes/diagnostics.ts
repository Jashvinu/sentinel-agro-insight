/**
 * Diagnostics Route
 * Analyzes satellite data to detect problem areas on farms.
 * Returns grid cells with problem indicators for map visualization.
 */

import { Router, Request, Response } from 'express';
import ee from '@google/earthengine';
import { successResponse, errorResponse } from '../utils/response.js';
import { evaluate, getMapIdWithRetry } from '../utils/earthEngine.js';
import { geoJsonToEarthEngine, getMergedOpticalCollection } from '../shared/satelliteUtils.js';

const router = Router();

// Diagnostic indices to analyze
const DIAGNOSTIC_INDICES = ['nitrogen', 'moisture', 'ndvi', 'phosphorus'];

// Thresholds for problem detection
const THRESHOLDS: Record<string, { low: number; warning: number }> = {
  nitrogen: { low: 60, warning: 90 },       // kg N/ha
  moisture: { low: 8, warning: 14 },        // % volumetric
  ndvi: { low: 0.15, warning: 0.25 },       // index (0-1)
  phosphorus: { low: 15, warning: 28 },     // kg P₂O₅/ha
};

// Trend detection threshold
const TREND_THRESHOLD_PERCENT = -30; // 30% decline triggers alert

// Index calculation functions
const INDEX_CALCULATORS: Record<string, (image: any) => any> = {
  ndvi: (image: any) => {
    const nir = image.select('B8');
    const red = image.select('B4');
    return nir.subtract(red).divide(nir.add(red)).rename('ndvi');
  },
  nitrogen: (image: any) => {
    const nir = image.select('B8');
    const red = image.select('B4');
    const ndvi = nir.subtract(red).divide(nir.add(red));
    // N = 259.4 × NDVI - 58.6
    return ndvi.multiply(259.4).subtract(58.6).rename('nitrogen');
  },
  moisture: (image: any) => {
    const nir = image.select('B8');
    const swir = image.select('B11');
    const ndmi = nir.subtract(swir).divide(nir.add(swir));
    // Moisture % = 45.2 × NDMI - 8.7
    return ndmi.multiply(45.2).subtract(8.7).rename('moisture');
  },
  phosphorus: (image: any) => {
    const nir = image.select('B8');
    const red = image.select('B4');
    const blue = image.select('B2');
    // EVI calculation
    const evi = image.expression(
      '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
      { NIR: nir, RED: red, BLUE: blue }
    );
    // P₂O₅ = 180 × EVI - 25
    return evi.multiply(180).subtract(25).rename('phosphorus');
  },
};

// Color palettes for visualization
const INDEX_PALETTES: Record<string, string[]> = {
  ndvi: ['#7f1d1d', '#dc2626', '#f97316', '#eab308', '#22c55e'],
  nitrogen: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
  moisture: ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e40af'],
  phosphorus: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
};

// Value ranges for visualization
const INDEX_RANGES: Record<string, { min: number; max: number }> = {
  ndvi: { min: 0, max: 1 },
  nitrogen: { min: 0, max: 300 },
  moisture: { min: 0, max: 50 },
  phosphorus: { min: 0, max: 100 },
};

/**
 * Pre-computed images shared across all indices
 */
interface PrecomputedImages {
  composite: any;
  firstImage: any;
  lastImage: any;
}

/**
 * Process a single index - extracted for parallel execution
 * Uses pre-computed images and parallelizes internal operations
 */
async function processIndex(
  index: string,
  precomputed: PrecomputedImages,
  eeGeometry: any,
  timings: Record<string, number>
): Promise<{
  index: string;
  result: any;
  problem: any | null;
}> {
  const calculator = INDEX_CALCULATORS[index];
  if (!calculator) {
    return { index, result: null, problem: null };
  }

  console.log(`[Diagnostics] Processing ${index}...`);
  const indexStart = Date.now();

  // Calculate index images from pre-computed base images
  const indexImage = calculator(precomputed.composite);
  const firstIndex = calculator(precomputed.firstImage);
  const lastIndex = calculator(precomputed.lastImage);

  // Visualization parameters (needed for map tile)
  const visParams = {
    min: INDEX_RANGES[index].min,
    max: INDEX_RANGES[index].max,
    palette: INDEX_PALETTES[index],
  };

  // Run all 4 operations in parallel for maximum performance
  const parallelOpsStart = Date.now();
  const [statsResult, firstStatsResult, lastStatsResult, mapResult] = await Promise.all([
    // 1. Composite statistics
    (async () => {
      const start = Date.now();
      const stats = await evaluate(
        indexImage.reduceRegion({
          reducer: ee.Reducer.mean()
            .combine(ee.Reducer.min(), '', true)
            .combine(ee.Reducer.max(), '', true)
            .combine(ee.Reducer.stdDev(), '', true),
          geometry: eeGeometry,
          scale: 10,
          maxPixels: 1e9,
        })
      );
      timings[`${index}_stats`] = Date.now() - start;
      console.log(`[Diagnostics] ${index} stats: ${timings[`${index}_stats`]}ms`);
      return stats;
    })(),

    // 2. First image statistics (for trend)
    (async () => {
      const start = Date.now();
      try {
        const stats = await evaluate(
          firstIndex.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: eeGeometry,
            scale: 10,
            maxPixels: 1e9,
          })
        );
        timings[`${index}_firstImage`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} first image: ${timings[`${index}_firstImage`]}ms`);
        return stats;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} first image failed:`, e);
        return null;
      }
    })(),

    // 3. Last image statistics (for trend)
    (async () => {
      const start = Date.now();
      try {
        const stats = await evaluate(
          lastIndex.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: eeGeometry,
            scale: 10,
            maxPixels: 1e9,
          })
        );
        timings[`${index}_lastImage`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} last image: ${timings[`${index}_lastImage`]}ms`);
        return stats;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} last image failed:`, e);
        return null;
      }
    })(),

    // 4. Map tile generation
    (async () => {
      const start = Date.now();
      try {
        const mapData = await getMapIdWithRetry(indexImage.clip(eeGeometry), visParams, 3, 1000);
        timings[`${index}_mapTile`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} map tile: ${timings[`${index}_mapTile`]}ms`);
        return mapData;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} map tile failed:`, e);
        return null;
      }
    })(),
  ]);

  console.log(`[Diagnostics] ${index} parallel ops: ${Date.now() - parallelOpsStart}ms`);

  // Extract statistics
  const stats = statsResult;
  const mean = stats[`${index}_mean`] || stats['mean'] || 0;
  const min = stats[`${index}_min`] || stats['min'] || 0;
  const max = stats[`${index}_max`] || stats['max'] || 0;
  const stdDev = stats[`${index}_stdDev`] || stats['stdDev'] || 0;

  // Check thresholds
  const threshold = THRESHOLDS[index];
  const belowThreshold = mean < threshold.warning;

  // Calculate trend from first/last stats
  let trend = 0;
  let trendDetected = false;

  if (firstStatsResult && lastStatsResult) {
    const firstMean = firstStatsResult[index] || firstStatsResult['mean'] || 0;
    const lastMean = lastStatsResult[index] || lastStatsResult['mean'] || 0;

    if (firstMean !== 0) {
      trend = ((lastMean - firstMean) / firstMean) * 100;
      trendDetected = trend < TREND_THRESHOLD_PERCENT;
    }
  }

  timings[`${index}_total`] = Date.now() - indexStart;
  console.log(`[Diagnostics] ${index} TOTAL: ${timings[`${index}_total`]}ms`);

  const result = {
    mean,
    min,
    max,
    stdDev,
    belowThreshold,
    trend,
    trendDetected,
    mapData: mapResult,
  };

  // Check if this is a problem
  let problem: any | null = null;
  if (belowThreshold || trendDetected) {
    problem = {
      index,
      type: belowThreshold && trendDetected ? 'both' : (belowThreshold ? 'threshold' : 'trend'),
      avgValue: mean,
      avgDecline: trendDetected ? trend : null,
      threshold: threshold.warning,
    };
  }

  return { index, result, problem };
}

/**
 * GET /diagnostics
 * Analyze a farm for problem areas
 */
router.get('/', async (req: Request, res: Response) => {
  const requestStart = Date.now();
  console.log('[Diagnostics] Request started');

  try {
    const polygonParam = req.query.polygon as string;
    const indicesParam = (req.query.indices as string) || DIAGNOSTIC_INDICES.join(',');
    const numDays = parseInt(req.query.days as string) || 14;

    if (!polygonParam) {
      return errorResponse(res, 'polygon parameter is required', 400);
    }

    // Parse polygon
    let geometry: any;
    try {
      geometry = JSON.parse(polygonParam);
    } catch (e) {
      return errorResponse(res, 'Invalid polygon JSON', 400);
    }

    // Convert to Earth Engine geometry
    const eeGeometry = geoJsonToEarthEngine(geometry);

    // Parse requested indices
    const indices = indicesParam.split(',').filter(i => DIAGNOSTIC_INDICES.includes(i));
    console.log(`[Diagnostics] Processing indices: ${indices.join(', ')}`);

    // Calculate date range (last N days)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`[Diagnostics] Date range: ${startDate} to ${endDate} (${numDays} days)`);

    // Fetch satellite imagery
    const collectionStart = Date.now();
    const collection = getMergedOpticalCollection(eeGeometry, startDate, endDate);

    // Sort by date (use all images within date range)
    const sortedCollection = collection.sort('system:time_start', false);
    console.log(`[Diagnostics] Collection setup: ${Date.now() - collectionStart}ms`);

    // Pre-compute shared images ONCE (instead of per-index)
    const precomputeStart = Date.now();
    const precomputed: PrecomputedImages = {
      composite: sortedCollection.median(),
      firstImage: sortedCollection.sort('system:time_start', true).first(),
      lastImage: sortedCollection.sort('system:time_start', false).first(),
    };
    console.log(`[Diagnostics] Pre-computed shared images: ${Date.now() - precomputeStart}ms`);

    // Process all indices in parallel for performance
    const timings: Record<string, number> = {};
    const parallelStart = Date.now();
    console.log(`[Diagnostics] Starting parallel processing of ${indices.length} indices...`);

    const results = await Promise.all(
      indices.map(index => processIndex(index, precomputed, eeGeometry, timings))
    );

    console.log(`[Diagnostics] Parallel processing complete: ${Date.now() - parallelStart}ms`);

    // Collect results
    const analysisResults: Record<string, any> = {};
    const problems: any[] = [];

    for (const { index, result, problem } of results) {
      if (result) {
        analysisResults[index] = result;
      }
      if (problem) {
        problems.push(problem);
      }
    }

    // Log timing summary
    const totalTime = Date.now() - requestStart;
    console.log('[Diagnostics] === TIMING SUMMARY ===');
    console.log(`[Diagnostics] Total request time: ${totalTime}ms`);
    console.log('[Diagnostics] Per-index breakdown:');
    for (const index of indices) {
      console.log(`[Diagnostics]   ${index}: ${timings[`${index}_total`] || 'N/A'}ms (stats: ${timings[`${index}_stats`] || 'N/A'}ms, first: ${timings[`${index}_firstImage`] || 'N/A'}ms, last: ${timings[`${index}_lastImage`] || 'N/A'}ms, map: ${timings[`${index}_mapTile`] || 'N/A'}ms)`);
    }
    console.log('[Diagnostics] ======================');

    // Build response
    return successResponse(res, {
      analysis: analysisResults,
      problems,
      metadata: {
        daysAnalyzed: numDays,
        dateRange: { start: startDate, end: endDate },
        resolution: '10m',
        indices: indices,
        processingTimeMs: totalTime,
      },
    });
  } catch (error: any) {
    const totalTime = Date.now() - requestStart;
    console.error(`[Diagnostics] Error after ${totalTime}ms:`, error);
    return errorResponse(res, error.message || 'Failed to analyze farm', 500);
  }
});

export default router;
