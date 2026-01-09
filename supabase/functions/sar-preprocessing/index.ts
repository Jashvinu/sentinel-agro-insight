/**
 * SAR Preprocessing Edge Function
 * Processes Sentinel-1 SAR data with speckle filtering and terrain correction
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import ee from 'npm:@google/earthengine@1.6.13';
import {
    getSentinel1Collection,
    calculateSARTemporalStats,
    type SARPreprocessingConfig,
} from '../_shared/sar-algorithms.ts';
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
interface SARRequest {
    polygon: GeoJSON.Geometry;
    startDate: string;
    endDate: string;
    polarization?: 'VV' | 'VH' | 'BOTH';
    orbitDirection?: 'ASCENDING' | 'DESCENDING' | 'BOTH';
    applySpeckleFilter?: boolean;
    filterType?: 'REFINED_LEE' | 'BOXCAR';
}

function validateRequest(body: any): SARRequest {
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
        polarization: body.polarization || 'VV',
        orbitDirection: body.orbitDirection || 'BOTH',
        applySpeckleFilter: body.applySpeckleFilter !== undefined ? body.applySpeckleFilter : true,
        filterType: body.filterType || 'REFINED_LEE',
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

        // Build SAR preprocessing configuration
        const sarConfig: SARPreprocessingConfig = {
            polarization: request.polarization,
            orbitDirection: request.orbitDirection,
            applySpeckleFilter: request.applySpeckleFilter,
            filterType: request.filterType,
        };

        // Get preprocessed SAR collection
        const sarCollection = getSentinel1Collection(
            geometry,
            request.startDate,
            request.endDate,
            sarConfig
        );

        // Get collection info
        const imageCount = await sarCollection.size().getInfo();

        // Get orbit passes
        const orbits = await sarCollection
            .aggregate_array('orbitProperties_pass')
            .distinct()
            .getInfo();

        // Calculate statistics for primary polarization
        let stats = null;
        if (request.polarization === 'VV' || request.polarization === 'BOTH') {
            stats = calculateSARTemporalStats(sarCollection, geometry, 'VV');
        } else {
            stats = calculateSARTemporalStats(sarCollection, geometry, 'VH');
        }

        // Build response
        const responseData = {
            success: true,
            data: {
                collectionInfo: {
                    imageCount: imageCount,
                    dateRange: {
                        start: request.startDate,
                        end: request.endDate,
                    },
                    orbits: orbits,
                },
                preprocessingParams: {
                    thermalNoiseRemoved: true, // S1 GRD product has thermal noise removed
                    radiometricCalibration: 'Sigma0',
                    terrainCorrected: true, // S1 GRD is terrain corrected
                    speckleFilterApplied: request.applySpeckleFilter,
                    filterType: request.filterType,
                },
                sampleStatistics: {
                    [request.polarization === 'VH' ? 'VH' : 'VV']: stats,
                },
            },
        };

        return successResponse(responseData);
    } catch (error) {
        console.error('SAR preprocessing error:', error);
        return errorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            500
        );
    }
});
