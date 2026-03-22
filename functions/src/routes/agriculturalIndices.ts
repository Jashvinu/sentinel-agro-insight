/**
 * Agricultural Indices Route
 * Calculates vegetation indices from satellite imagery
 */

import { Router, Request, Response } from 'express';
import ee from '@google/earthengine';
import { successResponse, errorResponse } from '../utils/response';
import { evaluate, getMapIdWithRetry } from '../utils/earthEngine';
import { geoJsonToEarthEngine, getMergedOpticalCollection } from '../shared/satelliteUtils';

const router = Router();

type OpticalSatellite = 'Sentinel-2' | 'Landsat-8' | 'Landsat-9';

const DEFAULT_POLYGON_COORDS = [[
    [77.77333199305133, 12.392392446684909],
    [77.77285377084087, 12.391034719901086],
    [77.77415744218291, 12.390603704636632],
    [77.77438732135664, 12.391302225016886],
    [77.77376792469431, 12.391501801924363],
    [77.77399141833513, 12.392187846379386],
    [77.77333199305133, 12.392392446684909]
]];

// Index calculation functions
const INDEX_CALCULATORS: Record<string, (image: any) => { index: any; vis: any }> = {
    ndvi: (image) => ({
        index: image.normalizedDifference(['B8', 'B4']).rename('ndvi'),
        vis: { min: 0, max: 1, palette: ['red', 'yellow', 'green'] }
    }),
    evi: (image) => ({
        index: image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            { NIR: image.select('B8'), RED: image.select('B4'), BLUE: image.select('B2') }
        ).rename('evi'),
        vis: { min: 0, max: 1, palette: ['red', 'yellow', 'green'] }
    }),
    savi: (image) => {
        const nir = image.select('B8');
        const red = image.select('B4');
        return {
            index: nir.subtract(red).divide(nir.add(red).add(0.5)).multiply(1.5).rename('savi'),
            vis: { min: 0, max: 1, palette: ['red', 'yellow', 'green'] }
        };
    },
    ndwi: (image) => ({
        index: image.normalizedDifference(['B3', 'B8']).rename('ndwi'),
        vis: { min: -0.5, max: 0.5, palette: ['brown', 'white', 'blue'] }
    }),
    gndvi: (image) => ({
        index: image.normalizedDifference(['B8', 'B3']).rename('gndvi'),
        vis: { min: 0, max: 0.8, palette: ['#8B4513', '#DAA520', '#228B22', '#006400'] }
    }),
    ndre: (image) => ({
        index: image.normalizedDifference(['B8', 'B5']).rename('ndre'),
        vis: { min: 0, max: 0.7, palette: ['#8B0000', '#FF8C00', '#32CD32', '#006400'] }
    }),
    moisture: (image) => {
        const ndmi = image.normalizedDifference(['B8', 'B11']);
        return {
            index: ndmi.multiply(45.2).subtract(8.7).rename('moisture'),
            vis: { min: 0, max: 50, palette: ['#92400e', '#eab308', '#93c5fd', '#1e40af'] }
        };
    },
    nitrogen: (image) => {
        const ndvi = image.normalizedDifference(['B8', 'B4']);
        return {
            index: ndvi.multiply(259.4).subtract(58.6).rename('nitrogen'),
            vis: { min: 0, max: 300, palette: ['#ef4444', '#f97316', '#eab308', '#22c55e'] }
        };
    },
    phosphorus: (image) => {
        const evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            { NIR: image.select('B8'), RED: image.select('B4'), BLUE: image.select('B2') }
        );
        return {
            index: evi.multiply(180).subtract(25).rename('phosphorus'),
            vis: { min: 0, max: 100, palette: ['#ef4444', '#f59e0b', '#22c55e'] }
        };
    },
    potassium: (image) => {
        const savi = image.normalizedDifference(['B8', 'B4']).add(0.5).multiply(1.5);
        return {
            index: savi.multiply(250).subtract(40).rename('potassium'),
            vis: { min: 0, max: 400, palette: ['#ef4444', '#eab308', '#22c55e'] }
        };
    },
};

router.get('/', async (req: Request, res: Response) => {
    try {
        const index = (req.query.index as string) || 'ndvi';
        const dateParam = req.query.date as string;
        const polygon = req.query.polygon as string;

        // Parse dates
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 5);
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 3);

        let start: string, end: string;
        if (dateParam) {
            start = dateParam;
            const nextDay = new Date(dateParam);
            nextDay.setDate(nextDay.getDate() + 1);
            end = nextDay.toISOString().split('T')[0];
        } else {
            start = (req.query.start as string) || startDate.toISOString().split('T')[0];
            end = (req.query.end as string) || endDate.toISOString().split('T')[0];
        }

        // Parse polygon
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

        console.log(`[AgriculturalIndices] Calculating ${index} from ${start} to ${end}`);

        // Get satellite collection
        const collection = getMergedOpticalCollection(poi, start, end);
        const imageCount = await evaluate(collection.size());

        if (imageCount === 0) {
            return errorResponse(res, 'No satellite imagery available for the specified parameters', 404);
        }

        // Create composite and calculate index
        const composite = collection.median();
        const calculator = INDEX_CALCULATORS[index] || INDEX_CALCULATORS.ndvi;
        const { index: indexImage, vis } = calculator(composite);

        // Get statistics
        const stats = await evaluate(
            indexImage.reduceRegion({
                reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
                geometry: poi,
                scale: 30,
                maxPixels: 1e9,
            })
        );

        // Get map tiles
        let mapData: any = null;
        try {
            mapData = await getMapIdWithRetry(indexImage.clip(poi), vis, 3, 1000);
        } catch (e) {
            console.warn(`[AgriculturalIndices] Could not get map:`, e);
        }

        return successResponse(res, {
            index,
            mean: stats[`${index}_mean`] || stats.mean || 0,
            stdDev: stats[`${index}_stdDev`] || stats.stdDev || 0,
            mapData,
            visualization: vis,
            metadata: {
                dateRange: { start, end },
                imageCount,
                scale: 30,
                satellites: ['Sentinel-2', 'Landsat-8', 'Landsat-9'],
            },
        });
    } catch (error: any) {
        console.error('[AgriculturalIndices] Error:', error);
        return errorResponse(res, error.message || 'Failed to calculate index', 500);
    }
});

export default router;
