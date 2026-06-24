// NPK Trend Calculation API for Supabase Edge Function
// Computes per-pixel NPK trend slopes using Theil-Sen algorithm across 8-10 image temporal window
// Returns Earth Engine map tiles for Phase 3 raster tile generation

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { getMergedOpticalCollection } from '../_shared/satellite-utils.ts';

// Import Earth Engine using npm: specifier for Deno
import ee from 'npm:@google/earthengine@1.6.13';

// Request interface
interface TrendRequest {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
  startDate: string;
  endDate: string;
  nutrientType: 'nitrogen' | 'phosphorus' | 'potassium';
}

// Response interface
interface TrendResponse {
  mapid: string;
  token: string;
  urlFormat: string;
  statistics: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
  };
  temporalWindow: number;
  nutrientType: string;
}

const VALID_NUTRIENT_TYPES = ['nitrogen', 'phosphorus', 'potassium'] as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

// Convert GeoJSON to Earth Engine Geometry
function geoJsonToEarthEngine(geometry: any): any {
  if (geometry.type === 'Polygon') {
    return ee.Geometry.Polygon(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    return ee.Geometry.MultiPolygon(geometry.coordinates);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

// Validate request parameters
function validateRequest(body: any): TrendRequest {
  // Validate geometry
  if (!body.geometry || typeof body.geometry !== 'object') {
    throw new Error('Missing or invalid geometry parameter (required GeoJSON Polygon or MultiPolygon)');
  }

  if (!body.geometry.type || !body.geometry.coordinates) {
    throw new Error('Invalid geometry format - must include type and coordinates');
  }

  if (body.geometry.type !== 'Polygon' && body.geometry.type !== 'MultiPolygon') {
    throw new Error('Geometry type must be Polygon or MultiPolygon');
  }

  // Validate dates
  if (!body.startDate || !DATE_REGEX.test(body.startDate)) {
    throw new Error('Missing or invalid startDate (required format: YYYY-MM-DD)');
  }

  if (!body.endDate || !DATE_REGEX.test(body.endDate)) {
    throw new Error('Missing or invalid endDate (required format: YYYY-MM-DD)');
  }

  // Validate nutrientType
  if (!body.nutrientType) {
    throw new Error('Missing nutrientType parameter (required: nitrogen, phosphorus, or potassium)');
  }

  if (!VALID_NUTRIENT_TYPES.includes(body.nutrientType)) {
    throw new Error(`Invalid nutrientType '${body.nutrientType}' - must be one of: ${VALID_NUTRIENT_TYPES.join(', ')}`);
  }

  return {
    geometry: body.geometry,
    startDate: body.startDate,
    endDate: body.endDate,
    nutrientType: body.nutrientType,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed - use POST', 405);
  }

  try {
    console.log('Processing NPK trend calculation request');

    // Parse and validate request body
    let requestData: TrendRequest;
    try {
      const body = await req.json();
      requestData = validateRequest(body);
    } catch (validationError: any) {
      return errorResponse(validationError.message, 400);
    }

    console.log(`Request validated: ${requestData.nutrientType} from ${requestData.startDate} to ${requestData.endDate}`);

    // Get service account credentials from environment variables
    let serviceAccountKey: any;
    const googleCredsJson = Deno.env.get('GOOGLE_CREDENTIALS_JSON');

    if (googleCredsJson) {
      try {
        const parsed = JSON.parse(googleCredsJson);
        if (parsed.private_key && typeof parsed.private_key === 'string') {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        serviceAccountKey = parsed;
      } catch (e: any) {
        throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${e.message}`);
      }
    } else {
      serviceAccountKey = {
        type: 'service_account',
        project_id: Deno.env.get('GOOGLE_PROJECT_ID'),
        private_key_id: Deno.env.get('GOOGLE_PRIVATE_KEY_ID'),
        private_key: Deno.env.get('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        client_email: Deno.env.get('GOOGLE_CLIENT_EMAIL'),
        client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: Deno.env.get('GOOGLE_CLIENT_X509_CERT_URL'),
        universe_domain: 'googleapis.com',
      };
    }

    // Validate required environment variables
    if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
      throw new Error('Missing required Google Cloud credentials in environment variables');
    }

    // Authenticate Earth Engine
    await authenticate(serviceAccountKey);
    console.log('Earth Engine authenticated successfully');

    // Convert GeoJSON geometry to Earth Engine Geometry
    const poi = geoJsonToEarthEngine(requestData.geometry);

    // 1. Fetch Sentinel-2 image collection (8-10 images)
    const collection = getMergedOpticalCollection(
      poi,
      requestData.startDate,
      requestData.endDate,
      20 // CLOUDY_PIXEL_PERCENTAGE < 20
    );

    // Limit to 8-10 most recent images
    const sortedCollection = collection.sort('system:time_start', false).limit(10);

    // Get image count for verification
    const imageCount = await new Promise<number>((resolve, reject) => {
      sortedCollection.size().evaluate((result: any, error: any) =>
        error ? reject(new Error(error)) : resolve(result)
      );
    });

    if (imageCount === 0) {
      return errorResponse('No suitable images found for the specified date range and geometry', 404);
    }

    console.log(`Processing ${imageCount} images for ${requestData.nutrientType} trend calculation`);

    // 2. Calculate NPK index per image based on nutrientType
    const collectionWithNutrient = sortedCollection.map((img: any) => {
      // Apply scale factor 0.0001 to Sentinel-2 bands
      const scaled = img.multiply(0.0001);
      const nir = scaled.select('B8');
      const red = scaled.select('B4');
      const blue = scaled.select('B2');

      let nutrientBand;

      if (requestData.nutrientType === 'nitrogen') {
        // N = 259.4 × NDVI - 58.6
        const ndvi = nir.subtract(red).divide(nir.add(red));
        nutrientBand = ndvi.multiply(259.4).subtract(58.6);
      } else if (requestData.nutrientType === 'phosphorus') {
        // EVI = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)
        // P₂O₅ = 180 × EVI - 25
        const G = 2.5;
        const L = 1;
        const C1 = 6;
        const C2 = 7.5;
        const evi = ee.Image(G).multiply(
          nir.subtract(red).divide(
            nir.add(ee.Image(C1).multiply(red)).subtract(ee.Image(C2).multiply(blue)).add(L)
          )
        );
        nutrientBand = evi.multiply(180).subtract(25);
      } else {
        // potassium
        // SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5
        // K₂O = 250 × SAVI - 40
        const L = 0.5;
        const savi = nir.subtract(red).multiply(1 + L).divide(nir.add(red).add(L));
        nutrientBand = savi.multiply(250).subtract(40);
      }

      return img.addBands(nutrientBand.rename('nutrient_value'));
    });

    // 3. Per-pixel Theil-Sen slope calculation using Earth Engine reducers
    // Create time variable (days since epoch)
    const collectionWithTime = collectionWithNutrient.map((img: any) => {
      const timeMillis = img.get('system:time_start');
      const timeDays = ee.Number(timeMillis).divide(1000 * 60 * 60 * 24); // Convert to days
      return img.addBands(ee.Image.constant(timeDays).rename('time'));
    });

    // Use sensSlope reducer for Theil-Sen estimation per pixel
    // sensSlope expects two bands: independent variable (time) and dependent variable (nutrient_value)
    const slopeImage = collectionWithTime
      .select(['time', 'nutrient_value'])
      .reduce(ee.Reducer.sensSlope());

    // Extract slope band (change per day) and convert to annual trend (multiply by 365)
    const slopeBand = slopeImage.select('slope');
    const annualTrend = slopeBand.multiply(365).clip(poi);

    // 4. Calculate statistics first, then use for visualization
    // Calculate statistics using reduceRegion
    const stats = await new Promise<any>((resolve, reject) => {
      annualTrend
        .reduceRegion({
          reducer: ee.Reducer.min()
            .combine(ee.Reducer.max(), '', true)
            .combine(ee.Reducer.mean(), '', true)
            .combine(ee.Reducer.stdDev(), '', true),
          geometry: poi,
          scale: 30, // 30m resolution (Landsat-compatible)
          maxPixels: 1e9,
        })
        .evaluate((result: any, error: any) => {
          if (error) {
            reject(new Error(error));
          } else {
            resolve(result);
          }
        });
    });

    // Extract statistics (band name is 'constant' from the slope calculation)
    const minValue = stats.constant_min ?? -50;
    const maxValue = stats.constant_max ?? 50;

    // Apply 10% padding for better contrast
    const paddedMin = minValue * 1.1;
    const paddedMax = maxValue * 1.1;

    // Get map tile URL using getMapId with data-driven parameters
    const mapIdResult = await new Promise<any>((resolve, reject) => {
      annualTrend.getMapId(
        {
          min: paddedMin,
          max: paddedMax,
          palette: ['darkred', 'red', 'yellow', 'lightgreen', 'darkgreen'],
        },
        (obj: any, error: any) => {
          if (error) {
            reject(new Error(error));
          } else {
            resolve({
              urlFormat: obj.urlFormat,
              mapid: obj.mapid,
              token: obj.token,
            });
          }
        }
      );
    });

    const response: TrendResponse = {
      mapid: mapIdResult.mapid,
      token: mapIdResult.token,
      urlFormat: mapIdResult.urlFormat,
      statistics: {
        min: minValue,
        max: maxValue,
        mean: stats.constant_mean ?? 0,
        stdDev: stats.constant_stdDev ?? 0,
      },
      temporalWindow: imageCount,
      nutrientType: requestData.nutrientType,
    };

    console.log(`NPK trend calculation complete: ${imageCount} images processed, slope range: ${response.statistics.min} to ${response.statistics.max}`);

    return successResponse(response);

  } catch (error: any) {
    console.error('NPK Trend Calculation Error:', error);
    return errorResponse(error.message || 'Unknown error', 500, error);
  }
});
