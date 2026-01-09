/**
 * Test Advanced Monitoring Setup
 * Quick diagnostic endpoint to verify Earth Engine and database connectivity
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ee from 'npm:@google/earthengine@1.6.13';

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return handleCors(req);
    }

    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        checks: {},
    };

    try {
        // 1. Check environment variables
        diagnostics.checks.environment = {
            hasGoogleCredentials: !!Deno.env.get('GOOGLE_CREDENTIALS_JSON'),
            hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
            hasSupabaseKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        };

        // 2. Test Earth Engine authentication (callback-based)
        try {
            const credentials = Deno.env.get('GOOGLE_CREDENTIALS_JSON');
            if (credentials) {
                const parsedCredentials = JSON.parse(credentials);
                if (parsedCredentials.private_key && typeof parsedCredentials.private_key === 'string') {
                    parsedCredentials.private_key = parsedCredentials.private_key.replace(/\\n/g, '\n');
                }

                // Use callback-based authentication
                await new Promise<void>((resolve, reject) => {
                    ee.data.authenticateViaPrivateKey(
                        parsedCredentials,
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

                diagnostics.checks.earthEngine = {
                    status: 'success',
                    message: 'Authenticated successfully',
                };
            } else {
                diagnostics.checks.earthEngine = {
                    status: 'error',
                    message: 'GOOGLE_CREDENTIALS_JSON not set',
                };
            }
        } catch (error: any) {
            diagnostics.checks.earthEngine = {
                status: 'error',
                message: error.message,
            };
        }

        // 3. Test Supabase connection
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

            if (supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);

                // Try to query the tables
                const { data: timeseriesCheck, error: tsError } = await supabase
                    .from('advanced_monitoring_timeseries')
                    .select('count')
                    .limit(1);

                const { data: trendsCheck, error: tError } = await supabase
                    .from('trend_analysis')
                    .select('count')
                    .limit(1);

                diagnostics.checks.database = {
                    status: tsError || tError ? 'error' : 'success',
                    timeseriesTable: tsError ? tsError.message : 'accessible',
                    trendsTable: tError ? tError.message : 'accessible',
                };
            } else {
                diagnostics.checks.database = {
                    status: 'error',
                    message: 'Supabase credentials not set',
                };
            }
        } catch (error: any) {
            diagnostics.checks.database = {
                status: 'error',
                message: error.message,
            };
        }

        // 4. Test a simple Earth Engine operation using callback-based evaluate
        try {
            if (diagnostics.checks.earthEngine.status === 'success') {
                const point = ee.Geometry.Point([77.5946, 12.9716]); // Bangalore, India

                // Use a collection and get the first image
                const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                    .filterBounds(point)
                    .filterDate('2023-01-01', '2023-12-31')
                    .first();

                const reduceRegionResult = collection.select(['B4', 'B8']).reduceRegion({
                    reducer: ee.Reducer.mean(),
                    geometry: point,
                    scale: 10,
                    maxPixels: 1e9,
                });

                // Use callback-based evaluate instead of getInfo
                const result = await new Promise((resolve, reject) => {
                    reduceRegionResult.evaluate((result: any, error: any) =>
                        error ? reject(new Error(error)) : resolve(result)
                    );
                });

                diagnostics.checks.earthEngineCompute = {
                    status: 'success',
                    message: 'Successfully computed sample image',
                    sampleBands: Object.keys(result || {}),
                };
            } else {
                diagnostics.checks.earthEngineCompute = {
                    status: 'skipped',
                    message: 'Earth Engine auth failed, skipping compute test',
                };
            }
        } catch (error: any) {
            diagnostics.checks.earthEngineCompute = {
                status: 'error',
                message: error.message,
            };
        }

        // Overall status
        const allChecks = Object.values(diagnostics.checks);
        const allPassed = allChecks.every((check: any) =>
            check.status === 'success' || check.status === 'skipped'
        );

        return successResponse({
            success: allPassed,
            diagnostics,
            message: allPassed
                ? 'All systems operational'
                : 'Some checks failed - see diagnostics',
        });
    } catch (error) {
        console.error('Diagnostic error:', error);
        return errorResponse(
            error instanceof Error ? error.message : 'Diagnostic failed',
            500
        );
    }
});
