// Get Available Dates from All Satellites (Sentinel-2, Landsat 8, Landsat 9)
// Returns all available satellite observation dates with cloud cover info

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getAllSatelliteDates, getIndicesForSatellite, geoJsonToEarthEngine } from '../_shared/satellite-utils.ts';

// @deno-types="npm:@types/google__earthengine"
import ee from 'npm:@google/earthengine@1.6.13';

const DEFAULT_FARM_ID = 'df43eedf-850d-454c-9fbf-36a052be10c0';
const DEFAULT_FARM_NAME = 'Jash Farm';

// Earth Engine authentication function
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

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    let farmId = url.searchParams.get('farm_id');
    const polygon = url.searchParams.get('polygon');
    const monthsParam = parseInt(url.searchParams.get('months') || '6');
    const cloudParam = url.searchParams.get('cloud');
    const maxCloudCover = cloudParam ? parseInt(cloudParam) : 100;
    const endDateParam = url.searchParams.get('end');
    const startDateParam = url.searchParams.get('start');

    // Calculate date range with 5-day processing buffer
    // Earth Engine typically needs 5-7 days to process satellite imagery
    const endDateObj = endDateParam ? new Date(endDateParam) : new Date();
    if (!endDateParam) {
      endDateObj.setDate(endDateObj.getDate() - 5); // Exclude last 5 days
    }
    const startDateObj = startDateParam ? new Date(startDateParam) : new Date(endDateObj);
    if (!startDateParam) {
      startDateObj.setMonth(startDateObj.getMonth() - monthsParam);
    }

    const startDate = startDateObj.toISOString().split('T')[0];
    const endDate = endDateObj.toISOString().split('T')[0];

    console.log(`Getting available dates for farm: ${farmId}, date range: ${startDate} to ${endDate}, cloud <= ${maxCloudCover}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get farm geometry if farm_id provided
    let polygonGeometry: any;
    if (farmId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(farmId)) {
        console.log(`Non-UUID farm_id received: ${farmId}`);
        if (farmId === 'jash-farm-default' || farmId === 'default') {
          farmId = DEFAULT_FARM_ID;
        } else {
          // Attempt to resolve by farm name
          const { data: farmByName, error: farmByNameError } = await supabase
            .from('farms')
            .select('id, geometry')
            .ilike('name', farmId.replace(/[-_]/g, ' ') + '%')
            .maybeSingle();

          if (farmByNameError) {
            console.warn('Error resolving farm by name:', farmByNameError.message);
          }

          if (farmByName?.id) {
            farmId = farmByName.id;
            polygonGeometry = farmByName.geometry;
          } else {
            console.log(`Falling back to default farm for identifier: ${farmId}`);
            farmId = DEFAULT_FARM_ID;
          }
        }
      }
    }

    if (farmId) {
      if (!polygonGeometry) {
        const { data: farm, error: farmError } = await supabase
          .from('farms')
          .select('id, geometry')
          .eq('id', farmId)
          .maybeSingle();

        if (farmError || !farm) {
          console.warn(`Farm not found by id ${farmId}. Attempting fallback to default farm.`);
          const { data: defaultFarm, error: defaultFarmError } = await supabase
            .from('farms')
            .select('id, geometry')
            .eq('id', DEFAULT_FARM_ID)
            .maybeSingle();

          if (defaultFarmError || !defaultFarm) {
            throw new Error(`Farm not found and default fallback unavailable: ${farmId}`);
          }

          farmId = defaultFarm.id;
          polygonGeometry = defaultFarm.geometry;
        } else {
          farmId = farm.id;
          polygonGeometry = farm.geometry;
        }
      }
    } else if (polygon) {
      polygonGeometry = JSON.parse(polygon);
    } else {
      // Default polygon (Jash farm)
      polygonGeometry = {
        type: 'Polygon',
        coordinates: [[
          [77.77333199305133, 12.392392446684909],
          [77.77285377084087, 12.391034719901086],
          [77.77415744218291, 12.390603704636632],
          [77.77438732135664, 12.391302225016886],
          [77.77376792469431, 12.391501801924363],
          [77.77399141833513, 12.392187846379386],
          [77.77333199305133, 12.392392446684909]
        ]]
      };
    }

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

    // Validate Earth Engine credentials
    if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
      throw new Error("Missing required Google Cloud credentials. Please configure GOOGLE_CREDENTIALS_JSON or individual credential environment variables.");
    }

    // Authenticate Earth Engine
    await authenticate(serviceAccountKey);
    console.log('✅ Earth Engine authenticated successfully');

    // Create Earth Engine geometry (handles both Polygon and MultiPolygon)
    console.log('📍 Creating Earth Engine geometry from farm polygon...');
    const poi = geoJsonToEarthEngine(polygonGeometry);
    console.log(`✅ Geometry created: ${polygonGeometry.type}`);

    // Query all satellites from Earth Engine
    // Each satellite (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR) has different:
    // - Collections in Earth Engine
    // - Cloud cover properties
    // - Tile IDs
    // - Available indices
    console.log('🛰️  Querying Earth Engine for all satellites...');
    console.log(`   - Sentinel-2: Optical, cloud property: CLOUDY_PIXEL_PERCENTAGE`);
    console.log(`   - Landsat-8: Optical, cloud property: CLOUD_COVER`);
    console.log(`   - Landsat-9: Optical, cloud property: CLOUD_COVER`);
    console.log(`   - Sentinel-1 SAR: Radar, no cloud cover`);
    console.log(`   - Date range: ${startDate} to ${endDate}`);
    console.log(`   - Max cloud cover: ${maxCloudCover}%`);

    const availableDates = await getAllSatelliteDates(
      poi,
      startDate,
      endDate,
      evaluate,
      Math.min(Math.max(maxCloudCover, 0), 100)
    );

    console.log(`✅ Found ${availableDates.length} images across all satellites`);

    // If farm_id provided, save to database for future caching
    if (farmId && availableDates.length > 0) {
      console.log(`💾 Saving ${availableDates.length} observations to database for farm ${farmId}...`);

      // Insert observations (upsert to avoid duplicates)
      const observations = availableDates.map(obs => ({
        farm_id: farmId,
        observation_date: obs.date,
        cloud_cover_percentage: typeof obs.cloud_cover === 'number' ? obs.cloud_cover : null,
        satellite: obs.satellite,
        processing_level: obs.satellite === 'Sentinel-2' ? 'L2A' : (obs.satellite === 'Sentinel-1 SAR' ? null : 'L2'),
        tile_id: obs.tile_id || `${obs.satellite}_${obs.date}`
      }));

      const { error: insertError } = await supabase
        .from('satellite_observations')
        .upsert(observations, {
          onConflict: 'farm_id,observation_date,satellite,tile_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('⚠️  Error saving observations (continuing anyway):', insertError.message);
        console.error('   Details:', insertError.details);
      } else {
        console.log(`✅ Saved ${observations.length} observations to database`);
      }
    }

    // Ensure each date has available_indices populated
    // Different satellites support different indices:
    // - Sentinel-2, Landsat-8, Landsat-9: ndvi, evi, savi, msavi, ndwi, nitrogen, phosphorus, potassium, salinity, ph, moisture, carbon
    // - Sentinel-1 SAR: sar_moisture only
    const datesWithIndices = availableDates.map(date => ({
      ...date,
      available_indices: date.available_indices || getIndicesForSatellite(date.satellite)
    }));

    // Group by satellite for summary
    const satelliteCounts = datesWithIndices.reduce((acc: any, date: any) => {
      acc[date.satellite] = (acc[date.satellite] || 0) + 1;
      return acc;
    }, {});

    return successResponse({
      farm_id: farmId,
      date_range: { start: startDate, end: endDate },
      total_images: datesWithIndices.length,
      available_dates: datesWithIndices,
      satellite_breakdown: satelliteCounts,
      data_sources: "Multi-satellite (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR)",
      note: "Each satellite has different available indices. Use the agricultural-indices endpoint with specific date, index, and satellite to get map tiles."
    });

  } catch (error: any) {
    console.error("Get Available Dates Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

