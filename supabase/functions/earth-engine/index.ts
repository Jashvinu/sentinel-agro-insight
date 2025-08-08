import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Define POI polygon (coordinates from the ee-webmap project)
    const poi = [
      [77.77333199305133, 12.392392446684909],
      [77.77285377084087, 12.391034719901086],
      [77.77415744218291, 12.390603704636632],
      [77.77438732135664, 12.391302225016886],
      [77.77376792469431, 12.391501801924363],
      [77.77399141833513, 12.392187846379386],
      [77.77333199305133, 12.392392446684909]
    ];

    // Create POI polygon for display
    const poiPolygon = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [poi]
      },
      properties: {}
    };

    // For demonstration purposes, let's create a mock MSAVI tile URL
    // In a real implementation, this would be generated from Google Earth Engine
    const mockMsaviTileUrl = "https://earthengine.googleapis.com/map/{z}/{x}/{y}?token=mock_token&expression=msavi_expression";

    // Return the result to the client/browser
    return new Response(
      JSON.stringify({
        urlFormat: mockMsaviTileUrl,
        geojson: {
          type: "Polygon",
          coordinates: [poi]
        },
        poiPolygon: poiPolygon,
        minMax: {
          MSAVI_min: 0.1,
          MSAVI_max: 0.8
        },
        // Mock MSAVI data for demonstration
        msaviData: {
          mean: 0.45,
          max: 0.78,
          min: 0.12,
          stdDev: 0.15,
          cloudCover: 8.5,
          date: new Date().getTime()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error("Earth Engine Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})