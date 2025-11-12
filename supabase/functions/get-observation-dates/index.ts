// Get Observation Dates - Simple endpoint to fetch available satellite dates
import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getIndicesForSatellite } from '../_shared/satellite-utils.ts';

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
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const minDateStr = sixMonthsAgo.toISOString().split('T')[0];

    const { data: observations, error: obsError } = await supabase
      .from('satellite_observations')
      .select('observation_date, cloud_cover_percentage, tile_id, satellite')
      .eq('farm_id', farmId)
      .gte('observation_date', minDateStr)
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

    (observations || []).forEach(obs => {
      const date = obs.observation_date;
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

    console.log(`Found ${uniqueDates.length} unique observation dates`);

    return successResponse({
      farm_id: farmId,
      total_dates: uniqueDates.length,
      dates: uniqueDates,
      date_list: uniqueDates.map(d => d.observation_date)
    });

  } catch (error: any) {
    console.error("Get Observation Dates Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

