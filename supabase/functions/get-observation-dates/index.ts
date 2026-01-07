// Get Observation Dates - Simple endpoint to fetch available satellite dates
// Automatically refreshes from Earth Engine if dates are stale
import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getIndicesForSatellite, getAllSatelliteDates, geoJsonToEarthEngine } from '../_shared/satellite-utils.ts';

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    let farmId = url.searchParams.get('farm_id') || 'df43eedf-850d-454c-9fbf-36a052be10c0';

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(farmId)) {
      console.log(`Invalid UUID format: ${farmId}, using default`);
      farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0';
    }

    console.log(`Fetching observation dates for farm: ${farmId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get unique observation dates with cloud cover info
    // Support custom date range via query parameters, default to last 6 months
    const monthsParam = parseInt(url.searchParams.get('months') || '6');
    const endDateParam = url.searchParams.get('end');
    const startDateParam = url.searchParams.get('start');

    // Calculate date range - show all available dates up to today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const endDateObj = endDateParam ? new Date(endDateParam) : new Date(today);
    // Don't allow end date to be in the future
    if (endDateObj > today) {
      endDateObj.setTime(today.getTime());
    }

    const startDateObj = startDateParam ? new Date(startDateParam) : new Date(endDateObj);
    if (!startDateParam) {
      startDateObj.setMonth(startDateObj.getMonth() - monthsParam);
    }

    const minDateStr = startDateObj.toISOString().split('T')[0];
    const maxDateStr = endDateObj.toISOString().split('T')[0];

    console.log(`📅 Date range: ${minDateStr} to ${maxDateStr} (${monthsParam} months)`);
    console.log(`📅 Today's date: ${todayStr}`);

    // Check if we should refresh from Earth Engine
    // Refresh if latest date is more than 1 day behind the max available date (more aggressive refresh)
    const forceRefresh = url.searchParams.get('force_refresh') === 'true';
    let shouldRefresh = false;

    if (forceRefresh) {
      console.log('🔄 Force refresh requested. Querying Earth Engine...');
      shouldRefresh = true;
    } else {
      const { data: latestObs } = await supabase
        .from('satellite_observations')
        .select('observation_date')
        .eq('farm_id', farmId)
        .order('observation_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestObs && latestObs.observation_date) {
        const latestDate = new Date(latestObs.observation_date);
        const daysDiff = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 1) {  // Refresh if latest date is more than 1 day behind today
          console.log(`🔄 Database dates are stale (latest: ${latestObs.observation_date}, today: ${todayStr}, diff: ${daysDiff} days). Refreshing from Earth Engine...`);
          shouldRefresh = true;
        }
      } else {
        // No dates in database, definitely refresh
        console.log('🔄 No dates in database. Querying Earth Engine...');
        shouldRefresh = true;
      }
    }

    // If refresh is needed, query Earth Engine and update database
    if (shouldRefresh) {
      try {
        // Get farm geometry
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
            // Authenticate and query Earth Engine
            console.log('🔐 Authenticating with Earth Engine...');
            await authenticate(serviceAccountKey);
            console.log('✅ Earth Engine authenticated');

            const poi = geoJsonToEarthEngine(farm.geometry);
            console.log(`📍 Querying Earth Engine for dates: ${minDateStr} to ${maxDateStr}`);

            const availableDates = await getAllSatelliteDates(poi, minDateStr, maxDateStr, evaluate, 100);

            console.log(`📊 Earth Engine returned ${availableDates.length} observations`);

            if (availableDates.length > 0) {
              // Filter out future dates before saving
              const validDates = availableDates.filter(obs => obs.date <= todayStr);
              console.log(`📅 Filtered ${availableDates.length - validDates.length} future dates (keeping ${validDates.length} valid dates)`);

              // Save to database (only valid, non-future dates)
              const observations = validDates.map(obs => ({
                farm_id: farmId,
                observation_date: obs.date,
                cloud_cover_percentage: typeof obs.cloud_cover === 'number' ? obs.cloud_cover : null,
                satellite: obs.satellite,
                processing_level: obs.satellite === 'Sentinel-2' ? 'L2A' : (obs.satellite === 'Sentinel-1 SAR' ? 'GRD' : 'L2'),
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
                console.log(`✅ Refreshed ${observations.length} observations from Earth Engine`);
              }
            } else {
              console.warn('⚠️  No observations found from Earth Engine');
            }
          } else {
            console.warn('⚠️  Earth Engine credentials not available, skipping refresh');
          }
        }
      } catch (refreshError) {
        // Don't fail the request if refresh fails, just log and continue with database data
        console.warn('⚠️  Error refreshing from Earth Engine, using database data:', refreshError);
      }
    }

    // Query all observations in the date range, then filter to max allowed date
    // This ensures we get the latest available dates
    const { data: observations, error: obsError } = await supabase
      .from('satellite_observations')
      .select('observation_date, cloud_cover_percentage, tile_id, satellite')
      .eq('farm_id', farmId)
      .gte('observation_date', minDateStr)
      .lte('observation_date', maxDateStr)
      .order('observation_date', { ascending: false });

    if (obsError) {
      throw new Error(`Database error: ${obsError.message}`);
    }

    // Group by date and aggregate tiles
    const dateMap = new Map<string, {
      observation_date: string;
      cloud_cover_percentage: number | null;
      tiles: Set<string>;
      satellites: Set<string>;
    }>();

    // Filter out only future dates (dates after today)
    let filteredCount = 0;

    (observations || []).forEach(obs => {
      const date = obs.observation_date;

      // Skip only future dates (dates after today)
      if (date > todayStr) {
        filteredCount++;
        return;
      }

      if (!dateMap.has(date)) {
        dateMap.set(date, {
          observation_date: date,
          cloud_cover_percentage: obs.cloud_cover_percentage ?? null,
          tiles: new Set<string>(),
          satellites: new Set<string>()
        });
      }

      const entry = dateMap.get(date)!;

      if (typeof obs.cloud_cover_percentage === 'number' && entry.cloud_cover_percentage === null) {
        entry.cloud_cover_percentage = obs.cloud_cover_percentage;
      }

      if (obs.tile_id) {
        entry.tiles.add(obs.tile_id);
      }

      if (obs.satellite) {
        entry.satellites.add(obs.satellite);
      }
    });

    const uniqueDates = Array.from(dateMap.values()).map(item => {
      const satellites = Array.from(item.satellites);
      const satelliteDetails = satellites.map((sat) => ({
        name: sat,
        indices: getIndicesForSatellite(sat)
      }));
      return {
        observation_date: item.observation_date,
        cloud_cover_percentage: item.cloud_cover_percentage,
        tile_id: Array.from(item.tiles).join(', ') || 'Multiple tiles',
        satellites,
        satellite_details: satelliteDetails,
        satellite: satellites[0] || 'Unknown'
      };
    });

    // Sort by date descending (most recent first)
    uniqueDates.sort((a, b) => {
      const dateA = new Date(a.observation_date).getTime();
      const dateB = new Date(b.observation_date).getTime();
      return dateB - dateA;
    });

    const totalObservations = (observations || []).length;
    const uniqueDateCount = uniqueDates.length;
    const satellitesRepresented = Array.from(new Set(uniqueDates.flatMap(d => d.satellites)));

    console.log(`✅ Found ${uniqueDateCount} unique observation dates from ${totalObservations} total observations`);
    if (filteredCount > 0) {
      console.log(`⏭️  Filtered out ${filteredCount} future observations (dates after ${todayStr})`);
    }
    console.log(`📊 Satellites represented: ${satellitesRepresented.join(', ')}`);
    console.log(`📅 Today's date: ${todayStr}`);

    return successResponse({
      farm_id: farmId,
      total_dates: uniqueDateCount,
      total_observations: totalObservations, // Total individual satellite observations
      dates: uniqueDates,
      date_list: uniqueDates.map(d => d.observation_date),
      date_range: {
        start: minDateStr,
        end: maxDateStr, // Latest date in requested range
        today: todayStr // Today's date
      },
      metadata: {
        satellites: satellitesRepresented,
        note: uniqueDateCount < totalObservations
          ? `${totalObservations} observations grouped into ${uniqueDateCount} unique dates (multiple satellites per date). Only future dates are filtered out.`
          : 'One observation per date. Only future dates are filtered out.',
        max_available_date: maxDateStr,
        filter_applied: false // No 5-day buffer filter applied
      }
    });

  } catch (error: any) {
    console.error("Get Observation Dates Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

