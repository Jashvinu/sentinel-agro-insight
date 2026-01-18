// Agricultural Indices API for Supabase Edge Function
// Uses Google Earth Engine to calculate vegetation indices from multiple satellites
// Supports: Sentinel-2, Landsat 8, Landsat 9, and Sentinel-1 SAR

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import * as satelliteUtils from '../_shared/satellite-utils.ts';
import {
  getMergedOpticalCollection,
  getDataSourceSummary,
  getCollectionScale,
  getSentinel1Collection
} from '../_shared/satellite-utils.ts';

// Import Earth Engine using npm: specifier for Deno
import ee from 'npm:@google/earthengine@1.6.13';

// Get geoJsonToEarthEngine from the module (with fallback)
const geoJsonToEarthEngine = satelliteUtils.geoJsonToEarthEngine || ((geometry: any) => {
  if (geometry.type === 'Polygon') {
    return ee.Geometry.Polygon(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    return ee.Geometry.MultiPolygon(geometry.coordinates);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
});

const OPTICAL_SATELLITES = ['Sentinel-2', 'Landsat-8', 'Landsat-9'] as const;
const SATELLITE_DESCRIPTIONS: Record<string, string> = {
  'Sentinel-2': 'Sentinel-2 MSI harmonized optical imagery',
  'Landsat-8': 'Landsat 8 OLI/TIRS harmonized optical imagery',
  'Landsat-9': 'Landsat 9 OLI-2/TIRS-2 harmonized optical imagery',
  'Sentinel-1 SAR': 'Sentinel-1 C-band radar (VV/VH dual polarization)'
};

type OpticalSatellite = typeof OPTICAL_SATELLITES[number];

interface SatelliteLayerResult {
  satellite: string;
  urlFormat: string;
  mapid: string;
  token: string;
  cloudCover?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  mean_value?: number | null;
  std_dev?: number | null;
  data_source?: {
    satellites: string[];
    description: string;
  };
  metadata?: any;
}

async function computeCloudCover(collection: any, evaluateFn: typeof evaluate): Promise<number | null> {
  try {
    const cloudValue = await evaluateFn(collection.aggregate_mean('cloud_cover'));
    if (typeof cloudValue === 'number') {
      return Math.round(cloudValue * 10) / 10;
    }
  } catch (_error) {
    // ignore cloud aggregation errors
  }
  return null;
}

function buildDataSource(satellites: string[]): { satellites: string[]; description: string } {
  const descriptionSegments = satellites.map((sat) => SATELLITE_DESCRIPTIONS[sat] || sat);
  return {
    satellites,
    description: descriptionSegments.join(', ')
  };
}

async function calculateSatelliteLayer(
  index: string,
  poi: any,
  startDate: string,
  endDate: string,
  satellite: OpticalSatellite
): Promise<SatelliteLayerResult | null> {
  let satelliteResult: any = null;
  switch (index) {
    case 'ndvi':
      satelliteResult = await calculateNDVI(poi, startDate, endDate, satellite);
      break;
    case 'evi':
      satelliteResult = await calculateEVI(poi, startDate, endDate, satellite);
      break;
    case 'savi':
      satelliteResult = await calculateSAVI(poi, startDate, endDate, satellite);
      break;
    case 'msavi':
      satelliteResult = await calculateMSAVI(poi, startDate, endDate, satellite);
      break;
    case 'ndwi':
      satelliteResult = await calculateNDWI(poi, startDate, endDate, satellite);
      break;
    case 'gndvi':
      satelliteResult = await calculateGNDVI(poi, startDate, endDate, satellite);
      break;
    case 'ndre':
      satelliteResult = await calculateNDRE(poi, startDate, endDate, satellite);
      break;
    case 'nitrogen':
      satelliteResult = await calculateNitrogen(poi, startDate, endDate, satellite);
      break;
    case 'phosphorus':
      satelliteResult = await calculatePhosphorus(poi, startDate, endDate, satellite);
      break;
    case 'potassium':
      satelliteResult = await calculatePotassium(poi, startDate, endDate, satellite);
      break;
    case 'salinity':
      satelliteResult = await calculateSalinity(poi, startDate, endDate, satellite);
      break;
    case 'ph':
      satelliteResult = await calculatePH(poi, startDate, endDate, satellite);
      break;
    case 'moisture':
      satelliteResult = await calculateMoisture(poi, startDate, endDate, satellite);
      break;
    case 'carbon':
      satelliteResult = await calculateCarbon(poi, startDate, endDate, satellite);
      break;
    default:
      satelliteResult = await calculateNDVI(poi, startDate, endDate, satellite);
      break;
  }

  if (!satelliteResult) {
    return null;
  }

  return {
    satellite,
    urlFormat: satelliteResult.urlFormat,
    mapid: satelliteResult.mapid,
    token: satelliteResult.token,
    cloudCover: typeof satelliteResult.cloud_cover === 'number' ? satelliteResult.cloud_cover : null,
    min_value: satelliteResult.min_value ?? null,
    max_value: satelliteResult.max_value ?? null,
    mean_value: satelliteResult.mean_value ?? null,
    std_dev: satelliteResult.std_dev ?? null,
    data_source: satelliteResult.data_source || buildDataSource([satellite]),
    metadata: {
      algorithm: index.toUpperCase(),
      calculationMethod: getCalculationMethod(index),
      cloudFilter: satelliteResult.cloud_filter || '< 100%',
      dateRange: { start: startDate, end: endDate }
    }
  };
}

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

// Function to get the image tile url with proper return structure
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

// Function to get calculation method description for each index
function getCalculationMethod(index: string): string {
  const methods: { [key: string]: string } = {
    'ndvi': 'NDVI = (NIR - Red) / (NIR + Red) - Normalized Difference Vegetation Index',
    'evi': 'EVI = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1) - Enhanced Vegetation Index',
    'savi': 'SAVI = (NIR - Red) × (1 + L) / (NIR + Red + L) - Soil Adjusted Vegetation Index',
    'msavi': 'MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2 - Modified Soil Adjusted Vegetation Index',
    'ndwi': 'NDWI = (NIR - SWIR) / (NIR + SWIR) - Normalized Difference Water Index for Water Detection',
    'gndvi': 'GNDVI = (NIR - Green) / (NIR + Green) - Green NDVI, more sensitive to chlorophyll concentration',
    'ndre': 'NDRE = (NIR - RedEdge) / (NIR + RedEdge) - Normalized Difference Red Edge Index for late-season N estimation',
    'nitrogen': 'N = 259.4 × NDVI - 58.6 (R²=0.90) - Nitrogen content in kg N/ha',
    'phosphorus': 'P₂O₅ = 180 × EVI - 25 - Phosphorus content in kg P₂O₅/ha',
    'potassium': 'K₂O = 250 × SAVI - 40 - Potassium content in kg K₂O/ha',
    'salinity': 'ECe = 0.0045 × SI + 1.2 - Electrical Conductivity in dS/m',
    'ph': 'pH = 0.023×Blue - 0.015×SWIR + 7.2 (±0.35) - Soil pH estimation',
    'moisture': 'Moisture % = 45.2 × NDMI - 8.7 - Volumetric moisture content',
    'carbon': 'SOC % = 12.5 × NDVI - 3.2 (R²=0.79) - Soil Organic Carbon percentage',
    'sar_moisture': 'SAR Moisture Index = (VV - VH) / (VV + VH) scaled to 0-100% - Radar-derived surface moisture proxy'
  };
  return methods[index] || 'Standard vegetation index calculation';
}

// Function to get an actual value of an ee object
function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((result: any, error: any) =>
      error ? reject(new Error(error)) : resolve(result)
    )
  );
}

function isFiniteNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function safeReduceRegion(
  image: any,
  options: {
    reducer: any;
    geometry: any;
    scale: number;
    maxPixels?: number;
    bestEffort?: boolean;
  }
): Promise<any | null> {
  try {
    return await evaluate(image.reduceRegion(options));
  } catch (error) {
    console.warn('reduceRegion failed', error);
    return null;
  }
}

// Function to save farm and index data to database
async function saveToDatabase(
  supabase: any,
  polygonCoords: any,
  indexType: string,
  dateRange: { start: string; end: string },
  tileUrl: string,
  metadata: any
) {
  try {
    // Convert GeoJSON to WKT for PostGIS
    const polygon = {
      type: 'Polygon',
      coordinates: polygonCoords
    };

    // First, try to find existing farm with the same geometry
    const { data: existingFarm, error: farmError } = await supabase
      .from('farms')
      .select('id')
      .eq('name', 'Jash Farm')  // This should be parameterized later
      .single();

    let farmId;

    if (existingFarm) {
      farmId = existingFarm.id;
      console.log(`Using existing farm: ${farmId}`);
    } else {
      // Create new farm
      const { data: newFarm, error: insertError } = await supabase
        .from('farms')
        .insert({
          name: 'Jash Farm',
          geometry: polygon,
          bounds: {
            minLng: Math.min(...polygonCoords[0].map((c: any) => c[0])),
            minLat: Math.min(...polygonCoords[0].map((c: any) => c[1])),
            maxLng: Math.max(...polygonCoords[0].map((c: any) => c[0])),
            maxLat: Math.max(...polygonCoords[0].map((c: any) => c[1]))
          }
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating farm:', insertError);
        return null;
      }

      farmId = newFarm.id;
      console.log(`Created new farm: ${farmId}`);
    }

    // Save index data
    // Use the middle date as observation_date
    const observationDate = new Date((new Date(dateRange.start).getTime() + new Date(dateRange.end).getTime()) / 2)
      .toISOString()
      .split('T')[0];

    const { data: indexData, error: indexError } = await supabase
      .from('agricultural_indices')
      .upsert({
        farm_id: farmId,
        observation_date: observationDate,
        index_type: indexType.toLowerCase(),
        min_value: metadata.min_value || null,
        max_value: metadata.max_value || null,
        mean_value: metadata.mean_value || null,
        std_dev: metadata.std_dev || null,
        tile_url: tileUrl,
        metadata: {
          dateRange,
          calculationMethod: metadata.calculationMethod,
          dataSource: metadata.dataSource,
          cloudFilter: metadata.cloudFilter
        }
      }, {
        onConflict: 'farm_id,observation_date,index_type'
      })
      .select()
      .single();

    if (indexError) {
      console.error('Error saving index data:', indexError);
      return null;
    }

    console.log(`✅ Saved ${indexType} data for farm ${farmId} on ${observationDate}`);
    return { farmId, indexData };

  } catch (error) {
    console.error('Database save error:', error);
    return null;
  }
}

// Calculate NDVI (Normalized Difference Vegetation Index)
async function calculateNDVI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  // Get merged collection from all optical satellites
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  // If using a single date, get the first (closest) image; otherwise use median
  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI");
  const clippedNdvi = ndvi.clip(poi);

  // Get data sources used
  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);

  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNdvi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.NDVI_min) || !isFiniteNumber(minMax.NDVI_max)) {
    console.warn('NDVI statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedNdvi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.NDVI_mean) ? stats.NDVI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.NDVI_stdDev) ? stats.NDVI_stdDev : null;

  const vis = {
    min: minMax.NDVI_min,
    max: minMax.NDVI_max,
    palette: ["red", "yellow", "green", "darkgreen"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedNdvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.NDVI_min,
    max_value: minMax.NDVI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate EVI (Enhanced Vegetation Index)
async function calculateEVI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const blue = image.select("B2");

  const G = 2.5;
  const L = 1;
  const C1 = 6;
  const C2 = 7.5;

  const evi = ee.Image(G).multiply(
    nir.subtract(red).divide(
      nir.add(ee.Image(C1).multiply(red)).subtract(ee.Image(C2).multiply(blue)).add(L)
    )
  ).rename("EVI");

  const clippedEvi = evi.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedEvi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.EVI_min) || !isFiniteNumber(minMax.EVI_max)) {
    console.warn('EVI statistics unavailable for requested range.');
    return null;
  }

  const vis = {
    min: minMax.EVI_min,
    max: minMax.EVI_max,
    palette: ["red", "yellow", "green", "darkgreen"]
  };

  const stats = await safeReduceRegion(clippedEvi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.EVI_mean) ? stats.EVI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.EVI_stdDev) ? stats.EVI_stdDev : null;

  const mapIdResult = await getMapIdWithRetry(clippedEvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.EVI_min,
    max_value: minMax.EVI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate SAVI (Soil Adjusted Vegetation Index)
async function calculateSAVI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const L = 0.5;

  const savi = nir.subtract(red).multiply(1 + L).divide(
    nir.add(red).add(L)
  ).rename("SAVI");

  const clippedSavi = savi.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedSavi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.SAVI_min) || !isFiniteNumber(minMax.SAVI_max)) {
    console.warn('SAVI statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedSavi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.SAVI_mean) ? stats.SAVI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.SAVI_stdDev) ? stats.SAVI_stdDev : null;

  const vis = {
    min: minMax.SAVI_min,
    max: minMax.SAVI_max,
    palette: ["red", "yellow", "green", "darkgreen"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedSavi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.SAVI_min,
    max_value: minMax.SAVI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate MSAVI (Modified Soil Adjusted Vegetation Index)
async function calculateMSAVI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const msavi = nir.multiply(2).add(1)
    .subtract((nir.multiply(2).add(1)).pow(2).subtract(nir.subtract(red).multiply(8)).sqrt())
    .divide(2).rename("MSAVI");

  const clippedMsavi = msavi.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedMsavi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.MSAVI_min) || !isFiniteNumber(minMax.MSAVI_max)) {
    console.warn('MSAVI statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedMsavi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.MSAVI_mean) ? stats.MSAVI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.MSAVI_stdDev) ? stats.MSAVI_stdDev : null;

  const vis = {
    min: minMax.MSAVI_min,
    max: minMax.MSAVI_max,
    palette: ["red", "yellow", "green", "darkgreen"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedMsavi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.MSAVI_min,
    max_value: minMax.MSAVI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate NDWI (Normalized Difference Water Index)
async function calculateNDWI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const swir = image.select("B11");

  const ndwi = nir.subtract(swir).divide(nir.add(swir)).rename("NDWI");
  const clippedNdwi = ndwi.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNdwi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.NDWI_min) || !isFiniteNumber(minMax.NDWI_max)) {
    console.warn('NDWI statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedNdwi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.NDWI_mean) ? stats.NDWI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.NDWI_stdDev) ? stats.NDWI_stdDev : null;

  const vis = {
    min: minMax.NDWI_min,
    max: minMax.NDWI_max,
    palette: ["brown", "yellow", "lightblue", "blue", "darkblue"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedNdwi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.NDWI_min,
    max_value: minMax.NDWI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate GNDVI (Green Normalized Difference Vegetation Index)
// More sensitive to chlorophyll concentration than standard NDVI
async function calculateGNDVI(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");    // NIR band
  const green = image.select("B3");  // Green band (instead of Red for GNDVI)

  const gndvi = nir.subtract(green).divide(nir.add(green)).rename("GNDVI");
  const clippedGndvi = gndvi.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedGndvi, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.GNDVI_min) || !isFiniteNumber(minMax.GNDVI_max)) {
    console.warn('GNDVI statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedGndvi, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.GNDVI_mean) ? stats.GNDVI_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.GNDVI_stdDev) ? stats.GNDVI_stdDev : null;

  const vis = {
    min: minMax.GNDVI_min,
    max: minMax.GNDVI_max,
    palette: ["#8B0000", "#FF4500", "#FFD700", "#9ACD32", "#228B22", "#006400"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedGndvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.GNDVI_min,
    max_value: minMax.GNDVI_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate NDRE (Normalized Difference Red Edge Index)
// Optimal for late-season nitrogen estimation and canopy penetration
async function calculateNDRE(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");       // NIR band
  const redEdge = image.select("B5");   // Red Edge band (705nm)

  const ndre = nir.subtract(redEdge).divide(nir.add(redEdge)).rename("NDRE");
  const clippedNdre = ndre.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNdre, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.NDRE_min) || !isFiniteNumber(minMax.NDRE_max)) {
    console.warn('NDRE statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedNdre, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.NDRE_mean) ? stats.NDRE_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.NDRE_stdDev) ? stats.NDRE_stdDev : null;

  const vis = {
    min: minMax.NDRE_min,
    max: minMax.NDRE_max,
    palette: ["#8B4513", "#DAA520", "#ADFF2F", "#32CD32", "#006400"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedNdre, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.NDRE_min,
    max_value: minMax.NDRE_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Nitrogen (using NDVI-based correlation)
async function calculateNitrogen(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const ndvi = nir.subtract(red).divide(nir.add(red));
  // N (kg/ha) = 259.4 * NDVI - 58.6
  const nitrogen = ndvi.multiply(259.4).subtract(58.6).rename("Nitrogen");
  const clippedNitrogen = nitrogen.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNitrogen, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Nitrogen_min) || !isFiniteNumber(minMax.Nitrogen_max)) {
    console.warn('Nitrogen statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedNitrogen, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Nitrogen_mean) ? stats.Nitrogen_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Nitrogen_stdDev) ? stats.Nitrogen_stdDev : null;

  const vis = {
    min: minMax.Nitrogen_min,
    max: minMax.Nitrogen_max,
    palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedNitrogen, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Nitrogen_min,
    max_value: minMax.Nitrogen_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Phosphorus (using EVI-based correlation)
async function calculatePhosphorus(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const blue = image.select("B2");

  const G = 2.5;
  const L = 1;
  const C1 = 6;
  const C2 = 7.5;

  const evi = ee.Image(G).multiply(
    nir.subtract(red).divide(
      nir.add(ee.Image(C1).multiply(red)).subtract(ee.Image(C2).multiply(blue)).add(L)
    )
  );

  // P₂O₅ (kg/ha) = 180 * EVI - 25
  const phosphorus = evi.multiply(180).subtract(25).rename("Phosphorus");
  const clippedPhosphorus = phosphorus.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPhosphorus, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Phosphorus_min) || !isFiniteNumber(minMax.Phosphorus_max)) {
    console.warn('Phosphorus statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedPhosphorus, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Phosphorus_mean) ? stats.Phosphorus_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Phosphorus_stdDev) ? stats.Phosphorus_stdDev : null;

  const vis = {
    min: minMax.Phosphorus_min,
    max: minMax.Phosphorus_max,
    palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedPhosphorus, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Phosphorus_min,
    max_value: minMax.Phosphorus_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Potassium (using SAVI-based correlation)
async function calculatePotassium(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const L = 0.5;

  const savi = nir.subtract(red).multiply(1 + L).divide(
    nir.add(red).add(L)
  );

  // K₂O (kg/ha) = 250 * SAVI - 40
  const potassium = savi.multiply(250).subtract(40).rename("Potassium");
  const clippedPotassium = potassium.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPotassium, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Potassium_min) || !isFiniteNumber(minMax.Potassium_max)) {
    console.warn('Potassium statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedPotassium, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Potassium_mean) ? stats.Potassium_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Potassium_stdDev) ? stats.Potassium_stdDev : null;

  const vis = {
    min: minMax.Potassium_min,
    max: minMax.Potassium_max,
    palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedPotassium, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Potassium_min,
    max_value: minMax.Potassium_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Soil Salinity
async function calculateSalinity(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const blue = image.select("B2");
  const red = image.select("B4");

  // Salinity Index (SI) = (Blue + Red) / 2
  const si = blue.add(red).divide(2);

  // ECe (dS/m) = 0.0045 * SI + 1.2
  const salinity = si.multiply(0.0045).add(1.2).rename("Salinity");
  const clippedSalinity = salinity.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedSalinity, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Salinity_min) || !isFiniteNumber(minMax.Salinity_max)) {
    console.warn('Salinity statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedSalinity, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Salinity_mean) ? stats.Salinity_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Salinity_stdDev) ? stats.Salinity_stdDev : null;

  const vis = {
    min: minMax.Salinity_min,
    max: minMax.Salinity_max,
    palette: ["#15803d", "#22c55e", "#a3e635", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedSalinity, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Salinity_min,
    max_value: minMax.Salinity_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Soil pH
async function calculatePH(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const blue = image.select("B2");
  const swir = image.select("B11");

  // pH = 0.023 * Blue - 0.015 * SWIR + 7.2
  const ph = blue.multiply(0.023).subtract(swir.multiply(0.015)).add(7.2).rename("pH");
  const clippedPH = ph.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPH, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.pH_min) || !isFiniteNumber(minMax.pH_max)) {
    console.warn('pH statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedPH, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.pH_mean) ? stats.pH_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.pH_stdDev) ? stats.pH_stdDev : null;

  const vis = {
    min: minMax.pH_min,
    max: minMax.pH_max,
    palette: ["#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#3b82f6", "#1e40af"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedPH, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.pH_min,
    max_value: minMax.pH_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Soil Moisture (using NDMI - Normalized Difference Moisture Index)
async function calculateMoisture(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const swir = image.select("B11");

  // NDMI = (NIR - SWIR) / (NIR + SWIR)
  const ndmi = nir.subtract(swir).divide(nir.add(swir));

  // Moisture % = 45.2 * NDMI - 8.7
  const moisture = ndmi.multiply(45.2).subtract(8.7).rename("Moisture");
  const clippedMoisture = moisture.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedMoisture, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Moisture_min) || !isFiniteNumber(minMax.Moisture_max)) {
    console.warn('Moisture statistics unavailable for requested range (optical).');
    return null;
  }

  const stats = await safeReduceRegion(clippedMoisture, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Moisture_mean) ? stats.Moisture_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Moisture_stdDev) ? stats.Moisture_stdDev : null;

  const vis = {
    min: minMax.Moisture_min,
    max: minMax.Moisture_max,
    palette: ["#78350f", "#92400e", "#c2410c", "#ea580c", "#fbbf24", "#93c5fd", "#60a5fa", "#3b82f6", "#1e40af"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedMoisture, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Moisture_min,
    max_value: minMax.Moisture_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate SAR-based Soil Moisture (Sentinel-1)
async function calculateSarMoisture(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getSentinel1Collection(poi, startDate, endDate, 'BOTH')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

  // Check if collection has any images
  const imageCount = await evaluate(collection.size());
  if (!imageCount || imageCount <= 0) {
    console.warn(`No Sentinel-1 SAR images available for date range ${startDate} to ${endDate}`);
    return null;
  }

  const image = useSingleDate ? collection.first() : collection.median();
  const vv = image.select('VV');
  const vh = image.select('VH');

  // Convert dB to linear scale
  const vvLinear = ee.Image(10).pow(vv.divide(10));
  const vhLinear = ee.Image(10).pow(vh.divide(10));

  const moistureIdx = vvLinear.subtract(vhLinear)
    .divide(vvLinear.add(vhLinear))
    .rename('SAR_MOISTURE_IDX');

  const moisture = moistureIdx
    .unitScale(-0.5, 0.5)
    .multiply(100)
    .clamp(0, 100)
    .rename('SAR_MOISTURE');

  const clippedMoisture = moisture.clip(poi);

  const minMax = await safeReduceRegion(clippedMoisture, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: 10,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.SAR_MOISTURE_min) || !isFiniteNumber(minMax.SAR_MOISTURE_max)) {
    console.warn('Moisture statistics unavailable for requested range (SAR).');
    return null;
  }

  const stats = await safeReduceRegion(clippedMoisture, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: 10,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.SAR_MOISTURE_mean) ? stats.SAR_MOISTURE_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.SAR_MOISTURE_stdDev) ? stats.SAR_MOISTURE_stdDev : null;

  const vis = {
    min: minMax.SAR_MOISTURE_min,
    max: minMax.SAR_MOISTURE_max,
    palette: ['#0f172a', '#1e3a8a', '#38bdf8', '#4ade80', '#facc15']
  };

  const mapIdResult = await getMapIdWithRetry(clippedMoisture, vis);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.SAR_MOISTURE_min,
    max_value: minMax.SAR_MOISTURE_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    cloud_filter: 'All-weather radar',
    data_source: {
      satellites: ['Sentinel-1 SAR'],
      description: 'Sentinel-1 SAR dual-polarization moisture proxy'
    },
    cloud_cover: null,
    satellite: 'Sentinel-1 SAR',
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

// Calculate Soil Organic Carbon
async function calculateCarbon(
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite,
  useSingleDate: boolean = false
) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);

  const filteredCollection = satellite
    ? collection.filter(ee.Filter.eq('satellite', satellite))
    : collection;

  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) {
    return null;
  }

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const ndvi = nir.subtract(red).divide(nir.add(red));

  // SOC % = 12.5 * NDVI - 3.2
  const carbon = ndvi.multiply(12.5).subtract(3.2).rename("Carbon");
  const clippedCarbon = carbon.clip(poi);

  const dataSource = satellite
    ? buildDataSource([satellite])
    : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedCarbon, {
    reducer: ee.Reducer.minMax(),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  if (!minMax || !isFiniteNumber(minMax.Carbon_min) || !isFiniteNumber(minMax.Carbon_max)) {
    console.warn('Carbon statistics unavailable for requested range.');
    return null;
  }

  const stats = await safeReduceRegion(clippedCarbon, {
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: poi,
    scale: scale,
    maxPixels: 1e9
  });

  const meanValue = stats && isFiniteNumber(stats.Carbon_mean) ? stats.Carbon_mean : null;
  const stdDevValue = stats && isFiniteNumber(stats.Carbon_stdDev) ? stats.Carbon_stdDev : null;

  const vis = {
    min: minMax.Carbon_min,
    max: minMax.Carbon_max,
    palette: ["#78350f", "#92400e", "#c2410c", "#ea580c", "#fbbf24", "#a3e635", "#22c55e", "#15803d", "#14532d"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedCarbon, vis);
  const cloudCover = await computeCloudCover(filteredCollection, evaluate);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.Carbon_min,
    max_value: minMax.Carbon_max,
    mean_value: meanValue,
    std_dev: stdDevValue,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: {
      type: "Polygon",
      coordinates: null
    }
  };
}

/**
 * Calculate agricultural index for each individual satellite image
 * Returns per-image statistics for time-series visualization
 */
async function calculatePerImageTimeSeries(
  index: string,
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite
): Promise<Array<{
  startDate: string;
  endDate: string;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  cloudCover: number | null;
  sensors: string[];
}>> {
  // Only support optical indices
  if (!['ndvi', 'evi', 'savi', 'msavi', 'gndvi', 'ndre', 'ndwi', 'moisture'].includes(index)) {
    throw new Error(`Index ${index} not yet supported in per-image time series mode`);
  }

  // Determine which satellites to use
  const satellites = satellite ? [satellite] : ['Sentinel-2'] as OpticalSatellite[];

  // Process each satellite separately and combine results
  const allResults = [];

  for (const sat of satellites) {
    try {
      let collection;

      if (sat === 'Sentinel-2') {
        // Build and filter Sentinel-2 collection
        collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(poi)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

        // Get the list size first
        const size = await collection.size().getInfo();
        if (size === 0) continue;

        // Limit images per satellite
        const limit = Math.min(size, 50);
        const imageList = collection.sort('system:time_start').toList(limit);

        // Process each image
        for (let i = 0; i < limit; i++) {
          try {
            const img = ee.Image(imageList.get(i));

            // Scale and calculate index
            const scaled = img.multiply(0.0001);
            let indexImg;

            // Calculate index based on type (Sentinel-2 bands)
            if (index === 'ndvi') {
              indexImg = scaled.normalizedDifference(['B8', 'B4']);
            } else if (index === 'evi') {
              const nir = scaled.select('B8');
              const red = scaled.select('B4');
              const blue = scaled.select('B2');
              indexImg = nir.subtract(red)
                .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1))
                .multiply(2.5);
            } else if (index === 'savi') {
              indexImg = scaled.expression(
                '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
                { NIR: scaled.select('B8'), RED: scaled.select('B4'), L: 0.5 }
              );
            } else if (index === 'msavi') {
              indexImg = scaled.expression(
                '(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2',
                { NIR: scaled.select('B8'), RED: scaled.select('B4') }
              );
            } else if (index === 'gndvi') {
              indexImg = scaled.normalizedDifference(['B8', 'B3']);
            } else if (index === 'ndre') {
              indexImg = scaled.normalizedDifference(['B8', 'B5']);
            } else if (index === 'ndwi') {
              indexImg = scaled.normalizedDifference(['B3', 'B8']);
            } else if (index === 'moisture') {
              indexImg = scaled.normalizedDifference(['B8', 'B11']);
            } else {
              indexImg = scaled.normalizedDifference(['B8', 'B4']); // Default NDVI
            }

            // Get metadata
            const timestamp = await img.get('system:time_start').getInfo();
            const date = new Date(timestamp);
            const dateStr = date.toISOString().split('T')[0];

            // Calculate statistics
            const stats = await indexImg.reduceRegion({
              reducer: ee.Reducer.mean()
                .combine(ee.Reducer.stdDev(), '', true)
                .combine(ee.Reducer.min(), '', true)
                .combine(ee.Reducer.max(), '', true),
              geometry: poi,
              scale: 10,
              maxPixels: 1e9,
              bestEffort: true
            }).getInfo();

            const meanKey = Object.keys(stats).find(k => k.includes('mean'));
            const stdDevKey = Object.keys(stats).find(k => k.includes('stdDev'));
            const minKey = Object.keys(stats).find(k => k.includes('min'));
            const maxKey = Object.keys(stats).find(k => k.includes('max'));

            if (meanKey && stats[meanKey] !== null && stats[meanKey] !== undefined) {
              allResults.push({
                startDate: dateStr,
                endDate: dateStr,
                mean: stats[meanKey],
                stdDev: stats[stdDevKey] || 0,
                min: stats[minKey] || stats[meanKey],
                max: stats[maxKey] || stats[meanKey],
                cloudCover: null,
                sensors: [sat]
              });
            }
          } catch (imgError) {
            console.warn(`Error processing ${sat} image ${i}:`, imgError);
            // Continue with other images
          }
        }
      }
    } catch (satError) {
      console.error(`Error processing satellite ${sat}:`, satError);
      // Continue with other satellites
    }
  }

  // Sort by date
  allResults.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return allResults;
}

/**
 * Calculate agricultural index for a single time window
 * Returns statistics only (no map tiles)
 * Used for time-series analysis
 */
async function calculateIndexForWindow(
  index: string,
  poi: any,
  startDate: string,
  endDate: string,
  satellite?: OpticalSatellite
): Promise<{
  mean_value: number;
  std_dev: number;
  min_value: number;
  max_value: number;
  cloud_cover?: number;
  data_source?: any;
} | null> {
  // Reuse existing calculation functions
  // Set useSingleDate = false to use median composite
  let result;

  switch (index) {
    case 'nitrogen':
      result = await calculateNitrogen(poi, startDate, endDate, satellite, false);
      break;
    case 'phosphorus':
      result = await calculatePhosphorus(poi, startDate, endDate, satellite, false);
      break;
    case 'potassium':
      result = await calculatePotassium(poi, startDate, endDate, satellite, false);
      break;
    case 'ndwi':
      result = await calculateNDWI(poi, startDate, endDate, satellite, false);
      break;
    case 'moisture':
      result = await calculateMoisture(poi, startDate, endDate, satellite, false);
      break;
    case 'msavi':
      result = await calculateMSAVI(poi, startDate, endDate, satellite, false);
      break;
    default:
      return null;
  }

  if (!result) return null;

  // Extract only the statistics we need (no map tiles)
  return {
    mean_value: result.mean_value,
    std_dev: result.std_dev,
    min_value: result.min_value,
    max_value: result.max_value,
    cloud_cover: result.cloud_cover,
    data_source: result.data_source
  };
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
    const index = url.searchParams.get('index') || 'ndvi';
    const satelliteParam = url.searchParams.get('satellite'); // e.g., "Sentinel-2", "Landsat-8", "Landsat-9", "Sentinel-1 SAR"
    const dateParam = url.searchParams.get('date'); // Specific date: YYYY-MM-DD

    // Time-series parameters
    const timeSeriesMode = url.searchParams.get('timeseries') === 'true';
    const windowSizeDays = parseInt(url.searchParams.get('windowDays') || '10', 10);

    // If a specific date is provided, use it as both start and end (single day)
    let start: string;
    let end: string;

    if (dateParam) {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateParam)) {
        return errorResponse('Invalid date format. Use YYYY-MM-DD (e.g., 2024-06-15)', 400);
      }
      start = dateParam;
      end = dateParam;
      console.log(`Using specific date: ${dateParam}`);
    } else {
      // Calculate default date range - use today as end date
      const defaultEndDate = new Date(); // Use today
      const defaultStartDate = new Date(defaultEndDate);
      defaultStartDate.setMonth(defaultStartDate.getMonth() - 6); // Last 6 months

      start = url.searchParams.get('start') || defaultStartDate.toISOString().split('T')[0];
      end = url.searchParams.get('end') || defaultEndDate.toISOString().split('T')[0];
    }

    const polygon = url.searchParams.get('polygon');
    const farmId = url.searchParams.get('farmId'); // Farm ID for caching

    // Validate satellite parameter if provided
    const validSatellites = ['Sentinel-2', 'Landsat-8', 'Landsat-9', 'Sentinel-1 SAR'];
    let selectedSatellite: OpticalSatellite | undefined;
    if (satelliteParam) {
      if (!validSatellites.includes(satelliteParam)) {
        return errorResponse(
          `Invalid satellite: ${satelliteParam}. Valid options: ${validSatellites.join(', ')}`,
          400
        );
      }
      // Only optical satellites can be used for most indices (except sar_moisture)
      if (satelliteParam === 'Sentinel-1 SAR' && index.toLowerCase() !== 'sar_moisture') {
        return errorResponse(
          `Sentinel-1 SAR can only be used with sar_moisture index. Requested index: ${index}`,
          400
        );
      }
      if (satelliteParam !== 'Sentinel-1 SAR') {
        selectedSatellite = satelliteParam as OpticalSatellite;
      }
      console.log(`Filtering to satellite: ${satelliteParam}`);
    }

    // Validate date range - only reject future dates
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (end > todayStr) {
      return errorResponse(
        `Date range extends into the future. Latest allowed date is ${todayStr}. Requested end date: ${end}. Please select today or an earlier date.`,
        400
      );
    }

    console.log(`Processing agricultural indices request for index: ${index}, date range: ${start} to ${end}`);

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

    // Validate required environment variables
    if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
      throw new Error("Missing required Google Cloud credentials in environment variables");
    }

    // Authenticate earth engine
    await authenticate(serviceAccountKey);
    console.log('Earth Engine authenticated successfully');

    // Initialize Supabase client early for time-series caching
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use custom polygon if provided, otherwise use default
    let poi: any;
    let polygonCoords: number[][][] | null = null;
    if (polygon) {
      try {
        const polygonGeometry = JSON.parse(polygon);
        if ((polygonGeometry.type === 'Polygon' || polygonGeometry.type === 'MultiPolygon') && polygonGeometry.coordinates) {
          // Use geoJsonToEarthEngine to handle both Polygon and MultiPolygon
          poi = geoJsonToEarthEngine(polygonGeometry);
          // Store coordinates for later use (for Polygon, use first ring; for MultiPolygon, use first polygon's first ring)
          if (polygonGeometry.type === 'Polygon') {
            polygonCoords = polygonGeometry.coordinates;
          } else {
            // For MultiPolygon, use the first polygon's coordinates
            polygonCoords = polygonGeometry.coordinates[0];
          }
          console.log(`Using custom ${polygonGeometry.type} from request`);
        } else {
          throw new Error('Invalid polygon geometry format');
        }
      } catch (e: any) {
        console.warn('Failed to parse custom polygon, using default:', e.message);
        // Fallback to default polygon
        const defaultCoords = [[
          [77.77333199305133, 12.392392446684909],
          [77.77285377084087, 12.391034719901086],
          [77.77415744218291, 12.390603704636632],
          [77.77438732135664, 12.391302225016886],
          [77.77376792469431, 12.391501801924363],
          [77.77399141833513, 12.392187846379386],
          [77.77333199305133, 12.392392446684909]
        ]];
        polygonCoords = defaultCoords;
        poi = ee.Geometry.Polygon(defaultCoords);
      }
    } else {
      // Define default POI polygon
      const defaultCoords = [[
        [77.77333199305133, 12.392392446684909],
        [77.77285377084087, 12.391034719901086],
        [77.77415744218291, 12.390603704636632],
        [77.77438732135664, 12.391302225016886],
        [77.77376792469431, 12.391501801924363],
        [77.77399141833513, 12.392187846379386],
        [77.77333199305133, 12.392392446684909]
      ]];
      polygonCoords = defaultCoords;
      poi = ee.Geometry.Polygon(defaultCoords);
    }

    // Calculate different indices based on selection
    const indexKey = index.toLowerCase();
    const useSingleDate = dateParam !== null; // Flag to use single image instead of median

    // Time-series mode: return per-image statistics instead of map tiles
    if (timeSeriesMode && polygon) {
      try {
        let imageResults = [];
        let cached = false;

        // Try to get from cache if farmId is provided
        if (farmId) {
          const { data: cachedData, error: cacheError } = await supabase
            .from('agricultural_index_timeseries')
            .select('*')
            .eq('farm_id', farmId)
            .eq('algorithm', indexKey)
            .gte('observation_date', start)
            .lte('observation_date', end)
            .order('observation_date', { ascending: true });

          if (!cacheError && cachedData && cachedData.length > 0) {
            console.log(`Cache hit: Found ${cachedData.length} cached observations for ${indexKey}`);
            cached = true;
            imageResults = cachedData.map((row: any) => ({
              startDate: row.observation_date,
              endDate: row.observation_date,
              mean: row.mean_value,
              stdDev: row.std_dev || 0,
              min: row.min_value || row.mean_value,
              max: row.max_value || row.mean_value,
              cloudCover: row.cloud_cover,
              sensors: [row.satellite]
            }));
          }
        }

        // If no cache hit, compute from Earth Engine
        if (imageResults.length === 0) {
          console.log(`Cache miss: Computing ${indexKey} time series from Earth Engine`);
          imageResults = await calculatePerImageTimeSeries(
            indexKey,
            poi,
            start,
            end,
            selectedSatellite
          );

          // Store in cache if farmId is provided
          if (farmId && imageResults.length > 0) {
            const cacheRecords = imageResults.map((result: any) => ({
              farm_id: farmId,
              algorithm: indexKey,
              observation_date: result.startDate,
              mean_value: result.mean,
              std_dev: result.stdDev,
              min_value: result.min,
              max_value: result.max,
              cloud_cover: result.cloudCover,
              satellite: result.sensors[0]
            }));

            const { error: insertError } = await supabase
              .from('agricultural_index_timeseries')
              .upsert(cacheRecords, {
                onConflict: 'farm_id,algorithm,observation_date',
                ignoreDuplicates: false
              });

            if (insertError) {
              console.error('Error caching time series data:', insertError);
              // Don't fail the request if caching fails
            } else {
              console.log(`Cached ${cacheRecords.length} observations for ${indexKey}`);
            }
          }
        }

        return successResponse({
          algorithm: indexKey,
          windows: imageResults,
          metadata: {
            dateRange: { start, end },
            imageCount: imageResults.length,
            mode: 'per-image',
            cached
          }
        });
      } catch (error) {
        console.error('Error processing time series:', error);
        return errorResponse(`Failed to process time series: ${error.message}`, 500);
      }
    }

    let result;
    switch (indexKey) {
      case 'ndvi':
        result = await calculateNDVI(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'evi':
        result = await calculateEVI(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'savi':
        result = await calculateSAVI(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'msavi':
        result = await calculateMSAVI(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'ndwi':
        result = await calculateNDWI(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'nitrogen':
        result = await calculateNitrogen(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'phosphorus':
        result = await calculatePhosphorus(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'potassium':
        result = await calculatePotassium(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'salinity':
        result = await calculateSalinity(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'ph':
        result = await calculatePH(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'moisture':
        result = await calculateMoisture(poi, start, end, selectedSatellite, useSingleDate);
        break;
      case 'sar_moisture':
        result = await calculateSarMoisture(poi, start, end, satelliteParam === 'Sentinel-1 SAR' ? undefined : selectedSatellite, useSingleDate);
        break;
      case 'carbon':
        result = await calculateCarbon(poi, start, end, selectedSatellite, useSingleDate);
        break;
      default:
        result = await calculateNDVI(poi, start, end, selectedSatellite, useSingleDate);
        break;
    }

    if (!result) {
      return errorResponse('No imagery available for the requested index and time range.', 404);
    }

    // Set the polygon coordinates in the result
    if (polygonCoords) {
      result.geojson = {
        type: "Polygon",
        coordinates: polygonCoords
      };
    }

    // Create POI polygon for display
    const poiPolygon = {
      type: "Feature",
      geometry: result.geojson,
      properties: {
        name: "Field Area",
        index: index.toUpperCase()
      }
    };

    // Save to database (non-blocking)
    // Construct proper tile URL from mapid and token
    let tileUrl = '';
    if (result.mapid && result.token) {
      // Use the mapid and token to construct the tile URL
      tileUrl = `https://earthengine.googleapis.com/map/${result.mapid}/{z}/{x}/{y}?token=${result.token}`;
    } else if (result.urlFormat) {
      // Fallback to urlFormat if available
      tileUrl = result.urlFormat;
    } else {
      // Construct from available data
      console.warn('No mapid/token or urlFormat available for tile URL');
    }
    const cloudFilterLabel = result.cloud_filter || "< 100%";
    const dbResult = await saveToDatabase(
      supabase,
      polygonCoords,
      index,
      { start, end },
      tileUrl,
      {
        min_value: result.min_value,
        max_value: result.max_value,
        mean_value: result.mean_value,
        std_dev: result.std_dev,
        calculationMethod: getCalculationMethod(index),
        dataSource: result.data_source || { satellites: ['Multi-satellite'], description: 'Harmonized optical imagery' },
        cloudFilter: cloudFilterLabel
      }
    );

    const satelliteLayers: SatelliteLayerResult[] = [];

    // If a specific satellite is requested, only return that satellite's data
    if (satelliteParam) {
      // For SAR moisture, the result already contains the satellite data
      if (indexKey === 'sar_moisture' && satelliteParam === 'Sentinel-1 SAR') {
        satelliteLayers.push({
          satellite: 'Sentinel-1 SAR',
          urlFormat: result.urlFormat,
          mapid: result.mapid,
          token: result.token,
          cloudCover: typeof result.cloud_cover === 'number' ? result.cloud_cover : null,
          min_value: result.min_value ?? null,
          max_value: result.max_value ?? null,
          mean_value: result.mean_value ?? null,
          std_dev: result.std_dev ?? null,
          data_source: result.data_source || buildDataSource(['Sentinel-1 SAR']),
          metadata: {
            algorithm: index.toUpperCase(),
            calculationMethod: getCalculationMethod(index),
            cloudFilter: result.cloud_filter || 'All-weather radar',
            dateRange: { start, end }
          }
        });
      } else if (selectedSatellite) {
        // For optical satellites, use the result we already calculated
        satelliteLayers.push({
          satellite: selectedSatellite,
          urlFormat: result.urlFormat,
          mapid: result.mapid,
          token: result.token,
          cloudCover: typeof result.cloud_cover === 'number' ? result.cloud_cover : null,
          min_value: result.min_value ?? null,
          max_value: result.max_value ?? null,
          mean_value: result.mean_value ?? null,
          std_dev: result.std_dev ?? null,
          data_source: result.data_source || buildDataSource([selectedSatellite]),
          metadata: {
            algorithm: index.toUpperCase(),
            calculationMethod: getCalculationMethod(index),
            cloudFilter: result.cloud_filter || '< 100%',
            dateRange: { start, end }
          }
        });
      }
    } else {
      // No specific satellite requested - return all satellites (original behavior)
      if (indexKey === 'sar_moisture') {
        satelliteLayers.push({
          satellite: 'Sentinel-1 SAR',
          urlFormat: result.urlFormat,
          mapid: result.mapid,
          token: result.token,
          cloudCover: typeof result.cloud_cover === 'number' ? result.cloud_cover : null,
          min_value: result.min_value ?? null,
          max_value: result.max_value ?? null,
          mean_value: result.mean_value ?? null,
          std_dev: result.std_dev ?? null,
          data_source: result.data_source || buildDataSource(['Sentinel-1 SAR']),
          metadata: {
            algorithm: index.toUpperCase(),
            calculationMethod: getCalculationMethod(index),
            cloudFilter: result.cloud_filter || 'All-weather radar',
            dateRange: { start, end }
          }
        });
      } else {
        for (const sat of OPTICAL_SATELLITES) {
          try {
            const satLayer = await calculateSatelliteLayer(indexKey, poi, start, end, sat);
            if (satLayer) {
              satelliteLayers.push(satLayer);
            }
          } catch (satError) {
            console.warn(`Failed to build satellite layer for ${sat}:`, satError);
          }
        }
      }
    }

    const combinedCloudCover = typeof result.cloud_cover === 'number'
      ? result.cloud_cover
      : null;

    // Return the result to the client/browser
    return successResponse({
      urlFormat: result.urlFormat,
      mapid: result.mapid,
      token: result.token,
      geojson: result.geojson,
      poiPolygon: poiPolygon,
      cloudCover: combinedCloudCover,
      satellites: satelliteLayers,
      metadata: {
        dateRange: { start, end },
        algorithm: index.toUpperCase(),
        dataSource: result.data_source || { satellites: ['Multi-satellite'], description: 'Harmonized optical imagery' },
        cloudFilter: cloudFilterLabel,
        calculationMethod: getCalculationMethod(index),
        satellites: result.data_source?.satellites || ['Sentinel-2', 'Landsat-8', 'Landsat-9']
      },
      database: dbResult ? {
        farm_id: dbResult.farmId,
        saved: true
      } : {
        saved: false
      }
    });

  } catch (error: any) {
    console.error("Agricultural Indices Error:", error);
    return errorResponse(error.message || "Unknown error", 500, error);
  }
});

