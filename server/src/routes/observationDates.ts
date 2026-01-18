// Get Observation Dates API - Express Route
// Returns available satellite observation dates for a farm

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const farmId = (req.query.farm_id as string) || 'df43eedf-850d-454c-9fbf-36a052be10c0';
    const months = parseInt(req.query.months as string || '6', 10);
    const polygon = req.query.polygon as string;

    // Calculate date range
    const endDate = new Date();
    // Add 5-day buffer for satellite processing
    endDate.setDate(endDate.getDate() - 5);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - months);

    const start = (req.query.start as string) || startDate.toISOString().split('T')[0];
    const end = (req.query.end as string) || endDate.toISOString().split('T')[0];

    console.log(`[ObservationDates] Processing farm ${farmId}, ${start} to ${end}`);

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
        console.warn('[ObservationDates] Failed to parse polygon, using default:', e.message);
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

    // Group by date
    const dateGroups: Record<string, {
      observation_date: string;
      cloud_cover_percentage: number | null;
      tile_id?: string;
      satellites: string[];
      satellite_details: Array<{ name: string; indices: string[] }>;
    }> = {};

    for (const obs of filteredDates) {
      if (!dateGroups[obs.date]) {
        dateGroups[obs.date] = {
          observation_date: obs.date,
          cloud_cover_percentage: obs.cloud_cover,
          tile_id: obs.tile_id,
          satellites: [],
          satellite_details: []
        };
      }

      if (!dateGroups[obs.date].satellites.includes(obs.satellite)) {
        dateGroups[obs.date].satellites.push(obs.satellite);
        dateGroups[obs.date].satellite_details.push({
          name: obs.satellite,
          indices: obs.available_indices
        });
      }

      // Update cloud cover to minimum if multiple observations
      if (obs.cloud_cover !== null && (dateGroups[obs.date].cloud_cover_percentage === null || obs.cloud_cover < dateGroups[obs.date].cloud_cover_percentage!)) {
        dateGroups[obs.date].cloud_cover_percentage = obs.cloud_cover;
      }
    }

    const dates = Object.values(dateGroups).sort((a, b) =>
      new Date(b.observation_date).getTime() - new Date(a.observation_date).getTime()
    );

    successResponse(res, {
      farm_id: farmId,
      total_dates: dates.length,
      total_observations: filteredDates.length,
      dates: dates,
      date_list: dates.map(d => d.observation_date),
      date_range: {
        start,
        end,
        today: new Date().toISOString().split('T')[0]
      },
      metadata: {
        satellites: ['Sentinel-2', 'Landsat-8', 'Landsat-9', 'Sentinel-1 SAR'],
        note: 'Multi-satellite observation dates',
        filter_applied: false
      }
    });

  } catch (error: any) {
    console.error('[ObservationDates] Error:', error);
    errorResponse(res, error.message || 'Unknown error', 500, error);
  }
});

export default router;
