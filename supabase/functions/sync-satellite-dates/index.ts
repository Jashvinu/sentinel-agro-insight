// Sync Satellite Dates - Daily Job to Update Available Multi-Satellite Observations
// Queries Earth Engine for all satellites (Sentinel-2, Landsat-8, Landsat-9) and stores new dates

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import * as satelliteUtils from '../_shared/satellite-utils.ts';
import { getAllSatelliteDates, getIndicesForSatellite } from '../_shared/satellite-utils.ts';

// @deno-types="npm:@types/google__earthengine"
import ee from 'npm:@google/earthengine@1.6.13';

// Get geoJsonToEarthEngine from the module (with fallback)
const geoJsonToEarthEngine = satelliteUtils.geoJsonToEarthEngine || ((geometry: any) => {
  if (geometry.type === 'Polygon') {
    return ee.Geometry.Polygon(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    return ee.Geometry.MultiPolygon(geometry.coordinates);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
});

// Earth Engine authentication
function authenticate(serviceAccount: any): Promise<void> {
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

// Function to evaluate Earth Engine objects
function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((result: any, error: any) =>
      error ? reject(new Error(error)) : resolve(result)
    )
  );
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    const farmIdParam = url.searchParams.get('farm_id');
    const monthsBack = parseInt(url.searchParams.get('months') || '6');
    const dryRun = url.searchParams.get('dry_run') === 'true';

    console.log(`🔄 Starting satellite date sync...`);
    console.log(`📅 Range: Last ${monthsBack} months`);
    console.log(`🏗️  Dry run: ${dryRun}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all farms to process (or specific farm if provided)
    let farmsQuery = supabase.from('farms').select('id, name, geometry');

    if (farmIdParam) {
      farmsQuery = farmsQuery.eq('id', farmIdParam);
    }

    const { data: farms, error: farmsError } = await farmsQuery;

    if (farmsError || !farms || farms.length === 0) {
      throw new Error(`No farms found: ${farmsError?.message || 'Empty result'}`);
    }

    console.log(`🌾 Found ${farms.length} farm(s) to process`);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`📅 Date range: ${startDateStr} to ${endDateStr}`);

    // Get Google Earth Engine credentials
    let serviceAccountKey: any;
    const googleCredsJson = Deno.env.get('GOOGLE_CREDENTIALS_JSON');

    if (googleCredsJson) {
      const parsed = JSON.parse(googleCredsJson);
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      serviceAccountKey = parsed;
    } else {
      serviceAccountKey = {
        "type": "service_account",
        "project_id": Deno.env.get('GOOGLE_PROJECT_ID'),
        "private_key_id": Deno.env.get('GOOGLE_PRIVATE_KEY_ID'),
        "private_key": Deno.env.get('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        "client_email": Deno.env.get('GOOGLE_CLIENT_EMAIL'),
        "client_id": Deno.env.get('GOOGLE_CLIENT_ID'),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": Deno.env.get('GOOGLE_CLIENT_X509_CERT_URL'),
        "universe_domain": "googleapis.com"
      };
    }

    // Authenticate Earth Engine
    await authenticate(serviceAccountKey);
    console.log('✅ Earth Engine authenticated');

    // Process each farm
    const results: Array<{
      farm_id: string;
      farm_name: string;
      total_images_found: number;
      existing_in_db: number;
      new_observations: number;
      inserted: number;
      skipped: number;
      date_range: { start: string; end: string };
      sample_new_dates: Array<{
        date: string;
        cloud_cover: number | null;
        satellite: string;
        tile: string | undefined;
        indices: string[];
      }>;
    }> = [];

    for (const farm of farms) {
      console.log(`\n🌾 Processing farm: ${farm.name} (${farm.id})`);

      // Create Earth Engine geometry from farm polygon (handles both Polygon and MultiPolygon)
      const poi = geoJsonToEarthEngine(farm.geometry);

      // Get existing observation dates for this farm from database
      if (!dryRun) {
        const { error: deleteError } = await supabase
          .from('satellite_observations')
          .delete()
          .eq('farm_id', farm.id)
          .lt('observation_date', startDateStr);

        if (deleteError) {
          console.error(`❌ Error pruning old observations for farm ${farm.id}:`, deleteError.message);
        } else {
          console.log(`🧹 Removed observations older than ${startDateStr} for farm ${farm.id}`);
        }
      }

      const { data: existingObs, error: obsError } = await supabase
        .from('satellite_observations')
        .select('observation_date, satellite')
        .eq('farm_id', farm.id);

      if (obsError) {
        console.error(`❌ Error fetching existing observations: ${obsError.message}`);
        continue;
      }

      const existingEntries = new Set<string>(
        (existingObs || []).map(
          (obs: { observation_date: string; satellite: string | null }) =>
            `${obs.observation_date}_${obs.satellite || 'Unknown'}`
        )
      );

      console.log(`📊 Existing observations in DB: ${existingEntries.size}`);

      // Query all optical satellites
      console.log('🛰️  Querying all optical satellites (Sentinel-2, Landsat-8, Landsat-9)...');

      const imageList = await getAllSatelliteDates(poi, startDateStr, endDateStr, evaluate, 100);

      console.log(`✅ Found ${imageList.length} images from all satellites`);

      // Group by satellite for logging
      const satelliteCounts = imageList.reduce((acc: Record<string, number>, img: any) => {
        acc[img.satellite] = (acc[img.satellite] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 Satellite breakdown:', satelliteCounts);

      // Filter for new dates only
      const newObservations: Array<{
        farm_id: string;
        observation_date: string;
        cloud_cover_percentage: number | null;
        satellite: string;
        processing_level: string;
        tile_id: string | undefined;
      }> = [];
      const skippedDates: string[] = [];

      for (const img of imageList) {
        const obsDate = img.date;

        const entryKey = `${obsDate}_${img.satellite || 'Unknown'}`;

        if (existingEntries.has(entryKey)) {
          skippedDates.push(obsDate);
          continue;
        }

        const cloudCover = typeof img.cloud_cover === 'number'
          ? Math.round(img.cloud_cover * 10) / 10
          : null;

        newObservations.push({
          farm_id: farm.id,
          observation_date: obsDate,
          cloud_cover_percentage: cloudCover,
          satellite: img.satellite,
          processing_level: img.satellite === 'Sentinel-2'
            ? 'L2A'
            : (img.satellite === 'Sentinel-1 SAR' ? 'GRD' : 'L2'),
          tile_id: img.tile_id || `${img.satellite}_${obsDate}`
        });
      }

      console.log(`📝 New observations to add: ${newObservations.length}`);
      console.log(`⏭️  Skipped (already exist): ${skippedDates.length}`);

      // Insert new observations (unless dry run)
      let insertedCount = 0;
      const insertErrors: string[] = [];

      if (!dryRun && newObservations.length > 0) {
        console.log(`💾 Attempting to insert ${newObservations.length} observations...`);
        console.log(`Sample observation:`, JSON.stringify(newObservations[0]));
        console.log(`All observation dates:`, newObservations.map(o => o.observation_date).join(', '));

        // Insert one at a time to find errors
        let successCount = 0;
        for (const obs of newObservations) {
          const { error: insertError } = await supabase
            .from('satellite_observations')
            .insert(obs);

          if (insertError) {
            console.error(`❌ Error inserting observation ${obs.observation_date}:`, {
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code,
              observation: obs
            });
            insertErrors.push(`${obs.observation_date}: ${insertError.message}`);
          } else {
            successCount++;
          }
        }

        console.log(`✅ Successfully inserted ${successCount} of ${newObservations.length} observations`);
        insertedCount = successCount;
      } else if (dryRun) {
        console.log(`🔍 DRY RUN: Would insert ${newObservations.length} observations`);
      }

      // Store result
      results.push({
        farm_id: farm.id,
        farm_name: farm.name,
        total_images_found: imageList.length,
        existing_in_db: existingEntries.size,
        new_observations: newObservations.length,
        inserted: dryRun ? 0 : insertedCount,
        skipped: skippedDates.length,
        date_range: { start: startDateStr, end: endDateStr },
        sample_new_dates: newObservations.slice(0, 5).map(o => ({
          date: o.observation_date,
          cloud_cover: o.cloud_cover_percentage,
          satellite: o.satellite,
          tile: o.tile_id,
          indices: getIndicesForSatellite(o.satellite)
        }))
      });
    }

    // Summary
    const totalFound = results.reduce((sum, r) => sum + r.total_images_found, 0);
    const totalNew = results.reduce((sum, r) => sum + r.new_observations, 0);
    const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    console.log('\n📊 === SUMMARY ===');
    console.log(`✅ Total images found: ${totalFound}`);
    console.log(`📝 New observations: ${totalNew}`);
    console.log(`💾 Inserted to DB: ${totalInserted}`);
    console.log(`⏭️  Skipped (existing): ${totalSkipped}`);

    return successResponse({
      success: true,
      dry_run: dryRun,
      date_range: { start: startDateStr, end: endDateStr },
      farms_processed: farms.length,
      summary: {
        total_images_found: totalFound,
        new_observations: totalNew,
        inserted: totalInserted,
        skipped_existing: totalSkipped
      },
      farms: results
    });

  } catch (error: any) {
    console.error("❌ Sync Satellite Dates Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

