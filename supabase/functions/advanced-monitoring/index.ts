/**
 * Advanced Monitoring Edge Function
 * Main orchestrator for multi-algorithm analysis with trend detection
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ee from 'npm:@google/earthengine@1.6.13';

// Import algorithm libraries
import {
    getMergedOpticalCollectionHLS,
    type HLSConfig,
} from '../_shared/hls-harmonization.ts';
import {
    calculateOPTRAM,
    calculatePCANutrients,
    estimateNitrogen,
} from '../_shared/optical-algorithms.ts';
import {
    getSentinel1Collection,
    detectSARMoistureChange,
    calculateSARTemporalStats,
    type SARPreprocessingConfig,
} from '../_shared/sar-algorithms.ts';
import { fuseMoistureEstimates } from '../_shared/sensor-fusion.ts';
import { analyzeTrend, validateTimeSeries } from '../_shared/trend-analysis.ts';
import {
    splitIntoWindows,
    validateDateRange,
    DEFAULT_WINDOW_CONFIG,
} from '../_shared/window-manager.ts';
import { geoJsonToEarthEngine, evaluate } from '../_shared/satellite-utils.ts';

// Earth Engine authentication (callback-based to avoid Deno.openSync blockage)
function authenticateEarthEngine(serviceAccount: any): Promise<void> {
    return new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            serviceAccount,
            () =>
                ee.initialize(
                    null,
                    null,
                    () => resolve(),
                    (error: any) => reject(new Error(error))
                ),
            (error: any) => reject(new Error(error))
        );
    });
}

// Request validation
interface AdvancedMonitoringRequest {
    polygon: GeoJSON.Geometry;
    farmId: string;
    startDate: string;
    endDate: string;
    algorithms: string[];
    includeTrends?: boolean;
    aggregationLevel?: 'pixel' | 'grid' | 'zone';
    windowSizeDays?: number;
}

function validateRequest(body: any): AdvancedMonitoringRequest {
    if (!body.polygon) {
        throw new Error('Missing required field: polygon');
    }
    if (!body.farmId) {
        throw new Error('Missing required field: farmId');
    }
    if (!body.startDate || !body.endDate) {
        throw new Error('Missing required fields: startDate, endDate');
    }
    if (!body.algorithms || !Array.isArray(body.algorithms) || body.algorithms.length === 0) {
        throw new Error('Missing or empty algorithms array');
    }

    const validAlgorithms = [
        'optram_moisture',
        'sar_moisture_change',
        'sar_moisture_fusion',
        'pca_phosphorus',
        'pca_potassium',
        'nitrogen_gndvi',
        'nitrogen_ndre',
    ];

    for (const alg of body.algorithms) {
        if (!validAlgorithms.includes(alg)) {
            throw new Error(`Invalid algorithm: ${alg}`);
        }
    }

    return {
        polygon: body.polygon,
        farmId: body.farmId,
        startDate: body.startDate,
        endDate: body.endDate,
        algorithms: body.algorithms,
        includeTrends: body.includeTrends !== undefined ? body.includeTrends : true,
        aggregationLevel: body.aggregationLevel || 'grid',
        windowSizeDays: body.windowSizeDays || 10,
    };
}

// Process single algorithm for all windows
async function processAlgorithm(
    algorithm: string,
    geometry: any,
    windows: any[],
    opticalCollection: any,
    sarCollection: any
): Promise<any[]> {
    const windowResults = [];

    for (const window of windows) {
        try {
            let result: any = null;

            // Filter collections for this window
            const windowOptical = opticalCollection
                ? opticalCollection.filterDate(window.startDate, window.endDate)
                : null;
            const windowSAR = sarCollection
                ? sarCollection.filterDate(window.startDate, window.endDate)
                : null;

            // Process based on algorithm type
            switch (algorithm) {
                case 'optram_moisture': {
                    if (windowOptical) {
                        const optram = await calculateOPTRAM(
                            windowOptical,
                            geometry,
                            window.startDate,
                            window.endDate
                        );
                        const stats = await evaluate(optram.moistureImage
                            .reduceRegion({
                                reducer: ee.Reducer.mean()
                                    .combine(ee.Reducer.stdDev(), '', true)
                                    .combine(ee.Reducer.minMax(), '', true)
                                    .combine(ee.Reducer.count(), '', true),
                                geometry: geometry,
                                scale: 90, // 3x3 grid aggregation
                                maxPixels: 1e9,
                            }));

                        result = {
                            mean: stats.OPTRAM_Moisture_mean || null,
                            stdDev: stats.OPTRAM_Moisture_stdDev || null,
                            min: stats.OPTRAM_Moisture_min || null,
                            max: stats.OPTRAM_Moisture_max || null,
                            pixelCount: stats.OPTRAM_Moisture_count || 0,
                        };
                    }
                    break;
                }

                case 'sar_moisture_change': {
                    if (windowSAR) {
                        const sarStats = await calculateSARTemporalStats(windowSAR, geometry, 'VV');
                        result = {
                            mean: sarStats.mean || null,
                            stdDev: sarStats.stdDev || null,
                            min: sarStats.min || null,
                            max: sarStats.max || null,
                            pixelCount: sarStats.count || 0,
                        };
                    }
                    break;
                }

                case 'sar_moisture_fusion': {
                    if (windowOptical && windowSAR) {
                        // Calculate OPTRAM
                        const optram = await calculateOPTRAM(
                            windowOptical,
                            geometry,
                            window.startDate,
                            window.endDate
                        );

                        // Get SAR moisture
                        const sarMean = windowSAR.select('VV').mean();

                        // Calculate NDVI for fusion weighting
                        const ndvi = windowOptical
                            .map((img: any) => img.normalizedDifference(['nir', 'red']))
                            .mean();

                        // Fuse moisture estimates
                        const fused = fuseMoistureEstimates(
                            optram.moistureImage,
                            sarMean,
                            ndvi
                        );

                        const stats = await evaluate(fused.fusedMoisture
                            .reduceRegion({
                                reducer: ee.Reducer.mean()
                                    .combine(ee.Reducer.stdDev(), '', true)
                                    .combine(ee.Reducer.minMax(), '', true)
                                    .combine(ee.Reducer.count(), '', true),
                                geometry: geometry,
                                scale: 90,
                                maxPixels: 1e9,
                            }));

                        result = {
                            mean: stats.Fused_Moisture_mean || null,
                            stdDev: stats.Fused_Moisture_stdDev || null,
                            min: stats.Fused_Moisture_min || null,
                            max: stats.Fused_Moisture_max || null,
                            pixelCount: stats.Fused_Moisture_count || 0,
                        };
                    }
                    break;
                }

                case 'pca_phosphorus': {
                    if (windowOptical) {
                        const pcaNutrients = await calculatePCANutrients(windowOptical, geometry);
                        const stats = await evaluate(pcaNutrients.phosphorusIndex
                            .reduceRegion({
                                reducer: ee.Reducer.mean()
                                    .combine(ee.Reducer.stdDev(), '', true)
                                    .combine(ee.Reducer.minMax(), '', true)
                                    .combine(ee.Reducer.count(), '', true),
                                geometry: geometry,
                                scale: 90,
                                maxPixels: 1e9,
                            }));

                        result = {
                            mean: stats.Phosphorus_Index_mean || null,
                            stdDev: stats.Phosphorus_Index_stdDev || null,
                            min: stats.Phosphorus_Index_min || null,
                            max: stats.Phosphorus_Index_max || null,
                            pixelCount: stats.Phosphorus_Index_count || 0,
                        };
                    }
                    break;
                }

                case 'pca_potassium': {
                    if (windowOptical) {
                        const pcaNutrients = await calculatePCANutrients(windowOptical, geometry);
                        const stats = await evaluate(pcaNutrients.potassiumIndex
                            .reduceRegion({
                                reducer: ee.Reducer.mean()
                                    .combine(ee.Reducer.stdDev(), '', true)
                                    .combine(ee.Reducer.minMax(), '', true)
                                    .combine(ee.Reducer.count(), '', true),
                                geometry: geometry,
                                scale: 90,
                                maxPixels: 1e9,
                            }));

                        result = {
                            mean: stats.Potassium_Index_mean || null,
                            stdDev: stats.Potassium_Index_stdDev || null,
                            min: stats.Potassium_Index_min || null,
                            max: stats.Potassium_Index_max || null,
                            pixelCount: stats.Potassium_Index_count || 0,
                        };
                    }
                    break;
                }

                case 'nitrogen_gndvi':
                case 'nitrogen_ndre': {
                    if (windowOptical) {
                        const nitrogen = await estimateNitrogen(windowOptical, geometry);
                        const indexName =
                            algorithm === 'nitrogen_gndvi' ? 'GNDVI_Index' : 'NDRE_Index';

                        const stats = await evaluate(nitrogen.nitrogenIndex
                            .reduceRegion({
                                reducer: ee.Reducer.mean()
                                    .combine(ee.Reducer.stdDev(), '', true)
                                    .combine(ee.Reducer.minMax(), '', true)
                                    .combine(ee.Reducer.count(), '', true),
                                geometry: geometry,
                                scale: 90,
                                maxPixels: 1e9,
                            }));

                        result = {
                            mean: stats.Nitrogen_Index_mean || null,
                            stdDev: stats.Nitrogen_Index_stdDev || null,
                            min: stats.Nitrogen_Index_min || null,
                            max: stats.Nitrogen_Index_max || null,
                            pixelCount: stats.Nitrogen_Index_count || 0,
                        };
                    }
                    break;
                }

                default:
                    console.warn(`Unknown algorithm: ${algorithm}`);
            }

            if (result && result.mean !== null) {
                windowResults.push({
                    startDate: window.startDate,
                    endDate: window.endDate,
                    mean: result.mean,
                    stdDev: result.stdDev,
                    min: result.min,
                    max: result.max,
                    pixelCount: result.pixelCount,
                    cloudCover: 0, // TODO: calculate from collection
                    sensors: ['S2', 'L8', 'L9'], // TODO: extract from collection
                });
            }
        } catch (error) {
            console.error(`Error processing window ${window.startDate} for ${algorithm}:`, error);
            // Continue with other windows
        }
    }

    return windowResults;
}

// Main handler
Deno.serve(async (req: Request) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return handleCors(req);
    }

    try {
        // Parse and validate request
        const body = await req.json();
        const request = validateRequest(body);

        // Validate date range
        const dateValidation = validateDateRange(
            request.startDate,
            request.endDate,
            DEFAULT_WINDOW_CONFIG
        );

        if (!dateValidation.valid) {
            return errorResponse(dateValidation.error || 'Invalid date range', 400);
        }

        // Check cache first (TODO: implement database cache lookup)

        // Get service account credentials from environment variables
        let serviceAccountKey: any;
        const googleCredsJson = Deno.env.get('GOOGLE_CREDENTIALS_JSON');

        if (googleCredsJson) {
            try {
                const parsed = JSON.parse(googleCredsJson);
                if (parsed.private_key && typeof parsed.private_key === 'string') {
                    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
                }
                serviceAccountKey = parsed;
            } catch (e: any) {
                throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${e.message}`);
            }
        } else {
            throw new Error('GOOGLE_CREDENTIALS_JSON environment variable not set');
        }

        // Validate required environment variables
        if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
            throw new Error("Missing required Google Cloud credentials in environment variables");
        }

        // Authenticate with Earth Engine (callback-based to avoid Deno.openSync blockage)
        await authenticateEarthEngine(serviceAccountKey);
        console.log('Earth Engine authenticated successfully');

        // Convert GeoJSON to Earth Engine geometry
        const geometry = geoJsonToEarthEngine(request.polygon);

        // Split date range into windows
        const windows = splitIntoWindows(
            request.startDate,
            request.endDate,
            request.windowSizeDays
        );

        console.log(
            `Processing ${request.algorithms.length} algorithms across ${windows.length} windows`
        );

        // Initialize Supabase client for database caching
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceKey) {
            console.warn('Supabase credentials not found, caching disabled');
        }

        const supabase = supabaseUrl && supabaseServiceKey
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // Check cache first
        if (supabase) {
            try {
                const { data: cachedData, error: cacheError } = await supabase
                    .from('advanced_monitoring_timeseries')
                    .select('*')
                    .eq('farm_id', request.farmId)
                    .gte('window_start_date', request.startDate)
                    .lte('window_end_date', request.endDate)
                    .in('algorithm', request.algorithms)
                    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()); // 90-day cache

                if (!cacheError && cachedData && cachedData.length > 0) {
                    console.log(`Cache hit: Found ${cachedData.length} cached windows`);

                    // Group by algorithm
                    const cacheByAlgorithm = new Map<string, any[]>();
                    for (const row of cachedData) {
                        if (!cacheByAlgorithm.has(row.algorithm)) {
                            cacheByAlgorithm.set(row.algorithm, []);
                        }
                        cacheByAlgorithm.get(row.algorithm)!.push({
                            startDate: row.window_start_date,
                            endDate: row.window_end_date,
                            mean: row.mean_value,
                            stdDev: row.std_dev,
                            min: row.min_value,
                            max: row.max_value,
                            pixelCount: row.pixel_count,
                            cloudCover: row.cloud_cover_percentage || 0,
                            sensors: row.sensors_used || [],
                        });
                    }

                    // Check if all algorithms and windows are cached
                    const allCached = request.algorithms.every((alg) => {
                        const cached = cacheByAlgorithm.get(alg);
                        return cached && cached.length === windows.length;
                    });

                    if (allCached) {
                        console.log('Full cache hit, returning cached data');

                        const timeseries = request.algorithms.map((algorithm) => ({
                            algorithm,
                            windows: cacheByAlgorithm.get(algorithm) || [],
                        }));

                        // Get cached trends if requested
                        let trends = [];
                        if (request.includeTrends) {
                            const { data: trendData } = await supabase
                                .from('trend_analysis')
                                .select('*')
                                .eq('farm_id', request.farmId)
                                .in('algorithm', request.algorithms)
                                .eq('analysis_start_date', request.startDate)
                                .eq('analysis_end_date', request.endDate);

                            trends = trendData || [];
                        }

                        return successResponse({
                            success: true,
                            data: {
                                timeseries,
                                trends: request.includeTrends ? trends : undefined,
                                metadata: {
                                    farmId: request.farmId,
                                    dateRange: { start: request.startDate, end: request.endDate },
                                    windowCount: windows.length,
                                    windowSizeDays: request.windowSizeDays,
                                    algorithmCount: request.algorithms.length,
                                    aggregationLevel: request.aggregationLevel,
                                    processingDate: new Date().toISOString(),
                                    cached: true,
                                },
                            },
                        });
                    }
                }
            } catch (error) {
                console.error('Cache lookup error:', error);
                // Continue with processing
            }
        }

        // Prepare data collections (reused across algorithms)
        const hlsConfig: HLSConfig = {
            targetResolution: 30,
            applyBRDF: true,
            applySpectralAdjustment: true,
        };

        const sarConfig: SARPreprocessingConfig = {
            polarization: 'VV',
            orbitDirection: 'BOTH',
            applySpeckleFilter: true,
            filterType: 'REFINED_LEE',
        };

        // Get optical collection (if needed)
        const needsOptical = request.algorithms.some((alg) =>
            [
                'optram_moisture',
                'sar_moisture_fusion',
                'pca_phosphorus',
                'pca_potassium',
                'nitrogen_gndvi',
                'nitrogen_ndre',
            ].includes(alg)
        );

        const opticalCollection = needsOptical
            ? getMergedOpticalCollectionHLS(
                  geometry,
                  request.startDate,
                  request.endDate,
                  30,
                  hlsConfig
              )
            : null;

        // Get SAR collection (if needed)
        const needsSAR = request.algorithms.some((alg) =>
            ['sar_moisture_change', 'sar_moisture_fusion'].includes(alg)
        );

        const sarCollection = needsSAR
            ? getSentinel1Collection(geometry, request.startDate, request.endDate, sarConfig)
            : null;

        // Process all algorithms in parallel
        const algorithmPromises = request.algorithms.map((algorithm) =>
            processAlgorithm(algorithm, geometry, windows, opticalCollection, sarCollection)
        );

        const algorithmResults = await Promise.all(algorithmPromises);

        // Build time series response
        const timeseries = request.algorithms.map((algorithm, index) => ({
            algorithm,
            windows: algorithmResults[index],
        }));

        // Perform trend analysis if requested
        const trends = [];
        if (request.includeTrends) {
            for (let i = 0; i < request.algorithms.length; i++) {
                const algorithm = request.algorithms[i];
                const windowData = algorithmResults[i];

                // Convert to time series format
                const timeSeriesData = windowData.map((w) => ({
                    date: w.startDate,
                    value: w.mean,
                }));

                // Validate time series
                const validation = validateTimeSeries(timeSeriesData);
                if (validation.valid) {
                    // Analyze trend
                    const trendResult = analyzeTrend(timeSeriesData);

                    trends.push({
                        algorithm,
                        ...trendResult,
                        analysis_start_date: request.startDate,
                        analysis_end_date: request.endDate,
                    });
                } else {
                    console.warn(`Skipping trend analysis for ${algorithm}: ${validation.error}`);
                }
            }
        }

        // Cache results in database
        if (supabase) {
            try {
                // Cache time series data
                const timeseriesRows = [];
                for (let i = 0; i < request.algorithms.length; i++) {
                    const algorithm = request.algorithms[i];
                    const windowData = algorithmResults[i];

                    for (const window of windowData) {
                        timeseriesRows.push({
                            farm_id: request.farmId,
                            algorithm: algorithm,
                            window_start_date: window.startDate,
                            window_end_date: window.endDate,
                            mean_value: window.mean,
                            std_dev: window.stdDev,
                            min_value: window.min,
                            max_value: window.max,
                            pixel_count: window.pixelCount,
                            cloud_cover_percentage: window.cloudCover,
                            sensors_used: window.sensors,
                        });
                    }
                }

                if (timeseriesRows.length > 0) {
                    const { error: insertError } = await supabase
                        .from('advanced_monitoring_timeseries')
                        .upsert(timeseriesRows, {
                            onConflict: 'farm_id,algorithm,window_start_date,window_end_date',
                        });

                    if (insertError) {
                        console.error('Error caching timeseries:', insertError);
                    } else {
                        console.log(`Cached ${timeseriesRows.length} timeseries windows`);
                    }
                }

                // Cache trend analysis results
                if (request.includeTrends && trends.length > 0) {
                    const trendRows = trends.map((trend) => ({
                        farm_id: request.farmId,
                        algorithm: trend.algorithm,
                        theilsen_slope: trend.theilsenSlope,
                        trend_direction: trend.trendDirection,
                        p_value: trend.pValue,
                        r_squared: trend.rSquared,
                        confidence_interval_low: trend.confidenceIntervalLow,
                        confidence_interval_high: trend.confidenceIntervalHigh,
                        analysis_start_date: trend.analysis_start_date,
                        analysis_end_date: trend.analysis_end_date,
                        window_count: trend.windowCount,
                    }));

                    const { error: trendError } = await supabase
                        .from('trend_analysis')
                        .upsert(trendRows, {
                            onConflict: 'farm_id,algorithm,analysis_start_date,analysis_end_date',
                        });

                    if (trendError) {
                        console.error('Error caching trends:', trendError);
                    } else {
                        console.log(`Cached ${trendRows.length} trend analysis results`);
                    }
                }
            } catch (error) {
                console.error('Cache write error:', error);
                // Continue with response even if caching fails
            }
        }

        // Build response
        const responseData = {
            success: true,
            data: {
                timeseries,
                trends: request.includeTrends ? trends : undefined,
                metadata: {
                    farmId: request.farmId,
                    dateRange: {
                        start: request.startDate,
                        end: request.endDate,
                    },
                    windowCount: windows.length,
                    windowSizeDays: request.windowSizeDays,
                    algorithmCount: request.algorithms.length,
                    aggregationLevel: request.aggregationLevel,
                    processingDate: new Date().toISOString(),
                    cached: false,
                },
            },
        };

        return successResponse(responseData);
    } catch (error) {
        console.error('Advanced monitoring error:', error);
        return errorResponse(
            error instanceof Error ? error.message : 'Unknown error occurred',
            500
        );
    }
});
