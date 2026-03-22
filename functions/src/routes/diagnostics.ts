/**
 * Diagnostics Route
 * Analyzes satellite data to detect problem areas on farms
 */

import { Router, Request, Response } from 'express';
import ee from '@google/earthengine';
import { successResponse, errorResponse } from '../utils/response';
import { evaluate, getMapIdWithRetry } from '../utils/earthEngine';
import { geoJsonToEarthEngine, getMergedOpticalCollection } from '../shared/satelliteUtils';

const router = Router();

const DIAGNOSTIC_INDICES = ['nitrogen', 'moisture', 'ndvi', 'phosphorus'];

const THRESHOLDS: Record<string, { low: number; warning: number }> = {
    nitrogen: { low: 100, warning: 150 },
    moisture: { low: 15, warning: 25 },
    ndvi: { low: 0.3, warning: 0.5 },
    phosphorus: { low: 30, warning: 50 },
};

const TREND_THRESHOLD_PERCENT = -15;

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
        return ndvi.multiply(259.4).subtract(58.6).rename('nitrogen');
    },
    moisture: (image: any) => {
        const nir = image.select('B8');
        const swir = image.select('B11');
        const ndmi = nir.subtract(swir).divide(nir.add(swir));
        return ndmi.multiply(45.2).subtract(8.7).rename('moisture');
    },
    phosphorus: (image: any) => {
        const nir = image.select('B8');
        const red = image.select('B4');
        const blue = image.select('B2');
        const evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            { NIR: nir, RED: red, BLUE: blue }
        );
        return evi.multiply(180).subtract(25).rename('phosphorus');
    },
};

const INDEX_PALETTES: Record<string, string[]> = {
    ndvi: ['#7f1d1d', '#dc2626', '#f97316', '#eab308', '#22c55e'],
    nitrogen: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
    moisture: ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e40af'],
    phosphorus: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
};

const INDEX_RANGES: Record<string, { min: number; max: number }> = {
    ndvi: { min: 0, max: 1 },
    nitrogen: { min: 0, max: 300 },
    moisture: { min: 0, max: 50 },
    phosphorus: { min: 0, max: 100 },
};

router.get('/', async (req: Request, res: Response) => {
    try {
        const polygonParam = req.query.polygon as string;
        const indicesParam = (req.query.indices as string) || DIAGNOSTIC_INDICES.join(',');
        const numImages = parseInt(req.query.images as string) || 10;

        if (!polygonParam) {
            return errorResponse(res, 'polygon parameter is required', 400);
        }

        let geometry: any;
        try {
            geometry = JSON.parse(polygonParam);
        } catch (e) {
            return errorResponse(res, 'Invalid polygon JSON', 400);
        }

        const eeGeometry = geoJsonToEarthEngine(geometry);
        const indices = indicesParam.split(',').filter(i => DIAGNOSTIC_INDICES.includes(i));

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const collection = getMergedOpticalCollection(eeGeometry, startDate, endDate);
        const sortedCollection = collection.sort('system:time_start', false).limit(numImages);

        const analysisResults: Record<string, any> = {};
        const problems: any[] = [];

        for (const index of indices) {
            const calculator = INDEX_CALCULATORS[index];
            if (!calculator) continue;

            const composite = sortedCollection.median();
            const indexImage = calculator(composite);

            const stats = await evaluate(
                indexImage.reduceRegion({
                    reducer: ee.Reducer.mean()
                        .combine(ee.Reducer.min(), '', true)
                        .combine(ee.Reducer.max(), '', true)
                        .combine(ee.Reducer.stdDev(), '', true),
                    geometry: eeGeometry,
                    scale: 30,
                    maxPixels: 1e9,
                })
            );

            const mean = stats[`${index}_mean`] || stats['mean'] || 0;
            const min = stats[`${index}_min`] || stats['min'] || 0;
            const max = stats[`${index}_max`] || stats['max'] || 0;
            const stdDev = stats[`${index}_stdDev`] || stats['stdDev'] || 0;

            const threshold = THRESHOLDS[index];
            const belowThreshold = mean < threshold.warning;

            let trend = 0;
            let trendDetected = false;

            try {
                const firstImage = sortedCollection.sort('system:time_start', true).first();
                const lastImage = sortedCollection.sort('system:time_start', false).first();

                const firstStats = await evaluate(
                    calculator(firstImage).reduceRegion({
                        reducer: ee.Reducer.mean(),
                        geometry: eeGeometry,
                        scale: 30,
                        maxPixels: 1e9,
                    })
                );

                const lastStats = await evaluate(
                    calculator(lastImage).reduceRegion({
                        reducer: ee.Reducer.mean(),
                        geometry: eeGeometry,
                        scale: 30,
                        maxPixels: 1e9,
                    })
                );

                const firstMean = firstStats[index] || firstStats['mean'] || 0;
                const lastMean = lastStats[index] || lastStats['mean'] || 0;

                if (firstMean !== 0) {
                    trend = ((lastMean - firstMean) / firstMean) * 100;
                    trendDetected = trend < TREND_THRESHOLD_PERCENT;
                }
            } catch (e) {
                console.warn(`[Diagnostics] Could not calculate trend for ${index}:`, e);
            }

            const visParams = {
                min: INDEX_RANGES[index].min,
                max: INDEX_RANGES[index].max,
                palette: INDEX_PALETTES[index],
            };

            let mapData: any = null;
            try {
                mapData = await getMapIdWithRetry(indexImage.clip(eeGeometry), visParams, 3, 1000);
            } catch (e) {
                console.warn(`[Diagnostics] Could not get map for ${index}:`, e);
            }

            analysisResults[index] = { mean, min, max, stdDev, belowThreshold, trend, trendDetected, mapData };

            if (belowThreshold || trendDetected) {
                problems.push({
                    index,
                    type: belowThreshold && trendDetected ? 'both' : (belowThreshold ? 'threshold' : 'trend'),
                    avgValue: mean,
                    avgDecline: trendDetected ? trend : null,
                    threshold: threshold.warning,
                });
            }
        }

        return successResponse(res, {
            analysis: analysisResults,
            problems,
            metadata: {
                imagesAnalyzed: numImages,
                dateRange: { start: startDate, end: endDate },
                resolution: '30m',
                indices,
            },
        });
    } catch (error: any) {
        console.error('[Diagnostics] Error:', error);
        return errorResponse(res, error.message || 'Failed to analyze farm', 500);
    }
});

export default router;
