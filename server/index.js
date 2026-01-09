/**
 * Local Node.js Server for Advanced Monitoring
 * Handles compute-intensive Earth Engine operations locally
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ee from '@google/earthengine';
import { createClient } from '@supabase/supabase-js';

// Import shared utilities
import { splitIntoWindows, validateDateRange, DEFAULT_WINDOW_CONFIG } from './shared/window-manager.js';
import { analyzeTrend, validateTimeSeries } from './shared/trend-analysis.js';
import { geoJsonToEarthEngine, evaluate } from './shared/satellite-utils.js';
import { getMergedOpticalCollectionHLS } from './shared/hls-harmonization.js';
import {
    calculateOPTRAM,
    calculatePCANutrients,
    estimateNitrogen,
} from './shared/optical-algorithms.js';
import {
    getSentinel1Collection,
    calculateSARTemporalStats,
} from './shared/sar-algorithms.js';
import { fuseMoistureEstimates } from './shared/sensor-fusion.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Advanced Monitoring Server is running' });
});

// Initialize Earth Engine
let eeInitialized = false;

async function initializeEarthEngine() {
    if (eeInitialized) {
        return;
    }

    try {
        const googleCredsJson = process.env.GOOGLE_CREDENTIALS_JSON;
        if (!googleCredsJson) {
            throw new Error('GOOGLE_CREDENTIALS_JSON environment variable not set');
        }

        const serviceAccountKey = JSON.parse(googleCredsJson);
        if (serviceAccountKey.private_key && typeof serviceAccountKey.private_key === 'string') {
            serviceAccountKey.private_key = serviceAccountKey.private_key.replace(/\\n/g, '\n');
        }

        if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
            throw new Error('Missing required Google Cloud credentials in environment variables');
        }

        // Authenticate with Earth Engine
        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey(
                serviceAccountKey,
                () => {
                    ee.initialize(
                        null,
                        null,
                        () => {
                            console.log('Earth Engine authenticated successfully');
                            eeInitialized = true;
                            resolve();
                        },
                        (error) => reject(new Error(error))
                    );
                },
                (error) => reject(new Error(error))
            );
        });
    } catch (error) {
        console.error('Failed to initialize Earth Engine:', error);
        throw error;
    }
}

// Request validation
function validateRequest(body) {
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
    algorithm,
    geometry,
    windows,
    opticalCollection,
    sarCollection
) {
    const windowResults = [];

    for (const window of windows) {
        try {
            let result = null;

            // Filter collections for this window
            let windowOptical = null;
            let windowSAR = null;
            
            if (opticalCollection) {
                windowOptical = opticalCollection.filterDate(window.startDate, window.endDate);
                // Check if collection has any images
                try {
                    const opticalSize = await evaluate(windowOptical.size());
                    if (opticalSize === 0) {
                        console.log(`⚠️  No optical images found for window ${window.startDate} to ${window.endDate}`);
                        windowOptical = null;
                    } else {
                        console.log(`✅ Found ${opticalSize} optical images for window ${window.startDate} to ${window.endDate}`);
                    }
                } catch (error) {
                    console.error(`Error checking optical collection size:`, error);
                }
            }
            
            if (sarCollection) {
                windowSAR = sarCollection.filterDate(window.startDate, window.endDate);
                // Check if collection has any images
                try {
                    const sarSize = await evaluate(windowSAR.size());
                    if (sarSize === 0) {
                        console.log(`⚠️  No SAR images found for window ${window.startDate} to ${window.endDate}`);
                        windowSAR = null;
                    } else {
                        console.log(`✅ Found ${sarSize} SAR images for window ${window.startDate} to ${window.endDate}`);
                    }
                } catch (error) {
                    console.error(`Error checking SAR collection size:`, error);
                }
            }

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
                                scale: 90,
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
                        const optram = await calculateOPTRAM(
                            windowOptical,
                            geometry,
                            window.startDate,
                            window.endDate
                        );

                        const sarMean = windowSAR.select('VV').mean();

                        const ndvi = windowOptical
                            .map((img) => img.normalizedDifference(['nir', 'red']))
                            .mean();

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
                        // Use the appropriate index based on algorithm
                        const indexName = algorithm === 'nitrogen_gndvi' ? 'GNDVI' : 'Nitrogen_Index';
                        const indexImage = algorithm === 'nitrogen_gndvi' 
                            ? nitrogen.gndviImage 
                            : nitrogen.nitrogenEstimate;
                        
                        const stats = await evaluate(indexImage
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
                            mean: stats[`${indexName}_mean`] || stats.Nitrogen_Index_mean || null,
                            stdDev: stats[`${indexName}_stdDev`] || stats.Nitrogen_Index_stdDev || null,
                            min: stats[`${indexName}_min`] || stats.Nitrogen_Index_min || null,
                            max: stats[`${indexName}_max`] || stats.Nitrogen_Index_max || null,
                            pixelCount: stats[`${indexName}_count`] || stats.Nitrogen_Index_count || 0,
                        };
                    }
                    break;
                }

                default:
                    console.warn(`Unknown algorithm: ${algorithm}`);
            }

            if (result && result.mean !== null && result.mean !== undefined) {
                windowResults.push({
                    startDate: window.startDate,
                    endDate: window.endDate,
                    mean: result.mean,
                    stdDev: result.stdDev,
                    min: result.min,
                    max: result.max,
                    pixelCount: result.pixelCount,
                    cloudCover: 0,
                    sensors: ['S2', 'L8', 'L9'],
                });
            } else if (!result) {
                console.log(`⚠️  No result for ${algorithm} in window ${window.startDate} to ${window.endDate} - likely no satellite data available`);
            }
        } catch (error) {
            console.error(`❌ Error processing window ${window.startDate} to ${window.endDate} for ${algorithm}:`, error.message || error);
            // Continue with other windows
        }
    }

    return windowResults;
}

// Advanced monitoring endpoint
app.post('/advanced-monitoring', async (req, res) => {
    try {
        // Initialize Earth Engine if not already done
        await initializeEarthEngine();

        // Parse and validate request
        const request = validateRequest(req.body);

        // Validate date range
        const dateValidation = validateDateRange(
            request.startDate,
            request.endDate,
            DEFAULT_WINDOW_CONFIG
        );

        if (!dateValidation.valid) {
            return res.status(400).json({
                success: false,
                error: { message: dateValidation.error || 'Invalid date range' },
            });
        }

        // Check for future dates and adjust for satellite data availability
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        // Satellite data typically has a 1-2 week delay, so use 14 days ago as the latest available date
        const latestAvailableDate = new Date(today);
        latestAvailableDate.setDate(latestAvailableDate.getDate() - 14);
        
        const startDate = new Date(request.startDate);
        const endDate = new Date(request.endDate);
        
        if (startDate > today) {
            return res.status(400).json({
                success: false,
                error: { 
                    message: `Start date ${request.startDate} is in the future. Satellite data is only available for past dates. Please use a date range ending at least 14 days ago.`,
                    code: 'FUTURE_DATE_RANGE'
                },
            });
        }
        
        // Adjust end date if it's too recent (satellite data delay)
        let originalEndDate = request.endDate;
        if (endDate > latestAvailableDate) {
            const adjustedEndDate = latestAvailableDate.toISOString().split('T')[0];
            console.warn(`⚠️  Warning: End date ${request.endDate} is too recent. Satellite data typically has a 1-2 week delay.`);
            console.log(`📅 Adjusting end date from ${request.endDate} to ${adjustedEndDate} (14 days ago)`);
            request.endDate = adjustedEndDate;
        }

        // Initialize Supabase client for caching (optional)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = supabaseUrl && supabaseServiceKey
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // Convert GeoJSON to Earth Engine geometry
        const geometry = geoJsonToEarthEngine(request.polygon);

        // Split date range into windows (after potential date adjustment)
        const windows = splitIntoWindows(
            request.startDate,
            request.endDate,
            request.windowSizeDays
        );

        console.log(
            `\n🚀 Processing ${request.algorithms.length} algorithms across ${windows.length} windows`
        );
        console.log(`📅 Date range: ${request.startDate} to ${request.endDate}`);
        console.log(`📍 Farm ID: ${request.farmId}\n`);

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
                    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

                if (!cacheError && cachedData && cachedData.length > 0) {
                    console.log(`Cache hit: Found ${cachedData.length} cached windows`);

                    const cacheByAlgorithm = new Map();
                    for (const row of cachedData) {
                        if (!cacheByAlgorithm.has(row.algorithm)) {
                            cacheByAlgorithm.set(row.algorithm, []);
                        }
                        cacheByAlgorithm.get(row.algorithm).push({
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

                        return res.json({
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
            }
        }

        // Prepare data collections
        const hlsConfig = {
            targetResolution: 30,
            applyBRDF: true,
            applySpectralAdjustment: true,
        };

        const sarConfig = {
            polarization: 'VV',
            orbitDirection: 'BOTH',
            applySpeckleFilter: true,
            filterType: 'REFINED_LEE',
        };

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

        // Use higher cloud cover threshold (80%) to match dashboard behavior
        // The dashboard shows data even with high cloud cover, so we should too
        const cloudCoverThreshold = 80;
        
        const opticalCollection = needsOptical
            ? getMergedOpticalCollectionHLS(
                  geometry,
                  request.startDate,
                  request.endDate,
                  cloudCoverThreshold,
                  hlsConfig
              )
            : null;

        // Check total collection size for debugging
        if (opticalCollection) {
            try {
                const totalSize = await evaluate(opticalCollection.size());
                console.log(`📊 Total optical collection size: ${totalSize} images (cloud cover < ${cloudCoverThreshold}%)`);
                if (totalSize === 0) {
                    console.warn(`⚠️  No optical images found in collection. This could be due to:`);
                    console.warn(`   - High cloud cover (threshold: ${cloudCoverThreshold}%)`);
                    console.warn(`   - No satellite coverage for this location`);
                    console.warn(`   - Date range outside satellite data availability`);
                }
            } catch (error) {
                console.error(`Error checking optical collection size:`, error);
            }
        }

        const needsSAR = request.algorithms.some((alg) =>
            ['sar_moisture_change', 'sar_moisture_fusion'].includes(alg)
        );

        const sarCollection = needsSAR
            ? getSentinel1Collection(geometry, request.startDate, request.endDate, sarConfig)
            : null;

        // Check SAR collection size for debugging
        if (sarCollection) {
            try {
                const sarSize = await evaluate(sarCollection.size());
                console.log(`📊 Total SAR collection size: ${sarSize} images`);
            } catch (error) {
                console.error(`Error checking SAR collection size:`, error);
            }
        }

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

                const timeSeriesData = windowData.map((w) => ({
                    date: w.startDate,
                    value: w.mean,
                }));

                const validation = validateTimeSeries(timeSeriesData);
                if (validation.valid) {
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
            }
        }

        // Check if we got any results
        const totalWindows = timeseries.reduce((sum, ts) => sum + ts.windows.length, 0);
        const expectedWindows = request.algorithms.length * windows.length;
        
        if (totalWindows === 0) {
            console.warn(`⚠️  No data found for any algorithm. This could mean:`);
            console.warn(`   1. No satellite images available for the date range ${request.startDate} to ${request.endDate}`);
            console.warn(`   2. The farm location may not have satellite coverage`);
            console.warn(`   3. Cloud cover may be too high for all images`);
            
            // Return response with helpful message
            return res.json({
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
                        warning: `No satellite data found for the selected date range. Try using a date range from 30-90 days ago, or check if your farm location has satellite coverage.`,
                        dataAvailable: false,
                    },
                },
            });
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
                    dataAvailable: totalWindows > 0,
                    windowsFound: totalWindows,
                    windowsExpected: expectedWindows,
                },
            },
        };

        console.log(`✅ Successfully processed ${totalWindows} windows out of ${expectedWindows} expected`);
        res.json(responseData);
    } catch (error) {
        console.error('Advanced monitoring error:', error);
        res.status(500).json({
            success: false,
            error: {
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Advanced Monitoring Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
