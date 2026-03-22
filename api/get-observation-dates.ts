/**
 * Observation Dates Endpoint for Vercel
 * Returns available satellite observation dates for a farm
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allowCors } from './_lib/cors';
import { successResponse, errorResponse } from './_lib/response';
import { initializeEarthEngine, evaluate, ee } from './_lib/earthEngine';
import { geoJsonToEarthEngine } from './_lib/satelliteUtils';

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

const SATELLITES = {
    SENTINEL2: { id: 'COPERNICUS/S2_SR_HARMONIZED', cloudProperty: 'CLOUDY_PIXEL_PERCENTAGE' },
    LANDSAT8: { id: 'LANDSAT/LC08/C02/T1_L2', cloudProperty: 'CLOUD_COVER' },
    LANDSAT9: { id: 'LANDSAT/LC09/C02/T1_L2', cloudProperty: 'CLOUD_COVER' },
};

async function getSatelliteDates(
    poi: any,
    startDate: string,
    endDate: string,
    satellite: { id: string; cloudProperty: string },
    name: string
): Promise<any[]> {
    try {
        const collection = ee.ImageCollection(satellite.id)
            .filterBounds(poi)
            .filterDate(startDate, endDate)
            .filter(ee.Filter.lt(satellite.cloudProperty, 100))
            .sort('system:time_start');

        const imageList = await evaluate(
            collection.map((img: any) => {
                return ee.Feature(null, {
                    'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
                    'timestamp': img.get('system:time_start'),
                    'cloud_cover': img.get(satellite.cloudProperty),
                    'satellite': name
                });
            }).aggregate_array('.all')
        );

        return imageList.filter((img: any) => img?.properties?.date).map((img: any) => ({
            date: img.properties.date,
            timestamp: img.properties.timestamp,
            cloud_cover: img.properties.cloud_cover,
            satellite: name,
        }));
    } catch (e) {
        console.warn(`[ObservationDates] Error querying ${name}:`, e);
        return [];
    }
}

async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return errorResponse(res, 'Method not allowed', 405);
    }

    try {
        await initializeEarthEngine();

        const farmId = (req.query.farm_id as string) || 'default';
        const months = parseInt(req.query.months as string || '6', 10);
        const polygon = req.query.polygon as string;

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 5);
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - months);

        const start = (req.query.start as string) || startDate.toISOString().split('T')[0];
        const end = (req.query.end as string) || endDate.toISOString().split('T')[0];

        console.log(`[ObservationDates] Processing farm ${farmId}, ${start} to ${end}`);

        let poi: any;
        if (polygon) {
            try {
                const polygonGeometry = JSON.parse(polygon);
                poi = geoJsonToEarthEngine(polygonGeometry);
            } catch (e: any) {
                console.warn('[ObservationDates] Failed to parse polygon, using default:', e.message);
                poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
            }
        } else {
            poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
        }

        // Query all satellites
        const [s2Dates, l8Dates, l9Dates] = await Promise.all([
            getSatelliteDates(poi, start, end, SATELLITES.SENTINEL2, 'Sentinel-2'),
            getSatelliteDates(poi, start, end, SATELLITES.LANDSAT8, 'Landsat-8'),
            getSatelliteDates(poi, start, end, SATELLITES.LANDSAT9, 'Landsat-9'),
        ]);

        const allDates = [...s2Dates, ...l8Dates, ...l9Dates];
        const today = new Date().toISOString().split('T')[0];
        const filteredDates = allDates.filter(d => d.date <= today);

        // Group by date
        const dateGroups: Record<string, any> = {};
        for (const obs of filteredDates) {
            if (!dateGroups[obs.date]) {
                dateGroups[obs.date] = {
                    observation_date: obs.date,
                    cloud_cover_percentage: obs.cloud_cover,
                    satellites: [],
                };
            }
            if (!dateGroups[obs.date].satellites.includes(obs.satellite)) {
                dateGroups[obs.date].satellites.push(obs.satellite);
            }
            if (obs.cloud_cover !== null && (dateGroups[obs.date].cloud_cover_percentage === null || obs.cloud_cover < dateGroups[obs.date].cloud_cover_percentage)) {
                dateGroups[obs.date].cloud_cover_percentage = obs.cloud_cover;
            }
        }

        const dates = Object.values(dateGroups).sort((a: any, b: any) =>
            new Date(b.observation_date).getTime() - new Date(a.observation_date).getTime()
        );

        return successResponse(res, {
            farm_id: farmId,
            total_dates: dates.length,
            total_observations: filteredDates.length,
            dates,
            date_list: dates.map((d: any) => d.observation_date),
            date_range: { start, end, today },
            metadata: {
                satellites: ['Sentinel-2', 'Landsat-8', 'Landsat-9'],
                note: 'Multi-satellite observation dates',
            },
        });
    } catch (error: any) {
        console.error('[ObservationDates] Error:', error);
        return errorResponse(res, error.message || 'Unknown error', 500);
    }
}

export default allowCors(handler);
