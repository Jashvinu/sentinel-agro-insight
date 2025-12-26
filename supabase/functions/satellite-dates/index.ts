// Satellite Dates API - Get dates for a specific satellite
// Supports: Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { 
  SATELLITES, 
  getIndicesForSatellite, 
  geoJsonToEarthEngine,
  getAllOpticalDates,
  getSentinel1Dates
} from '../_shared/satellite-utils.ts';

// @deno-types="npm:@types/google__earthengine"
import ee from 'npm:@google/earthengine@1.6.13';

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

const VALID_SATELLITES = ['Sentinel-2', 'Landsat-8', 'Landsat-9', 'Sentinel-1 SAR'];

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    const satelliteParam = url.searchParams.get('satellite');
    const farmId = url.searchParams.get('farm_id');
    const monthsParam = parseInt(url.searchParams.get('months') || '6');
    const endDateParam = url.searchParams.get('end');
    const startDateParam = url.searchParams.get('start');
    const forceRefresh = url.searchParams.get('force_refresh') === 'true';

    // Validate satellite parameter
    if (!satelliteParam || !VALID_SATELLITES.includes(satelliteParam)) {
      return errorResponse(
        `Invalid or missing satellite parameter. Valid options: ${VALID_SATELLITES.join(', ')}`,
        400
      );
    }

    const satellite = satelliteParam as typeof VALID_SATELLITES[number];
    console.log(`🛰️  Fetching dates for satellite: ${satellite}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate date range with 5-day processing buffer
    const today = new Date();
    const maxAllowedDate = new Date();
    maxAllowedDate.setDate(maxAllowedDate.getDate() - 5);
    const maxAllowedDateStr = maxAllowedDate.toISOString().split('T')[0];

    const endDateObj = endDateParam ? new Date(endDateParam) : new Date(maxAllowedDate);
    if (endDateObj > maxAllowedDate) {
      endDateObj.setTime(maxAllowedDate.getTime());
    }

    const startDateObj = startDateParam ? new Date(startDateParam) : new Date(endDateObj);
    if (!startDateParam) {
      startDateObj.setMonth(startDateObj.getMonth() - monthsParam);
    }

    const minDateStr = startDateObj.toISOString().split('T')[0];
    const maxDateStr = endDateObj.toISOString().split('T')[0];

    console.log(`📅 Date range: ${minDateStr} to ${maxDateStr} (max allowed: ${maxAllowedDateStr})`);

    // Check if we should refresh from Earth Engine
    let shouldRefresh = forceRefresh;
    
    if (!shouldRefresh && farmId) {
      const { data: latestObs } = await supabase
        .from('satellite_observations')
        .select('observation_date')
        .eq('farm_id', farmId)
        .eq('satellite', satellite)
        .order('observation_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestObs || !latestObs.observation_date) {
        shouldRefresh = true;
        console.log('🔄 No dates in database for this satellite. Querying Earth Engine...');
      } else {
        const latestDate = new Date(latestObs.observation_date);
        const daysDiff = Math.floor((maxAllowedDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 1) {
          console.log(`🔄 Database dates are stale (latest: ${latestObs.observation_date}, max available: ${maxAllowedDateStr}, diff: ${daysDiff} days). Refreshing...`);
          shouldRefresh = true;
        }
      }
    }

    // If refresh is needed and farm_id provided, query Earth Engine
    if (shouldRefresh && farmId) {
      try {
        const { data: farm, error: farmError } = await supabase
          .from('farms')
          .select('id, geometry')
          .eq('id', farmId)
          .maybeSingle();

        if (farmError || !farm || !farm.geometry) {
          console.warn('⚠️  Could not fetch farm geometry for refresh, continuing with database data');
        } else {
          // Get Earth Engine credentials
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

          if (serviceAccountKey.project_id && serviceAccountKey.private_key && serviceAccountKey.client_email) {
            await authenticate(serviceAccountKey);
            const poi = geoJsonToEarthEngine(farm.geometry);

            let availableDates: Array<{
              date: string;
              timestamp: number;
              cloud_cover: number | null;
              satellite: string;
              tile_id?: string;
              available_indices: string[];
            }> = [];

            if (satellite === 'Sentinel-1 SAR') {
              availableDates = await getSentinel1Dates(poi, minDateStr, maxDateStr, evaluate);
            } else {
              // For optical satellites, filter to specific satellite
              const allOpticalDates = await getAllOpticalDates(poi, minDateStr, maxDateStr, evaluate, 100);
              availableDates = allOpticalDates.filter(d => d.satellite === satellite);
            }

            if (availableDates.length > 0) {
              const observations = availableDates.map(obs => ({
                farm_id: farmId,
                observation_date: obs.date,
                cloud_cover_percentage: typeof obs.cloud_cover === 'number' ? obs.cloud_cover : null,
                satellite: obs.satellite,
                processing_level: satellite === 'Sentinel-2' ? 'L2A' : (satellite === 'Sentinel-1 SAR' ? 'GRD' : 'L2'),
                tile_id: obs.tile_id || `${obs.satellite}_${obs.date}`
              }));

              const { error: upsertError } = await supabase
                .from('satellite_observations')
                .upsert(observations, {
                  onConflict: 'farm_id,observation_date,satellite,tile_id',
                  ignoreDuplicates: false
                });

              if (upsertError) {
                console.error('❌ Error upserting observations:', upsertError.message);
              } else {
                console.log(`✅ Refreshed ${observations.length} observations for ${satellite} from Earth Engine`);
              }
            }
          }
        }
      } catch (refreshError) {
        console.warn('⚠️  Error refreshing from Earth Engine, using database data:', refreshError);
      }
    }

    // Query database for this specific satellite
    let query = supabase
      .from('satellite_observations')
      .select('observation_date, cloud_cover_percentage, tile_id, satellite, farm_id')
      .eq('satellite', satellite)
      .lte('observation_date', maxAllowedDateStr)
      .gte('observation_date', minDateStr)
      .order('observation_date', { ascending: false });

    if (farmId) {
      query = query.eq('farm_id', farmId);
    }

    const { data: observations, error: obsError } = await query;

    if (obsError) {
      throw new Error(`Database error: ${obsError.message}`);
    }

    // Filter and group dates
    const dateMap = new Map<string, {
      observation_date: string;
      cloud_cover_percentage: number | null;
      tiles: Set<string>;
    }>();

    (observations || []).forEach((obs: any) => {
      const date = obs.observation_date;
      if (date > maxAllowedDateStr) return;

      if (!dateMap.has(date)) {
        dateMap.set(date, {
          observation_date: date,
          cloud_cover_percentage: obs.cloud_cover_percentage ?? null,
          tiles: new Set<string>()
        });
      }

      const entry = dateMap.get(date)!;
      if (typeof obs.cloud_cover_percentage === 'number' && entry.cloud_cover_percentage === null) {
        entry.cloud_cover_percentage = obs.cloud_cover_percentage;
      }
      if (obs.tile_id) {
        entry.tiles.add(obs.tile_id);
      }
    });

    const uniqueDates = Array.from(dateMap.values())
      .map(item => ({
        observation_date: item.observation_date,
        cloud_cover_percentage: item.cloud_cover_percentage,
        tile_id: Array.from(item.tiles).join(', ') || 'Multiple tiles',
        satellite: satellite,
        available_indices: getIndicesForSatellite(satellite)
      }))
      .sort((a, b) => new Date(b.observation_date).getTime() - new Date(a.observation_date).getTime());

    console.log(`✅ Found ${uniqueDates.length} dates for ${satellite}`);

    return successResponse({
      satellite: satellite,
      farm_id: farmId || null,
      total_dates: uniqueDates.length,
      dates: uniqueDates,
      date_list: uniqueDates.map(d => d.observation_date),
      available_indices: getIndicesForSatellite(satellite),
      date_range: {
        start: minDateStr,
        end: maxAllowedDateStr,
        max_allowed: maxAllowedDateStr
      }
    });

  } catch (error: any) {
    console.error("Satellite Dates Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

