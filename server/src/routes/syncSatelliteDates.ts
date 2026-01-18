// Sync Satellite Dates API - Express Route
// Queries Earth Engine for available satellite observations

import { Router, Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response.js';
import { evaluate, ee } from '../utils/earthEngine.js';
import { getAllSatelliteDates, geoJsonToEarthEngine } from '../shared/satelliteUtils.js';

const router = Router();

// Default polygon coordinates (Jash Farm)
const DEFAULT_POLYGON_COORDS = [[
  [77.77333199305133, 12.392392446684909],
  [77.77285377084087, 12.391034719901086],
  [77.77415744218291, 12.390603704636632],
  [77.77438732135664, 12.391302225016886],
  [77.77376792469431, 12.391501801924363],
  [77.77399141833513, 12.392187846379386],
  [77.77333199305133, 12.392392446684909]
]];

// In-memory cache for observations (no database)
const observationCache: Map<string, {
  dates: any[];
  lastUpdated: Date;
}> = new Map();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

router.get('/', handleSync);
router.post('/', handleSync);

async function handleSync(req: Request, res: Response) {
  try {
    const farmId = (req.query.farm_id as string) || 'df43eedf-850d-454c-9fbf-36a052be10c0';
    const months = parseInt(req.query.months as string || '6', 10);
    const polygon = req.query.polygon as string || (req.body?.polygon ? JSON.stringify(req.body.polygon) : undefined);
    const dryRun = req.query.dry_run === 'true';

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - months);

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    console.log(`[SyncSatelliteDates] Processing farm ${farmId}, ${start} to ${end}, dry_run=${dryRun}`);

    // Check cache first
    const cacheKey = `${farmId}-${start}-${end}`;
    const cached = observationCache.get(cacheKey);
    if (cached && (Date.now() - cached.lastUpdated.getTime()) < CACHE_TTL_MS) {
      console.log(`[SyncSatelliteDates] Cache hit for ${cacheKey}`);
      return successResponse(res, {
        dry_run: dryRun,
        date_range: { start, end },
        farms_processed: 1,
        summary: {
          total_images_found: cached.dates.length,
          new_observations: 0,
          inserted: 0,
          skipped_existing: cached.dates.length,
          cached: true
        },
        farms: [{
          farm_id: farmId,
          farm_name: 'Farm',
          total_images_found: cached.dates.length,
          new_observations: 0,
          inserted: 0,
          sample_dates: cached.dates.slice(0, 5)
        }]
      });
    }

    // Parse polygon
    let poi: any;
    if (polygon) {
      try {
        const polygonGeometry = JSON.parse(polygon);
        if ((polygonGeometry.type === 'Polygon' || polygonGeometry.type === 'MultiPolygon') && polygonGeometry.coordinates) {
          poi = geoJsonToEarthEngine(polygonGeometry);
        } else {
          throw new Error('Invalid polygon format');
        }
      } catch (e: any) {
        console.warn('[SyncSatelliteDates] Failed to parse polygon, using default:', e.message);
        poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
      }
    } else {
      poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
    }

    // Query Earth Engine for all satellite dates
    const allDates = await getAllSatelliteDates(poi, start, end, evaluate, 100);

    // Filter out future dates
    const today = new Date().toISOString().split('T')[0];
    const filteredDates = allDates.filter(d => d.date <= today);

    // Group by satellite
    const satelliteCounts = filteredDates.reduce((acc: Record<string, number>, item) => {
      acc[item.satellite] = (acc[item.satellite] || 0) + 1;
      return acc;
    }, {});

    // Cache the results
    if (!dryRun) {
      observationCache.set(cacheKey, {
        dates: filteredDates,
        lastUpdated: new Date()
      });
    }

    // Sample new dates for response
    const sampleDates = filteredDates.slice(-10).map(d => ({
      date: d.date,
      cloud_cover: d.cloud_cover,
      satellite: d.satellite,
      tile: d.tile_id,
      indices: d.available_indices
    }));

    successResponse(res, {
      dry_run: dryRun,
      date_range: { start, end },
      farms_processed: 1,
      summary: {
        total_images_found: filteredDates.length,
        new_observations: filteredDates.length,
        inserted: dryRun ? 0 : filteredDates.length,
        skipped_existing: 0,
        satellite_breakdown: satelliteCounts
      },
      farms: [{
        farm_id: farmId,
        farm_name: 'Farm',
        total_images_found: filteredDates.length,
        new_observations: filteredDates.length,
        inserted: dryRun ? 0 : filteredDates.length,
        sample_new_dates: sampleDates
      }]
    });

  } catch (error: any) {
    console.error('[SyncSatelliteDates] Error:', error);
    errorResponse(res, error.message || 'Unknown error', 500, error);
  }
}

export default router;
