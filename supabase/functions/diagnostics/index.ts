/**
 * Diagnostics Edge Function
 * Analyzes satellite data to detect problem areas on farms.
 * Returns analysis results with problem indicators for map visualization.
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ============================================================================
// INLINED SHARED UTILITIES (from _shared/cors.ts, _shared/response.ts, _shared/satellite-utils.ts)
// ============================================================================

// CORS Configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

// Response Utilities
function successResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify({
      success: true,
      ...data,
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

function errorResponse(
  message: string,
  status: number = 500,
  error?: any
): Response {
  const response: any = {
    success: false,
    error: message,
  };

  if (error) {
    response.details = error instanceof Error ? error.message : String(error);
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Satellite Utils (from _shared/satellite-utils.ts)
const SATELLITES = {
  SENTINEL2: {
    id: 'COPERNICUS/S2_SR_HARMONIZED',
    name: 'Sentinel-2',
    cloudProperty: 'CLOUDY_PIXEL_PERCENTAGE',
    scaleFactor: 0.0001
  },
  LANDSAT8: {
    id: 'LANDSAT/LC08/C02/T1_L2',
    name: 'Landsat-8',
    cloudProperty: 'CLOUD_COVER',
    scaleFactor: 0.0000275,
    offset: -0.2
  },
  LANDSAT9: {
    id: 'LANDSAT/LC09/C02/T1_L2',
    name: 'Landsat-9',
    cloudProperty: 'CLOUD_COVER',
    scaleFactor: 0.0000275,
    offset: -0.2
  }
};

function scaleSentinel2Bands(image: any, config: any): any {
  return image
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .multiply(config.scaleFactor)
    .clamp(0, 1)
    .toFloat();
}

function scaleLandsatBands(image: any, config: any): any {
  const offset = config.offset ?? 0;
  const denominator = Math.max(1 - offset, 1e-6);

  const reflectance = image
    .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
    .multiply(config.scaleFactor)
    .add(offset);

  return reflectance
    .subtract(offset)
    .divide(denominator)
    .clamp(0, 1)
    .toFloat();
}

function harmonizeLandsat(image: any, config: any): any {
  const scaled = scaleLandsatBands(image, config)
    .rename(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);

  const propertiesToRemove = [
    'system:bands',
    'system:bands_names',
    'system:bands_types',
    'system:band_types'
  ];

  let properties = ee.List(image.propertyNames());
  for (const prop of propertiesToRemove) {
    properties = properties.remove(prop);
  }

  return ee.Image(scaled).copyProperties(image, properties);
}

function harmonizeSentinel2(image: any, config: any): any {
  const scaled = scaleSentinel2Bands(image, config);

  const propertiesToRemove = [
    'system:bands',
    'system:bands_names',
    'system:bands_types',
    'system:band_types'
  ];

  let properties = ee.List(image.propertyNames());
  for (const prop of propertiesToRemove) {
    properties = properties.remove(prop);
  }

  return ee.Image(scaled).copyProperties(image, properties);
}

function getMergedOpticalCollection(
  poi: any,
  startDate: string,
  endDate: string,
  maxCloudCover: number = 100
): any {
  const s2Collection = ee.ImageCollection(SATELLITES.SENTINEL2.id)
    .filterBounds(poi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt(SATELLITES.SENTINEL2.cloudProperty, maxCloudCover))
    .map((img: any) => {
      const harmonized = harmonizeSentinel2(img, SATELLITES.SENTINEL2);
      return harmonized
        .set('satellite', 'Sentinel-2')
        .set('system:time_start', img.get('system:time_start'))
        .set('cloud_cover', img.get(SATELLITES.SENTINEL2.cloudProperty));
    });

  const l8Collection = ee.ImageCollection(SATELLITES.LANDSAT8.id)
    .filterBounds(poi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt(SATELLITES.LANDSAT8.cloudProperty, maxCloudCover))
    .map((img: any) => {
      const harmonized = harmonizeLandsat(img, SATELLITES.LANDSAT8);
      return harmonized
        .set('satellite', 'Landsat-8')
        .set('system:time_start', img.get('system:time_start'))
        .set('cloud_cover', img.get(SATELLITES.LANDSAT8.cloudProperty));
    });

  const l9Collection = ee.ImageCollection(SATELLITES.LANDSAT9.id)
    .filterBounds(poi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt(SATELLITES.LANDSAT9.cloudProperty, maxCloudCover))
    .map((img: any) => {
      const harmonized = harmonizeLandsat(img, SATELLITES.LANDSAT9);
      return harmonized
        .set('satellite', 'Landsat-9')
        .set('system:time_start', img.get('system:time_start'))
        .set('cloud_cover', img.get(SATELLITES.LANDSAT9.cloudProperty));
    });

  const mergedCollection = s2Collection
    .merge(l8Collection)
    .merge(l9Collection)
    .sort('system:time_start');

  return mergedCollection;
}

function geoJsonToEarthEngine(geometry: {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}): any {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    return ee.Geometry.Polygon(coords);
  } else if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    return ee.Geometry.MultiPolygon(coords);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((result: any, error: any) =>
      error ? reject(new Error(error)) : resolve(result)
    )
  );
}

// ============================================================================
// DIAGNOSTICS LOGIC
// ============================================================================

// Diagnostic indices to analyze
const DIAGNOSTIC_INDICES = ['nitrogen', 'phosphorus', 'potassium', 'moisture', 'ndvi'];

type DiagnosticConfidence = 'high' | 'medium' | 'low';

const INDEX_CONFIDENCE: Record<string, DiagnosticConfidence> = {
  nitrogen: 'high',
  phosphorus: 'low',
  potassium: 'medium',
  moisture: 'medium',
  ndvi: 'high',
};

const NUTRIENT_MODEL_VERSION = 'npk-sufficiency-v2';
const NUTRIENT_MODEL_REFERENCES = [
  'Dianati et al. 2025, Scientific Reports, doi:10.1038/s41598-025-25034-z',
  'Li et al. 2023, Science of The Total Environment, doi:10.1016/j.scitotenv.2023.161421',
  'Zhang et al. 2025, Plant Methods, doi:10.1186/s13007-025-01389-2',
];

// Season-aware thresholds for problem detection
// Adjusted for crop phenology: dormant winter fields should not trigger alerts
type Season = 'winter' | 'spring' | 'summer' | 'fall';

function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

const SEASONAL_THRESHOLDS: Record<Season, Record<string, { low: number; warning: number }>> = {
  winter: {
    nitrogen: { low: 35, warning: 50 },
    phosphorus: { low: 30, warning: 45 },
    potassium: { low: 35, warning: 50 },
    moisture: { low: 2, warning: 5 },
    ndvi: { low: 0.02, warning: 0.05 },      // MSAVI2 - bare soil/dormant
  },
  spring: {
    nitrogen: { low: 45, warning: 60 },
    phosphorus: { low: 35, warning: 50 },
    potassium: { low: 40, warning: 58 },
    moisture: { low: 6, warning: 10 },
    ndvi: { low: 0.08, warning: 0.15 },      // MSAVI2 - early growth
  },
  summer: {
    nitrogen: { low: 50, warning: 65 },
    phosphorus: { low: 35, warning: 52 },
    potassium: { low: 45, warning: 62 },
    moisture: { low: 8, warning: 14 },
    ndvi: { low: 0.12, warning: 0.20 },      // MSAVI2 - peak canopy
  },
  fall: {
    nitrogen: { low: 40, warning: 55 },
    phosphorus: { low: 32, warning: 48 },
    potassium: { low: 38, warning: 55 },
    moisture: { low: 5, warning: 9 },
    ndvi: { low: 0.06, warning: 0.12 },      // MSAVI2 - senescence
  },
};

function getSeasonalThresholds(): Record<string, { low: number; warning: number }> {
  return SEASONAL_THRESHOLDS[getCurrentSeason()];
}

// Trend detection threshold
const TREND_THRESHOLD_PERCENT = -30; // 30% decline triggers alert
const NUTRIENT_TREND_THRESHOLD_POINTS = -15; // 15 point drop on 0-100 sufficiency score
const NUTRIENT_INDICES = new Set(['nitrogen', 'phosphorus', 'potassium']);

function scoreFromRange(image: any, min: number, max: number): any {
  return image.subtract(min).divide(max - min).multiply(100).clamp(0, 100);
}

function weightedScore(
  components: Array<{ image: any; weight: number }>,
  bandName: string
): any {
  let score = ee.Image(0);
  for (const component of components) {
    score = score.add(component.image.multiply(component.weight));
  }
  return score.clamp(0, 100).rename(bandName);
}

function calculateSpectralFeatures(image: any): Record<string, any> {
  const blue = image.select('B2');
  const green = image.select('B3');
  const red = image.select('B4');
  const nir = image.select('B8');
  const swir1 = image.select('B11');
  const swir2 = image.select('B12');

  const ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  const gndvi = nir.subtract(green).divide(nir.add(green)).rename('GNDVI');
  const ndmi = nir.subtract(swir1).divide(nir.add(swir1)).rename('NDMI');
  const swirBalance = swir1.subtract(swir2).divide(swir1.add(swir2)).rename('SWIR_Balance');
  const bsi = swir1.add(red).subtract(nir.add(blue)).divide(swir1.add(red).add(nir).add(blue)).rename('BSI');
  const savi = nir.subtract(red).multiply(1.5).divide(nir.add(red).add(0.5)).rename('SAVI');
  const evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
    { NIR: nir, RED: red, BLUE: blue }
  ).rename('EVI');

  return { ndvi, gndvi, ndmi, swirBalance, bsi, savi, evi };
}

// Index calculation functions
const INDEX_CALCULATORS: Record<string, (image: any) => any> = {
  ndvi: (image: any) => {
    // MSAVI2 - Modified Soil-Adjusted Vegetation Index
    // Better than NDVI for sparse/dormant vegetation: corrects for soil reflectance
    // Formula: (2*NIR + 1 - sqrt((2*NIR+1)^2 - 8*(NIR-RED))) / 2
    const nir = image.select('B8');
    const red = image.select('B4');
    return image.expression(
      '(2 * NIR + 1 - sqrt(pow(2 * NIR + 1, 2) - 8 * (NIR - RED))) / 2',
      { NIR: nir, RED: red }
    ).rename('ndvi');
  },
  nitrogen: (image: any) => {
    const f = calculateSpectralFeatures(image);
    // Satellite nutrient sufficiency score (0-100), not lab kg/ha.
    // Weighted toward green/red/NIR chlorophyll proxies with moisture as stress context.
    return weightedScore([
      { image: scoreFromRange(f.gndvi, -0.05, 0.72), weight: 0.34 },
      { image: scoreFromRange(f.ndvi, -0.05, 0.85), weight: 0.24 },
      { image: scoreFromRange(f.evi, -0.05, 0.65), weight: 0.22 },
      { image: scoreFromRange(f.ndmi, -0.35, 0.45), weight: 0.20 },
    ], 'nitrogen');
  },
  moisture: (image: any) => {
    const nir = image.select('B8');
    const swir = image.select('B11');
    const ndmi = nir.subtract(swir).divide(nir.add(swir));
    // Moisture % = 45.2 × NDMI - 8.7
    return ndmi.multiply(45.2).subtract(8.7).rename('moisture');
  },
  phosphorus: (image: any) => {
    const f = calculateSpectralFeatures(image);
    // Phosphorus has weaker direct spectral expression, so this is conservative
    // and uses vegetation vigor plus soil/SWIR context instead of a hard lab unit.
    return weightedScore([
      { image: scoreFromRange(f.evi, -0.05, 0.65), weight: 0.34 },
      { image: scoreFromRange(f.savi, -0.05, 0.62), weight: 0.24 },
      { image: scoreFromRange(f.bsi.multiply(-1), -0.45, 0.35), weight: 0.22 },
      { image: scoreFromRange(f.ndmi, -0.35, 0.45), weight: 0.20 },
    ], 'phosphorus');
  },
  potassium: (image: any) => {
    const f = calculateSpectralFeatures(image);
    // Potassium is linked to water regulation and showed useful SWIR signal in
    // recent Sentinel-2 macronutrient studies; keep it as a medium-confidence score.
    return weightedScore([
      { image: scoreFromRange(f.savi, -0.05, 0.62), weight: 0.30 },
      { image: scoreFromRange(f.ndmi, -0.35, 0.45), weight: 0.28 },
      { image: scoreFromRange(f.swirBalance, -0.25, 0.35), weight: 0.24 },
      { image: scoreFromRange(f.gndvi, -0.05, 0.72), weight: 0.18 },
    ], 'potassium');
  },
};

// Color palettes for visualization
const INDEX_PALETTES: Record<string, string[]> = {
  ndvi: ['#7f1d1d', '#dc2626', '#f97316', '#eab308', '#22c55e'],
  nitrogen: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
  moisture: ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e40af'],
  phosphorus: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
  potassium: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'],
};

// Value ranges for visualization
const INDEX_RANGES: Record<string, { min: number; max: number }> = {
  ndvi: { min: 0, max: 0.7 },  // MSAVI2 range
  nitrogen: { min: 0, max: 100 },
  moisture: { min: 0, max: 50 },
  phosphorus: { min: 0, max: 100 },
  potassium: { min: 0, max: 100 },
};

interface PrecomputedImages {
  composite: any;
  firstImage: any;
  lastImage: any;
}

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

// ============================================================================
// SUPABASE CLIENT (for cache + storage)
// ============================================================================

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function computeBounds(geometry: { type: string; coordinates: any }): [[number, number], [number, number]] {
  let allCoords: number[][] = [];
  if (geometry.type === 'Polygon') {
    allCoords = (geometry.coordinates as number[][][]).flat();
  } else if (geometry.type === 'MultiPolygon') {
    allCoords = (geometry.coordinates as number[][][][]).flat(2);
  }
  if (allCoords.length === 0) return [[0, 0], [0, 0]];
  const lats = allCoords.map((c) => c[1]);
  const lngs = allCoords.map((c) => c[0]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

async function checkDiagnosticsCache(farmId: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('diagnostics_cache')
    .select('*')
    .eq('farm_id', farmId)
    .gt('expires_at', new Date().toISOString())
    .single();
  if (error || !data) return null;
  return data;
}

function getThumbUrl(image: any, params: any): Promise<string> {
  return new Promise((resolve, reject) =>
    image.getThumbURL(params, (url: string, error: any) =>
      error ? reject(new Error(error)) : resolve(url)
    )
  );
}

async function generateAndUploadRaster(
  index: string,
  image: any,
  farmId: string,
  timestamp: number
): Promise<string | null> {
  try {
    const thumbUrl = await getThumbUrl(image, {
      min: INDEX_RANGES[index].min,
      max: INDEX_RANGES[index].max,
      palette: INDEX_PALETTES[index],
      dimensions: 512,
      format: 'png',
    });

    const imgResponse = await fetch(thumbUrl);
    if (!imgResponse.ok) {
      console.warn(`[Diagnostics] Thumb fetch failed for ${index}: ${imgResponse.status}`);
      return null;
    }
    const bytes = await imgResponse.arrayBuffer();

    const path = `diagnostics/${farmId}/${timestamp}/${index}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('diagnostics')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.warn(`[Diagnostics] Upload failed for ${index}:`, uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('diagnostics')
      .getPublicUrl(path);

    return publicUrl;
  } catch (e) {
    console.warn(`[Diagnostics] Raster generation failed for ${index}:`, e);
    return null;
  }
}

async function upsertDiagnosticsCache(farmId: string, payload: {
  rasterUrls: Record<string, string>;
  bounds: [[number, number], [number, number]];
  cellData: any[];
  analysis: any;
  problems: any[];
  metadata: any;
  season: string;
  indices: string[];
  startDate: string;
  endDate: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('diagnostics_cache')
    .upsert({
      farm_id: farmId,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      date_range: { start: payload.startDate, end: payload.endDate },
      season: payload.season,
      indices: payload.indices,
      raster_urls: payload.rasterUrls,
      bounds: payload.bounds,
      cell_stats: payload.cellData,
      analysis_summary: {
        analysis: payload.analysis,
        problems: payload.problems,
        metadata: payload.metadata,
      },
    }, { onConflict: 'farm_id' });

  if (error) {
    console.warn('[Diagnostics] Cache upsert failed:', error);
  } else {
    console.log('[Diagnostics] Cache upserted successfully');
  }
}

// ============================================================================
// EARTH ENGINE HELPERS
// ============================================================================

function getMapId(image: any, vis: any): Promise<any> {
  return new Promise((resolve, reject) => {
    image.getMapId(vis, (obj: any, error: any) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve({
          urlFormat: obj.urlFormat,
          mapid: obj.mapid,
          token: obj.token
        });
      }
    });
  });
}

async function getMapIdWithRetry(
  image: any,
  vis: any,
  retries: number = 3,
  delayMs: number = 1000
): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await getMapId(image, vis);
    } catch (error: any) {
      const message = error?.message || error?.toString?.() || '';
      const shouldRetry =
        message.includes('Visibility check was unavailable') ||
        message.includes('Please retry the request');

      attempt++;

      if (!shouldRetry || attempt >= retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error('Failed to obtain map ID after retries');
}

async function processIndex(
  index: string,
  precomputed: PrecomputedImages,
  eeGeometry: any,
  timings: Record<string, number>
): Promise<{
  index: string;
  result: any;
  problem: any | null;
}> {
  const calculator = INDEX_CALCULATORS[index];
  if (!calculator) {
    return { index, result: null, problem: null };
  }

  console.log(`[Diagnostics] Processing ${index}...`);
  const indexStart = Date.now();

  const indexImage = calculator(precomputed.composite);
  const firstIndex = calculator(precomputed.firstImage);
  const lastIndex = calculator(precomputed.lastImage);

  const visParams = {
    min: INDEX_RANGES[index].min,
    max: INDEX_RANGES[index].max,
    palette: INDEX_PALETTES[index],
  };

  const parallelOpsStart = Date.now();
  const [statsResult, firstStatsResult, lastStatsResult, mapResult] = await Promise.all([
    (async () => {
      const start = Date.now();
      const stats = await evaluate(
        indexImage.reduceRegion({
          reducer: ee.Reducer.mean()
            .combine(ee.Reducer.min(), '', true)
            .combine(ee.Reducer.max(), '', true)
            .combine(ee.Reducer.stdDev(), '', true),
          geometry: eeGeometry,
          scale: 10,
          maxPixels: 1e9,
        })
      );
      timings[`${index}_stats`] = Date.now() - start;
      console.log(`[Diagnostics] ${index} stats: ${timings[`${index}_stats`]}ms`);
      return stats;
    })(),

    (async () => {
      const start = Date.now();
      try {
        const stats = await evaluate(
          firstIndex.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: eeGeometry,
            scale: 10,
            maxPixels: 1e9,
          })
        );
        timings[`${index}_firstImage`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} first image: ${timings[`${index}_firstImage`]}ms`);
        return stats;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} first image failed:`, e);
        return null;
      }
    })(),

    (async () => {
      const start = Date.now();
      try {
        const stats = await evaluate(
          lastIndex.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: eeGeometry,
            scale: 10,
            maxPixels: 1e9,
          })
        );
        timings[`${index}_lastImage`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} last image: ${timings[`${index}_lastImage`]}ms`);
        return stats;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} last image failed:`, e);
        return null;
      }
    })(),

    (async () => {
      const start = Date.now();
      try {
        const mapData = await getMapIdWithRetry(indexImage.clip(eeGeometry), visParams, 3, 1000);
        timings[`${index}_mapTile`] = Date.now() - start;
        console.log(`[Diagnostics] ${index} map tile: ${timings[`${index}_mapTile`]}ms`);
        return mapData;
      } catch (e) {
        console.warn(`[Diagnostics] ${index} map tile failed:`, e);
        return null;
      }
    })(),
  ]);

  console.log(`[Diagnostics] ${index} parallel ops: ${Date.now() - parallelOpsStart}ms`);

  const stats = statsResult || {};
  const mean = stats[`${index}_mean`] || stats['mean'] || 0;
  const min = stats[`${index}_min`] || stats['min'] || 0;
  const max = stats[`${index}_max`] || stats['max'] || 0;
  const stdDev = stats[`${index}_stdDev`] || stats['stdDev'] || 0;

  const threshold = getSeasonalThresholds()[index];
  // Only flag critical threshold violations (below 'low', not 'warning')
  const belowThreshold = mean < threshold.low;

  let trend = 0;
  let trendDetected = false;
  const trendUnit = NUTRIENT_INDICES.has(index) ? 'points' : 'percent';

  if (firstStatsResult && lastStatsResult) {
    const firstMean = firstStatsResult[index] || firstStatsResult['mean'] || 0;
    const lastMean = lastStatsResult[index] || lastStatsResult['mean'] || 0;

    if (trendUnit === 'points') {
      trend = lastMean - firstMean;
      trendDetected = trend < NUTRIENT_TREND_THRESHOLD_POINTS && lastMean < threshold.warning;
    } else if (firstMean !== 0) {
      trend = ((lastMean - firstMean) / firstMean) * 100;
      trendDetected = trend < TREND_THRESHOLD_PERCENT && lastMean < threshold.warning;
    }
  }

  timings[`${index}_total`] = Date.now() - indexStart;
  console.log(`[Diagnostics] ${index} TOTAL: ${timings[`${index}_total`]}ms`);

  const result = {
    mean,
    min,
    max,
    stdDev,
    belowThreshold,
    trend,
    trendUnit,
    trendDetected,
    confidence: INDEX_CONFIDENCE[index] || 'medium',
    modelVersion: ['nitrogen', 'phosphorus', 'potassium'].includes(index)
      ? NUTRIENT_MODEL_VERSION
      : 'diagnostic-threshold-v1',
    unit: ['nitrogen', 'phosphorus', 'potassium'].includes(index)
      ? 'satellite sufficiency score (0-100)'
      : undefined,
    mapData: mapResult,
  };

  let problem: any | null = null;
  if (belowThreshold || trendDetected) {
    problem = {
      index,
      type: belowThreshold && trendDetected ? 'both' : (belowThreshold ? 'threshold' : 'trend'),
      avgValue: mean,
      avgDecline: trendDetected ? trend : null,
      trendUnit,
      threshold: threshold.low,
      confidence: INDEX_CONFIDENCE[index] || 'medium',
    };
  }

  return { index, result, problem };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const requestStart = Date.now();
  console.log('[Diagnostics] Request started');

  try {
    const url = new URL(req.url);
    const polygonParam = url.searchParams.get('polygon');
    const farmId = url.searchParams.get('farm_id') || null;
    const indicesParam = url.searchParams.get('indices') || DIAGNOSTIC_INDICES.join(',');
    const numDays = parseInt(url.searchParams.get('days') || '14');
    const maxCloudCover = parseInt(url.searchParams.get('cloud') || '50');

    if (!polygonParam) {
      return errorResponse('polygon parameter is required', 400);
    }

    let geometry: any;
    try {
      geometry = JSON.parse(polygonParam);
    } catch (e) {
      return errorResponse('Invalid polygon JSON', 400);
    }

    // Check cache first (skip GEE if valid cache exists)
    if (farmId) {
      const cached = await checkDiagnosticsCache(farmId);
      if (cached) {
        const summary = cached.analysis_summary || {};
        const cachedMetadata = summary.metadata || {};
        const cachedIndices = cached.indices || [];
        const cacheHasCurrentModel =
          cachedMetadata.nutrientModel?.version === NUTRIENT_MODEL_VERSION &&
          cachedIndices.includes('potassium') &&
          cachedMetadata.maxCloudCover === maxCloudCover;

        if (cacheHasCurrentModel) {
          console.log('[Diagnostics] Cache hit for farm:', farmId);
          return successResponse({
            cached: true,
            analysis: summary.analysis || {},
            problems: summary.problems || [],
            cellData: cached.cell_stats || [],
            cell_stats: cached.cell_stats || [],
            raster_urls: cached.raster_urls || {},
            bounds: cached.bounds || [[0, 0], [0, 0]],
            expires_at: cached.expires_at,
            metadata: cachedMetadata,
          });
        }

        console.log('[Diagnostics] Cache stale for farm:', farmId, '— nutrient model changed');
      }
      console.log('[Diagnostics] Cache miss for farm:', farmId, '— running GEE analysis');
    }

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

    if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
      throw new Error("Missing required Google Cloud credentials in environment variables");
    }

    await authenticate(serviceAccountKey);
    console.log('[Diagnostics] Earth Engine authenticated successfully');

    const eeGeometry = geoJsonToEarthEngine(geometry);

    const indices = indicesParam.split(',').filter(i => DIAGNOSTIC_INDICES.includes(i));
    const season = getCurrentSeason();
    console.log(`[Diagnostics] Season: ${season}, Processing indices: ${indices.join(', ')}`);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`[Diagnostics] Date range: ${startDate} to ${endDate} (${numDays} days)`);

    const collectionStart = Date.now();
    const collection = getMergedOpticalCollection(eeGeometry, startDate, endDate, maxCloudCover);
    const imageCount = await evaluate(collection.size());
    if (!imageCount || imageCount <= 0) {
      throw new Error(`No usable optical images found below ${maxCloudCover}% cloud cover for ${startDate} to ${endDate}`);
    }

    const sortedCollection = collection.sort('system:time_start', false);
    console.log(`[Diagnostics] Collection setup: ${Date.now() - collectionStart}ms`);

    const precomputeStart = Date.now();
    const midpointDate = new Date(
      (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2
    ).toISOString().split('T')[0];
    const firstWindow = collection.filterDate(startDate, midpointDate);
    const lastWindow = collection.filterDate(midpointDate, endDate);
    const [firstWindowCount, lastWindowCount] = await Promise.all([
      evaluate(firstWindow.size()),
      evaluate(lastWindow.size()),
    ]);
    const precomputed: PrecomputedImages = {
      composite: sortedCollection.median(),
      firstImage: firstWindowCount > 0
        ? firstWindow.median()
        : sortedCollection.sort('system:time_start', true).first(),
      lastImage: lastWindowCount > 0
        ? lastWindow.median()
        : sortedCollection.sort('system:time_start', false).first(),
    };
    console.log(`[Diagnostics] Pre-computed shared images: ${Date.now() - precomputeStart}ms`);

    const timings: Record<string, number> = {};
    const parallelStart = Date.now();
    console.log(`[Diagnostics] Starting parallel processing of ${indices.length} indices...`);

    const results = await Promise.all(
      indices.map(index => processIndex(index, precomputed, eeGeometry, timings))
    );

    console.log(`[Diagnostics] Parallel processing complete: ${Date.now() - parallelStart}ms`);

    const analysisResults: Record<string, any> = {};
    const problems: any[] = [];

    for (const { index, result, problem } of results) {
      if (result) {
        analysisResults[index] = result;
      }
      if (problem) {
        problems.push(problem);
      }
    }

    // --- Pixel sampling for data-driven spot placement ---
    let cellData: Array<{
      lat: number;
      lng: number;
      nitrogen: number | null;
      phosphorus: number | null;
      potassium: number | null;
      moisture: number | null;
      ndvi: number | null;
    }> = [];
    try {
      const samplingStart = Date.now();
      console.log('[Diagnostics] Starting pixel sampling...');

      // Build a stacked multi-band image with all indices
      const indexBands = indices.map(index => INDEX_CALCULATORS[index](precomputed.composite));
      let stackedImage = indexBands[0];
      for (let i = 1; i < indexBands.length; i++) {
        stackedImage = stackedImage.addBands(indexBands[i]);
      }

      // Sample at 30m resolution (~1000 points for 85ha)
      const samples = stackedImage.sample({
        region: eeGeometry,
        scale: 30,
        geometries: true,
        seed: 42,
      });

      const samplesResult = await evaluate(samples);
      const features = samplesResult?.features || [];
      console.log(`[Diagnostics] Sampled ${features.length} points in ${Date.now() - samplingStart}ms`);

      cellData = features.map((f: any) => {
        const coords = f.geometry?.coordinates || [0, 0];
        const props = f.properties || {};
        return {
          lng: coords[0],
          lat: coords[1],
          nitrogen: props.nitrogen ?? null,
          phosphorus: props.phosphorus ?? null,
          potassium: props.potassium ?? null,
          moisture: props.moisture ?? null,
          ndvi: props.ndvi ?? null,
        };
      });

      timings['pixelSampling'] = Date.now() - samplingStart;
    } catch (samplingError: any) {
      console.warn('[Diagnostics] Pixel sampling failed (falling back to random placement):', samplingError?.message || samplingError);
      cellData = [];
    }

    // --- Raster generation: render + upload PNGs to Supabase Storage ---
    const rasterUrls: Record<string, string> = {};
    const bounds = computeBounds(geometry);

    if (farmId) {
      const rasterStart = Date.now();
      console.log('[Diagnostics] Generating raster images...');
      const timestamp = Date.now();

      const rasterResults = await Promise.all(
        indices.map(async (index) => {
          const clippedImage = INDEX_CALCULATORS[index](precomputed.composite).clip(eeGeometry);
          const publicUrl = await generateAndUploadRaster(index, clippedImage, farmId, timestamp);
          return { index, publicUrl };
        })
      );

      rasterResults.forEach(({ index, publicUrl }) => {
        if (publicUrl) rasterUrls[index] = publicUrl;
      });

      timings['rasterGeneration'] = Date.now() - rasterStart;
      console.log(`[Diagnostics] Raster generation: ${timings['rasterGeneration']}ms (${Object.keys(rasterUrls).length}/${indices.length} uploaded)`);
    }

    const totalTime = Date.now() - requestStart;
    console.log('[Diagnostics] === TIMING SUMMARY ===');
    console.log(`[Diagnostics] Total request time: ${totalTime}ms`);
    console.log('[Diagnostics] Per-index breakdown:');
    for (const index of indices) {
      console.log(`[Diagnostics]   ${index}: ${timings[`${index}_total`] || 'N/A'}ms (stats: ${timings[`${index}_stats`] || 'N/A'}ms, first: ${timings[`${index}_firstImage`] || 'N/A'}ms, last: ${timings[`${index}_lastImage`] || 'N/A'}ms, map: ${timings[`${index}_mapTile`] || 'N/A'}ms)`);
    }
    if (timings['pixelSampling']) {
      console.log(`[Diagnostics]   pixelSampling: ${timings['pixelSampling']}ms (${cellData.length} points)`);
    }
    if (timings['rasterGeneration']) {
      console.log(`[Diagnostics]   rasterGeneration: ${timings['rasterGeneration']}ms`);
    }
    console.log('[Diagnostics] ======================');

    const metadata = {
      daysAnalyzed: numDays,
      imagesAnalyzed: imageCount,
      dateRange: { start: startDate, end: endDate },
      maxCloudCover,
      cloudCover: await evaluate(collection.aggregate_mean('cloud_cover')).catch(() => null),
      resolution: '10m',
      indices,
      season,
      processingTimeMs: totalTime,
      trendMethod: firstWindowCount > 0 && lastWindowCount > 0
        ? 'first-half median vs second-half median'
        : 'first available image vs last available image',
      nutrientModel: {
        version: NUTRIENT_MODEL_VERSION,
        unit: 'satellite nutrient sufficiency score (0-100)',
        confidenceByIndex: INDEX_CONFIDENCE,
        references: NUTRIENT_MODEL_REFERENCES,
      },
    };

    // Persist to cache (non-blocking — don't await to avoid delaying response)
    if (farmId) {
      upsertDiagnosticsCache(farmId, {
        rasterUrls,
        bounds,
        cellData,
        analysis: analysisResults,
        problems,
        metadata,
        season,
        indices,
        startDate,
        endDate,
      }).catch((e) => console.warn('[Diagnostics] Background cache upsert error:', e));
    }

    return successResponse({
      cached: false,
      analysis: analysisResults,
      problems,
      cellData,
      cell_stats: cellData,
      raster_urls: rasterUrls,
      bounds,
      metadata,
    });
  } catch (error: any) {
    const totalTime = Date.now() - requestStart;
    console.error(`[Diagnostics] Error after ${totalTime}ms:`, error);
    return errorResponse(error.message || 'Failed to analyze farm', 500, error);
  }
});
