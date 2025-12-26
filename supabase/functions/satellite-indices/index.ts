// Satellite Indices API - Get indices for a specific satellite
// This endpoint wraps agricultural-indices with required satellite parameter
// Supports: Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR

import { handleCors } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/response.ts';
import { getIndicesForSatellite } from '../_shared/satellite-utils.ts';

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
    const indexParam = url.searchParams.get('index') || 'ndvi';

    // Validate satellite parameter
    if (!satelliteParam || !VALID_SATELLITES.includes(satelliteParam)) {
      return errorResponse(
        `Invalid or missing satellite parameter. Valid options: ${VALID_SATELLITES.join(', ')}`,
        400
      );
    }

    const satellite = satelliteParam as typeof VALID_SATELLITES[number];
    const availableIndices = getIndicesForSatellite(satellite);

    // Validate index parameter
    if (!availableIndices.includes(indexParam.toLowerCase())) {
      return errorResponse(
        `Invalid index "${indexParam}" for ${satellite}. Available indices: ${availableIndices.join(', ')}`,
        400
      );
    }

    // Redirect to agricultural-indices with satellite parameter
    // Build the redirect URL with all original parameters plus satellite
    const baseUrl = url.origin + url.pathname.replace('/satellite-indices', '/agricultural-indices');
    const params = new URLSearchParams(url.searchParams);
    params.set('satellite', satellite);
    
    // Return a response indicating to use agricultural-indices
    return new Response(
      JSON.stringify({
        success: false,
        message: `Please use the agricultural-indices endpoint with satellite parameter`,
        redirect_url: `${baseUrl}?${params.toString()}`,
        satellite: satellite,
        index: indexParam,
        available_indices: availableIndices,
        note: 'The agricultural-indices endpoint already supports satellite filtering. Use: agricultural-indices?satellite=' + satellite + '&index=' + indexParam + '&polygon=...'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      }
    );

  } catch (error: any) {
    console.error("Satellite Indices Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

