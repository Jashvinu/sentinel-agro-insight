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
    const { polygon, startDate, endDate, index = 'NDVI' } = await req.json()
    
    // Get Google Earth Engine credentials from Supabase secrets
    const serviceAccountKey = Deno.env.get('GOOGLE_EARTH_ENGINE_KEY')
    if (!serviceAccountKey) {
      throw new Error('Google Earth Engine service account key not found in secrets')
    }

    // Parse the service account key
    const credentials = JSON.parse(serviceAccountKey)
    
    // Google Earth Engine REST API endpoint
    const earthEngineEndpoint = 'https://earthengine.googleapis.com/v1/projects/earthengine-legacy/algorithms:run'
    
    // Create the Earth Engine request payload
    const earthEnginePayload = {
      expression: `
        var geometry = ee.Geometry.Polygon(${JSON.stringify([polygon])});
        var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(geometry)
          .filterDate('${startDate}', '${endDate}')
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
          .sort('CLOUDY_PIXEL_PERCENTAGE')
          .first();
        
        var ${index.toLowerCase()} = collection.normalizedDifference(['B8', 'B4']).rename('${index}');
        
        var stats = ${index.toLowerCase()}.reduceRegion({
          reducer: ee.Reducer.mean().combine({
            reducer2: ee.Reducer.max(),
            sharedInputs: true
          }).combine({
            reducer2: ee.Reducer.min(),
            sharedInputs: true
          }).combine({
            reducer2: ee.Reducer.stdDev(),
            sharedInputs: true
          }),
          geometry: geometry,
          scale: 10,
          maxPixels: 1e9
        });
        
        {
          mean: stats.get('${index}_mean'),
          max: stats.get('${index}_max'),
          min: stats.get('${index}_min'),
          stdDev: stats.get('${index}_stdDev'),
          cloudCover: collection.get('CLOUDY_PIXEL_PERCENTAGE'),
          date: collection.get('system:time_start')
        }
      `
    }

    // Get OAuth token for Google Earth Engine
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await createJWT(credentials)
      })
    })

    const tokenData = await tokenResponse.json()
    
    // Make request to Earth Engine
    const response = await fetch(earthEngineEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(earthEnginePayload)
    })

    const data = await response.json()
    
    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

async function createJWT(credentials: any) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  const signingInput = `${encodedHeader}.${encodedPayload}`
  
  // Import the private key for signing
  const keyData = credentials.private_key.replace(/\\n/g, '\n')
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    new TextEncoder().encode(keyData),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${signingInput}.${encodedSignature}`
}