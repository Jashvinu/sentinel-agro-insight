/**
 * Sync Satellite Dates Route
 * Queries Earth Engine for available satellite observations
 */

import { Router, Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response';
import { evaluate, ee } from '../utils/earthEngine';
import { geoJsonToEarthEngine } from '../shared/satelliteUtils';

const router = Router();

const DEFAULT_POLYGON_COORDS = [[
    [77.77333199305133, 12.392392446684909],
    [77.77285377084087, 12.391034719901086],
    [77.77415744218291, 12.390603704636632],
    [77.77438732135664, 12.391302225016886],
    [77.77376792469431, 12.391501801924363],
    [77.77399141833513, 12.392187846379386],
    [77.77333199305133, 12.392392446684909]
]];

const observationCache: Map<string, { dates: any[]; lastUpdated: Date }> = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

const SATELLITES = {
    SENTINEL2: { id: 'COPERNICUS/S2_SR_HARMONIZED', cloudProperty: 'CLOUDY_PIXEL_PERCENTAGE' },
    LANDSAT8: { id: 'LANDSAT/LC08/C02/T1_L2', cloudProperty: 'CLOUD_COVER' },
    LANDSAT9: { id: 'LANDSAT/LC09/C02/T1_L2', cloudProperty: 'CLOUD_COVER' },
};

async function getSatelliteDates(poi: any, startDate: string, endDate: string): Promise<any[]> {
    const allDates: any[] = [];

    for (const [name, config] of Object.entries(SATELLITES)) {
        try {
            const collection = ee.ImageCollection(config.id)
                .filterBounds(poi)
                .filterDate(startDate, endDate)
                .filter(ee.Filter.lt(config.cloudProperty, 100));

            const imageList = await evaluate(
                collection.map((img: any) => ee.Feature(null, {
                    'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
                    'timestamp': img.get('system:time_start'),
                    'cloud_cover': img.get(config.cloudProperty),
                    'satellite': name.replace(/([A-Z])/g, '-$1').replace(/^-/, '').replace('SENTINEL', 'Sentinel').replace('LANDSAT', 'Landsat')
                })).aggregate_array('.all')
            );

            for (const img of imageList) {
                if (img?.properties?.date) {
                    allDates.push({
                        date: img.properties.date,
                        timestamp: img.properties.timestamp,
                        cloud_cover: img.properties.cloud_cover,
                        satellite: img.properties.satellite,
                    });
                }
            }
        } catch (e) {
            console.warn(`[SyncSatelliteDates] Error querying ${name}:`, e);
        }
    }

    return allDates.sort((a, b) => a.timestamp - b.timestamp);
}

router.get('/', handleSync);
router.post('/', handleSync);

async function handleSync(req: Request, res: Response) {
    try {
        const farmId = (req.query.farm_id as string) || 'default';
        const months = parseInt(req.query.months as string || '6', 10);
        const polygon = req.query.polygon as string || (req.body?.polygon ? JSON.stringify(req.body.polygon) : undefined);
        const dryRun = req.query.dry_run === 'true';

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - months);

        const start = startDate.toISOString().split('T')[0];
        const end = endDate.toISOString().split('T')[0];

        console.log(`[SyncSatelliteDates] Processing farm ${farmId}, ${start} to ${end}`);

        const cacheKey = `${farmId}-${start}-${end}`;
        const cached = observationCache.get(cacheKey);
        if (cached && (Date.now() - cached.lastUpdated.getTime()) < CACHE_TTL_MS) {
            return successResponse(res, {
                dry_run: dryRun,
                date_range: { start, end },
                summary: { total_images_found: cached.dates.length, cached: true },
            });
        }

        let poi: any;
        if (polygon) {
            try {
                poi = geoJsonToEarthEngine(JSON.parse(polygon));
            } catch (e) {
                poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
            }
        } else {
            poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
        }

        const allDates = await getSatelliteDates(poi, start, end);
        const today = new Date().toISOString().split('T')[0];
        const filteredDates = allDates.filter(d => d.date <= today);

        if (!dryRun) {
            observationCache.set(cacheKey, { dates: filteredDates, lastUpdated: new Date() });
        }

        const satelliteCounts = filteredDates.reduce((acc: Record<string, number>, item) => {
            acc[item.satellite] = (acc[item.satellite] || 0) + 1;
            return acc;
        }, {});

        return successResponse(res, {
            dry_run: dryRun,
            date_range: { start, end },
            farms_processed: 1,
            summary: {
                total_images_found: filteredDates.length,
                satellite_breakdown: satelliteCounts,
            },
            farms: [{
                farm_id: farmId,
                total_images_found: filteredDates.length,
                sample_dates: filteredDates.slice(-10),
            }],
        });
    } catch (error: any) {
        console.error('[SyncSatelliteDates] Error:', error);
        return errorResponse(res, error.message || 'Unknown error', 500);
    }
}

export default router;
