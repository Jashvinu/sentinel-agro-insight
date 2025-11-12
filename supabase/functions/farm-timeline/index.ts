// Get timeline data for a farm from the database
// Returns all saved indices with timestamps

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    let farmId = url.searchParams.get('farm_id') || 'df43eedf-850d-454c-9fbf-36a052be10c0'; // Default to Jash farm
    const indexType = url.searchParams.get('index'); // Optional filter by index type
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(farmId)) {
      console.log(`Invalid UUID format: ${farmId}, using default`);
      farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0';
    }

    console.log(`Getting timeline for farm: ${farmId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get farm info
    const { data: farm, error: farmError } = await supabase
      .from('farms')
      .select('id, name, bounds, created_at')
      .eq('id', farmId)
      .single();

    if (farmError || !farm) {
      return errorResponse(`Farm not found: ${farmId}`, 404);
    }

    // Build query
    let query = supabase
      .from('agricultural_indices')
      .select('*')
      .eq('farm_id', farmId)
      .order('observation_date', { ascending: false });

    if (indexType) {
      query = query.eq('index_type', indexType.toLowerCase());
    }

    const { data: indices, error: indicesError } = await query;

    if (indicesError) {
      return errorResponse('Error fetching indices data', 500, indicesError);
    }

    // Group by observation_date
    const timeline: Record<string, any[]> = {};
    for (const index of indices || []) {
      const date = index.observation_date;
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push({
        index_type: index.index_type,
        min_value: index.min_value,
        max_value: index.max_value,
        mean_value: index.mean_value,
        std_dev: index.std_dev,
        tile_url: index.tile_url,
        created_at: index.created_at
      });
    }

    // Get unique observation dates
    const observationDates = Object.keys(timeline).sort().reverse();

    // Get statistics
    const stats = {
      total_observations: observationDates.length,
      total_indices: indices?.length || 0,
      index_types: [...new Set(indices?.map(i => i.index_type) || [])],
      date_range: {
        earliest: observationDates[observationDates.length - 1],
        latest: observationDates[0]
      }
    };

    return successResponse({
      farm,
      timeline,
      observation_dates: observationDates,
      stats
    });

  } catch (error: any) {
    console.error("Farm Timeline Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

