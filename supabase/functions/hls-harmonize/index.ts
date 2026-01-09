/**
 * HLS Harmonization Edge Function
 * Demonstrates multi-sensor fusion with spectral bandpass adjustment
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import ee from 'npm:@google/earthengine@1.6.13';
import {
    harmonizeToHLS,
    getMergedOpticalCollectionHLS,
    type HLSConfig,
} from '../_shared/hls-harmonization.ts';
import { geoJsonToEarthEngine } from '../_shared/satellite-utils.ts';

// Earth Engine authentication
async function authenticateEarthEngine() {
    const credentials = Deno.env.get('GOOGLE_CREDENTIALS_JSON');
    if (!credentials) {
        throw new Error('GOOGLE_CREDENTIALS_JSON environment variable not set');
    }

    const parsedCredentials = JSON.parse(credentials);
    await ee.data.authenticateViaPrivateKey(parsedCredentials);
    await ee.initialize();
}

// Request validation
interface HLSRequest {
    polygon: GeoJSON.Geometry;
    startDate: string;
    endDate: string;
    targetResolution?: number;
    applyBRDF?: boolean;
    applySpectralAdjustment?: boolean;
    cloudCoverThreshold?: number;
}

function validateRequest(body: any): HLSRequest {
    if (!body.polygon) {
        throw new Error('Missing required field: polygon');
    }
    if (!body.startDate || !body.endDate) {
        throw new Error('Missing required fields: startDate, endDate');
    }

    return {
        polygon: body.polygon,
        startDate: body.startDate,
        endDate: body.endDate,
        targetResolution: body.targetResolution || 30,
        applyBRDF: body.applyBRDF !== undefined ? body.applyBRDF : true,
        applySpectralAdjustment: body.applySpectralAdjustment !== undefined
            ? body.applySpectralAdjustment
            : true,
        cloudCoverThreshold: body.cloudCoverThreshold || 20,
    };
}

// Main handler
Deno.serve(async (req: Request) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return handleCors(req);
    }

    try {
        // Parse request
        const body = await req.json();
        const request = validateRequest(body);

        // Authenticate with Earth Engine
        await authenticateEarthEngine();

        // Convert GeoJSON to Earth Engine geometry
        const geometry = geoJsonToEarthEngine(request.polygon);

        // Build HLS configuration
        const hlsConfig: HLSConfig = {
            targetResolution: request.targetResolution,
            applyBRDF: request.applyBRDF,
            applySpectralAdjustment: request.applySpectralAdjustment,
        };

        // Get merged and harmonized optical collection
        const harmonizedCollection = getMergedOpticalCollectionHLS(
            geometry,
            request.startDate,
            request.endDate,
            request.cloudCoverThreshold,
            hlsConfig
        );

        // Get collection info
        const imageCount = await harmonizedCollection.size().getInfo();

        // Calculate sample statistics from first image
        const firstImage = harmonizedCollection.first();
        const sampleStats = await firstImage.reduceRegion({
            reducer: ee.Reducer.mean()
                .combine(ee.Reducer.stdDev(), '', true),
            geometry: geometry,
            scale: request.targetResolution,
            maxPixels: 1e8,
        }).getInfo();

        // Extract statistics for each band
        const bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
        const statistics: Record<string, { mean: number; stdDev: number }> = {};

        bands.forEach((band) => {
            statistics[band] = {
                mean: sampleStats[`${band}_mean`] || 0,
                stdDev: sampleStats[`${band}_stdDev`] || 0,
            };
        });

        // Build response
        const responseData = {
            success: true,
            data: {
                collectionInfo: {
                    imageCount: imageCount,
                    sensors: ['Sentinel-2', 'Landsat-8', 'Landsat-9'],
                    dateRange: {
                        start: request.startDate,
                        end: request.endDate,
                    },
                },
                harmonizationParams: {
                    targetResolution: request.targetResolution,
                    targetProjection: hlsConfig.targetProjection || 'EPSG:32643',
                    brdfApplied: request.applyBRDF,
                    spectralAdjustmentApplied: request.applySpectralAdjustment,
                },
                sampleStatistics: statistics,
            },
        };

        return successResponse(responseData);
    } catch (error) {
        console.error('HLS harmonization error:', error);
        return errorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            500
        );
    }
});
