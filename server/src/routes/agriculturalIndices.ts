// Agricultural Indices API - Express Route
// Ported from Supabase Edge Function to Node.js/Express
// Calculates vegetation indices from Sentinel-2, Landsat 8/9, and Sentinel-1 SAR

import { Router, Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response.js';
import { evaluate, getMapIdWithRetry, ee } from '../utils/earthEngine.js';
import {
  getMergedOpticalCollection,
  getSentinel1Collection,
  getDataSourceSummary,
  getCollectionScale,
  geoJsonToEarthEngine,
} from '../shared/satelliteUtils.js';

const router = Router();

const OPTICAL_SATELLITES = ['Sentinel-2', 'Landsat-8', 'Landsat-9'] as const;
type OpticalSatellite = typeof OPTICAL_SATELLITES[number];

const SATELLITE_DESCRIPTIONS: Record<string, string> = {
  'Sentinel-2': 'Sentinel-2 MSI harmonized optical imagery',
  'Landsat-8': 'Landsat 8 OLI/TIRS harmonized optical imagery',
  'Landsat-9': 'Landsat 9 OLI-2/TIRS-2 harmonized optical imagery',
  'Sentinel-1 SAR': 'Sentinel-1 C-band radar (VV/VH dual polarization)'
};

// Helper functions
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
    console.warn('[AgriculturalIndices] reduceRegion failed', error);
    return null;
  }
}

function buildDataSource(satellites: string[]): { satellites: string[]; description: string } {
  const descriptionSegments = satellites.map((sat) => SATELLITE_DESCRIPTIONS[sat] || sat);
  return {
    satellites,
    description: descriptionSegments.join(', ')
  };
}

async function computeCloudCover(collection: any): Promise<number | null> {
  try {
    const cloudValue = await evaluate(collection.aggregate_mean('cloud_cover'));
    if (typeof cloudValue === 'number') {
      return Math.round(cloudValue * 10) / 10;
    }
  } catch (_error) {
    // ignore cloud aggregation errors
  }
  return null;
}

function getCalculationMethod(index: string): string {
  const methods: { [key: string]: string } = {
    'ndvi': 'NDVI = (NIR - Red) / (NIR + Red) - Normalized Difference Vegetation Index',
    'evi': 'EVI = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1) - Enhanced Vegetation Index',
    'savi': 'SAVI = (NIR - Red) × (1 + L) / (NIR + Red + L) - Soil Adjusted Vegetation Index',
    'msavi': 'MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2 - Modified Soil Adjusted Vegetation Index',
    'ndwi': 'NDWI = (NIR - SWIR) / (NIR + SWIR) - Normalized Difference Water Index',
    'gndvi': 'GNDVI = (NIR - Green) / (NIR + Green) - Green NDVI',
    'ndre': 'NDRE = (NIR - RedEdge) / (NIR + RedEdge) - Normalized Difference Red Edge Index',
    'nitrogen': 'N = 259.4 × NDVI - 58.6 (R²=0.90) - Nitrogen content in kg N/ha',
    'phosphorus': 'P₂O₅ = 180 × EVI - 25 - Phosphorus content in kg P₂O₅/ha',
    'potassium': 'K₂O = 250 × SAVI - 40 - Potassium content in kg K₂O/ha',
    'salinity': 'ECe = 0.0045 × SI + 1.2 - Electrical Conductivity in dS/m',
    'ph': 'pH = 0.023×Blue - 0.015×SWIR + 7.2 (±0.35) - Soil pH estimation',
    'moisture': 'Moisture % = 45.2 × NDMI - 8.7 - Volumetric moisture content',
    'carbon': 'SOC % = 12.5 × NDVI - 3.2 (R²=0.79) - Soil Organic Carbon percentage',
    'sar_moisture': 'SAR Moisture Index = (VV - VH) / (VV + VH) scaled to 0-100%'
  };
  return methods[index] || 'Standard vegetation index calculation';
}

// Calculate NDVI
async function calculateNDVI(
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

  const ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI");
  const clippedNdvi = ndvi.clip(poi);

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
    console.warn('[AgriculturalIndices] NDVI statistics unavailable');
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

  const vis = {
    min: minMax.NDVI_min,
    max: minMax.NDVI_max,
    palette: ["red", "yellow", "green", "darkgreen"]
  };

  const mapIdResult = await getMapIdWithRetry(clippedNdvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return {
    urlFormat: mapIdResult.urlFormat,
    mapid: mapIdResult.mapid,
    token: mapIdResult.token,
    min_value: minMax.NDVI_min,
    max_value: minMax.NDVI_max,
    mean_value: stats?.NDVI_mean ?? null,
    std_dev: stats?.NDVI_stdDev ?? null,
    data_source: dataSource,
    cloud_cover: cloudCover,
    satellite: satellite || null,
    geojson: { type: "Polygon", coordinates: null }
  };
}

// Calculate EVI
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
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const blue = image.select("B2");

  const evi = ee.Image(2.5).multiply(
    nir.subtract(red).divide(
      nir.add(ee.Image(6).multiply(red)).subtract(ee.Image(7.5).multiply(blue)).add(1)
    )
  ).rename("EVI");

  const clippedEvi = evi.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedEvi, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.EVI_min) || !isFiniteNumber(minMax.EVI_max)) return null;

  const stats = await safeReduceRegion(clippedEvi, {
    reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }),
    geometry: poi, scale, maxPixels: 1e9
  });

  const vis = { min: minMax.EVI_min, max: minMax.EVI_max, palette: ["red", "yellow", "green", "darkgreen"] };
  const mapIdResult = await getMapIdWithRetry(clippedEvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return {
    urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token,
    min_value: minMax.EVI_min, max_value: minMax.EVI_max,
    mean_value: stats?.EVI_mean ?? null, std_dev: stats?.EVI_stdDev ?? null,
    data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null,
    geojson: { type: "Polygon", coordinates: null }
  };
}

// Calculate SAVI
async function calculateSAVI(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const L = 0.5;

  const savi = nir.subtract(red).multiply(1 + L).divide(nir.add(red).add(L)).rename("SAVI");
  const clippedSavi = savi.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedSavi, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.SAVI_min) || !isFiniteNumber(minMax.SAVI_max)) return null;

  const stats = await safeReduceRegion(clippedSavi, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.SAVI_min, max: minMax.SAVI_max, palette: ["red", "yellow", "green", "darkgreen"] };
  const mapIdResult = await getMapIdWithRetry(clippedSavi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.SAVI_min, max_value: minMax.SAVI_max, mean_value: stats?.SAVI_mean ?? null, std_dev: stats?.SAVI_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate MSAVI
async function calculateMSAVI(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const msavi = nir.multiply(2).add(1).subtract((nir.multiply(2).add(1)).pow(2).subtract(nir.subtract(red).multiply(8)).sqrt()).divide(2).rename("MSAVI");
  const clippedMsavi = msavi.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedMsavi, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.MSAVI_min) || !isFiniteNumber(minMax.MSAVI_max)) return null;

  const stats = await safeReduceRegion(clippedMsavi, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.MSAVI_min, max: minMax.MSAVI_max, palette: ["red", "yellow", "green", "darkgreen"] };
  const mapIdResult = await getMapIdWithRetry(clippedMsavi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.MSAVI_min, max_value: minMax.MSAVI_max, mean_value: stats?.MSAVI_mean ?? null, std_dev: stats?.MSAVI_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate NDWI
async function calculateNDWI(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const swir = image.select("B11");

  const ndwi = nir.subtract(swir).divide(nir.add(swir)).rename("NDWI");
  const clippedNdwi = ndwi.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNdwi, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.NDWI_min) || !isFiniteNumber(minMax.NDWI_max)) return null;

  const stats = await safeReduceRegion(clippedNdwi, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.NDWI_min, max: minMax.NDWI_max, palette: ["brown", "yellow", "lightblue", "blue", "darkblue"] };
  const mapIdResult = await getMapIdWithRetry(clippedNdwi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.NDWI_min, max_value: minMax.NDWI_max, mean_value: stats?.NDWI_mean ?? null, std_dev: stats?.NDWI_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate GNDVI
async function calculateGNDVI(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const green = image.select("B3");

  const gndvi = nir.subtract(green).divide(nir.add(green)).rename("GNDVI");
  const clippedGndvi = gndvi.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedGndvi, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.GNDVI_min) || !isFiniteNumber(minMax.GNDVI_max)) return null;

  const stats = await safeReduceRegion(clippedGndvi, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.GNDVI_min, max: minMax.GNDVI_max, palette: ["#8B0000", "#FF4500", "#FFD700", "#9ACD32", "#228B22", "#006400"] };
  const mapIdResult = await getMapIdWithRetry(clippedGndvi, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.GNDVI_min, max_value: minMax.GNDVI_max, mean_value: stats?.GNDVI_mean ?? null, std_dev: stats?.GNDVI_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate NDRE
async function calculateNDRE(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const redEdge = image.select("B5");

  const ndre = nir.subtract(redEdge).divide(nir.add(redEdge)).rename("NDRE");
  const clippedNdre = ndre.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNdre, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.NDRE_min) || !isFiniteNumber(minMax.NDRE_max)) return null;

  const stats = await safeReduceRegion(clippedNdre, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.NDRE_min, max: minMax.NDRE_max, palette: ["#8B4513", "#DAA520", "#ADFF2F", "#32CD32", "#006400"] };
  const mapIdResult = await getMapIdWithRetry(clippedNdre, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.NDRE_min, max_value: minMax.NDRE_max, mean_value: stats?.NDRE_mean ?? null, std_dev: stats?.NDRE_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Nitrogen
async function calculateNitrogen(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const ndvi = nir.subtract(red).divide(nir.add(red));
  const nitrogen = ndvi.multiply(259.4).subtract(58.6).rename("Nitrogen");
  const clippedNitrogen = nitrogen.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedNitrogen, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Nitrogen_min) || !isFiniteNumber(minMax.Nitrogen_max)) return null;

  const stats = await safeReduceRegion(clippedNitrogen, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Nitrogen_min, max: minMax.Nitrogen_max, palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"] };
  const mapIdResult = await getMapIdWithRetry(clippedNitrogen, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Nitrogen_min, max_value: minMax.Nitrogen_max, mean_value: stats?.Nitrogen_mean ?? null, std_dev: stats?.Nitrogen_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Phosphorus
async function calculatePhosphorus(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const blue = image.select("B2");

  const evi = ee.Image(2.5).multiply(nir.subtract(red).divide(nir.add(ee.Image(6).multiply(red)).subtract(ee.Image(7.5).multiply(blue)).add(1)));
  const phosphorus = evi.multiply(180).subtract(25).rename("Phosphorus");
  const clippedPhosphorus = phosphorus.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPhosphorus, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Phosphorus_min) || !isFiniteNumber(minMax.Phosphorus_max)) return null;

  const stats = await safeReduceRegion(clippedPhosphorus, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Phosphorus_min, max: minMax.Phosphorus_max, palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"] };
  const mapIdResult = await getMapIdWithRetry(clippedPhosphorus, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Phosphorus_min, max_value: minMax.Phosphorus_max, mean_value: stats?.Phosphorus_mean ?? null, std_dev: stats?.Phosphorus_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Potassium
async function calculatePotassium(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");
  const L = 0.5;

  const savi = nir.subtract(red).multiply(1 + L).divide(nir.add(red).add(L));
  const potassium = savi.multiply(250).subtract(40).rename("Potassium");
  const clippedPotassium = potassium.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPotassium, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Potassium_min) || !isFiniteNumber(minMax.Potassium_max)) return null;

  const stats = await safeReduceRegion(clippedPotassium, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Potassium_min, max: minMax.Potassium_max, palette: ["#7f1d1d", "#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#15803d"] };
  const mapIdResult = await getMapIdWithRetry(clippedPotassium, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Potassium_min, max_value: minMax.Potassium_max, mean_value: stats?.Potassium_mean ?? null, std_dev: stats?.Potassium_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Salinity
async function calculateSalinity(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const blue = image.select("B2");
  const red = image.select("B4");

  const si = blue.add(red).divide(2);
  const salinity = si.multiply(0.0045).add(1.2).rename("Salinity");
  const clippedSalinity = salinity.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedSalinity, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Salinity_min) || !isFiniteNumber(minMax.Salinity_max)) return null;

  const stats = await safeReduceRegion(clippedSalinity, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Salinity_min, max: minMax.Salinity_max, palette: ["#15803d", "#22c55e", "#a3e635", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"] };
  const mapIdResult = await getMapIdWithRetry(clippedSalinity, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Salinity_min, max_value: minMax.Salinity_max, mean_value: stats?.Salinity_mean ?? null, std_dev: stats?.Salinity_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate pH
async function calculatePH(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const blue = image.select("B2");
  const swir = image.select("B11");

  const ph = blue.multiply(0.023).subtract(swir.multiply(0.015)).add(7.2).rename("pH");
  const clippedPH = ph.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedPH, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.pH_min) || !isFiniteNumber(minMax.pH_max)) return null;

  const stats = await safeReduceRegion(clippedPH, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.pH_min, max: minMax.pH_max, palette: ["#dc2626", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#3b82f6", "#1e40af"] };
  const mapIdResult = await getMapIdWithRetry(clippedPH, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.pH_min, max_value: minMax.pH_max, mean_value: stats?.pH_mean ?? null, std_dev: stats?.pH_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Moisture
async function calculateMoisture(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const swir = image.select("B11");

  const ndmi = nir.subtract(swir).divide(nir.add(swir));
  const moisture = ndmi.multiply(45.2).subtract(8.7).rename("Moisture");
  const clippedMoisture = moisture.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedMoisture, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Moisture_min) || !isFiniteNumber(minMax.Moisture_max)) return null;

  const stats = await safeReduceRegion(clippedMoisture, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Moisture_min, max: minMax.Moisture_max, palette: ["#78350f", "#92400e", "#c2410c", "#ea580c", "#fbbf24", "#93c5fd", "#60a5fa", "#3b82f6", "#1e40af"] };
  const mapIdResult = await getMapIdWithRetry(clippedMoisture, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Moisture_min, max_value: minMax.Moisture_max, mean_value: stats?.Moisture_mean ?? null, std_dev: stats?.Moisture_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Calculate SAR Moisture
async function calculateSarMoisture(poi: any, startDate: string, endDate: string, _satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getSentinel1Collection(poi, startDate, endDate, 'BOTH')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

  const imageCount = await evaluate(collection.size());
  if (!imageCount || imageCount <= 0) {
    console.warn(`[AgriculturalIndices] No Sentinel-1 SAR images available for ${startDate} to ${endDate}`);
    return null;
  }

  const image = useSingleDate ? collection.first() : collection.median();
  const vv = image.select('VV');
  const vh = image.select('VH');

  const vvLinear = ee.Image(10).pow(vv.divide(10));
  const vhLinear = ee.Image(10).pow(vh.divide(10));

  const moistureIdx = vvLinear.subtract(vhLinear).divide(vvLinear.add(vhLinear)).rename('SAR_MOISTURE_IDX');
  const moisture = moistureIdx.unitScale(-0.5, 0.5).multiply(100).clamp(0, 100).rename('SAR_MOISTURE');
  const clippedMoisture = moisture.clip(poi);

  const minMax = await safeReduceRegion(clippedMoisture, { reducer: ee.Reducer.minMax(), geometry: poi, scale: 10, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.SAR_MOISTURE_min) || !isFiniteNumber(minMax.SAR_MOISTURE_max)) return null;

  const stats = await safeReduceRegion(clippedMoisture, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale: 10, maxPixels: 1e9 });
  const vis = { min: minMax.SAR_MOISTURE_min, max: minMax.SAR_MOISTURE_max, palette: ['#0f172a', '#1e3a8a', '#38bdf8', '#4ade80', '#facc15'] };
  const mapIdResult = await getMapIdWithRetry(clippedMoisture, vis);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.SAR_MOISTURE_min, max_value: minMax.SAR_MOISTURE_max, mean_value: stats?.SAR_MOISTURE_mean ?? null, std_dev: stats?.SAR_MOISTURE_stdDev ?? null, cloud_filter: 'All-weather radar', data_source: { satellites: ['Sentinel-1 SAR'], description: 'Sentinel-1 SAR dual-polarization moisture proxy' }, cloud_cover: null, satellite: 'Sentinel-1 SAR', geojson: { type: "Polygon", coordinates: null } };
}

// Calculate Carbon
async function calculateCarbon(poi: any, startDate: string, endDate: string, satellite?: OpticalSatellite, useSingleDate: boolean = false) {
  const collection = getMergedOpticalCollection(poi, startDate, endDate, 100);
  const filteredCollection = satellite ? collection.filter(ee.Filter.eq('satellite', satellite)) : collection;
  const imageCount = await evaluate(filteredCollection.size());
  if (!imageCount || imageCount <= 0) return null;

  const image = useSingleDate ? filteredCollection.first() : filteredCollection.median();
  const nir = image.select("B8");
  const red = image.select("B4");

  const ndvi = nir.subtract(red).divide(nir.add(red));
  const carbon = ndvi.multiply(12.5).subtract(3.2).rename("Carbon");
  const clippedCarbon = carbon.clip(poi);
  const dataSource = satellite ? buildDataSource([satellite]) : await getDataSourceSummary(filteredCollection, evaluate);
  const scale = getCollectionScale(dataSource.satellites);

  const minMax = await safeReduceRegion(clippedCarbon, { reducer: ee.Reducer.minMax(), geometry: poi, scale, maxPixels: 1e9 });
  if (!minMax || !isFiniteNumber(minMax.Carbon_min) || !isFiniteNumber(minMax.Carbon_max)) return null;

  const stats = await safeReduceRegion(clippedCarbon, { reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.stdDev(), sharedInputs: true }), geometry: poi, scale, maxPixels: 1e9 });
  const vis = { min: minMax.Carbon_min, max: minMax.Carbon_max, palette: ["#78350f", "#92400e", "#c2410c", "#ea580c", "#fbbf24", "#a3e635", "#22c55e", "#15803d", "#14532d"] };
  const mapIdResult = await getMapIdWithRetry(clippedCarbon, vis);
  const cloudCover = await computeCloudCover(filteredCollection);

  return { urlFormat: mapIdResult.urlFormat, mapid: mapIdResult.mapid, token: mapIdResult.token, min_value: minMax.Carbon_min, max_value: minMax.Carbon_max, mean_value: stats?.Carbon_mean ?? null, std_dev: stats?.Carbon_stdDev ?? null, data_source: dataSource, cloud_cover: cloudCover, satellite: satellite || null, geojson: { type: "Polygon", coordinates: null } };
}

// Default polygon coordinates
const DEFAULT_POLYGON_COORDS = [[
  [77.77333199305133, 12.392392446684909],
  [77.77285377084087, 12.391034719901086],
  [77.77415744218291, 12.390603704636632],
  [77.77438732135664, 12.391302225016886],
  [77.77376792469431, 12.391501801924363],
  [77.77399141833513, 12.392187846379386],
  [77.77333199305133, 12.392392446684909]
]];

// Main route handler
router.get('/', async (req: Request, res: Response) => {
  try {
    const index = (req.query.index as string) || 'ndvi';
    const satelliteParam = req.query.satellite as string;
    const dateParam = req.query.date as string;
    const polygon = req.query.polygon as string;

    // Parse dates
    let start: string;
    let end: string;

    if (dateParam) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateParam)) {
        return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD', 400);
      }
      start = dateParam;
      end = dateParam;
    } else {
      const defaultEndDate = new Date();
      const defaultStartDate = new Date(defaultEndDate);
      defaultStartDate.setMonth(defaultStartDate.getMonth() - 6);
      start = (req.query.start as string) || defaultStartDate.toISOString().split('T')[0];
      end = (req.query.end as string) || defaultEndDate.toISOString().split('T')[0];
    }

    // Validate satellite
    const validSatellites = ['Sentinel-2', 'Landsat-8', 'Landsat-9', 'Sentinel-1 SAR'];
    let selectedSatellite: OpticalSatellite | undefined;
    if (satelliteParam) {
      if (!validSatellites.includes(satelliteParam)) {
        return errorResponse(res, `Invalid satellite: ${satelliteParam}. Valid: ${validSatellites.join(', ')}`, 400);
      }
      if (satelliteParam === 'Sentinel-1 SAR' && index.toLowerCase() !== 'sar_moisture') {
        return errorResponse(res, `Sentinel-1 SAR can only be used with sar_moisture index`, 400);
      }
      if (satelliteParam !== 'Sentinel-1 SAR') {
        selectedSatellite = satelliteParam as OpticalSatellite;
      }
    }

    // Validate date range
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (end > todayStr) {
      return errorResponse(res, `Date range extends into the future. Latest: ${todayStr}`, 400);
    }

    console.log(`[AgriculturalIndices] Processing ${index}, ${start} to ${end}`);

    // Parse polygon
    let poi: any;
    let polygonCoords: number[][][] | null = null;
    if (polygon) {
      try {
        const polygonGeometry = JSON.parse(polygon);
        if ((polygonGeometry.type === 'Polygon' || polygonGeometry.type === 'MultiPolygon') && polygonGeometry.coordinates) {
          poi = geoJsonToEarthEngine(polygonGeometry);
          polygonCoords = polygonGeometry.type === 'Polygon' ? polygonGeometry.coordinates : polygonGeometry.coordinates[0];
        } else {
          throw new Error('Invalid polygon format');
        }
      } catch (e: any) {
        console.warn('[AgriculturalIndices] Failed to parse polygon, using default:', e.message);
        polygonCoords = DEFAULT_POLYGON_COORDS;
        poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
      }
    } else {
      polygonCoords = DEFAULT_POLYGON_COORDS;
      poi = ee.Geometry.Polygon(DEFAULT_POLYGON_COORDS);
    }

    const indexKey = index.toLowerCase();
    const useSingleDate = dateParam !== null && dateParam !== undefined;

    // Calculate index
    let result;
    switch (indexKey) {
      case 'ndvi': result = await calculateNDVI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'evi': result = await calculateEVI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'savi': result = await calculateSAVI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'msavi': result = await calculateMSAVI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'ndwi': result = await calculateNDWI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'gndvi': result = await calculateGNDVI(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'ndre': result = await calculateNDRE(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'nitrogen': result = await calculateNitrogen(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'phosphorus': result = await calculatePhosphorus(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'potassium': result = await calculatePotassium(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'salinity': result = await calculateSalinity(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'ph': result = await calculatePH(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'moisture': result = await calculateMoisture(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'sar_moisture': result = await calculateSarMoisture(poi, start, end, selectedSatellite, useSingleDate); break;
      case 'carbon': result = await calculateCarbon(poi, start, end, selectedSatellite, useSingleDate); break;
      default: result = await calculateNDVI(poi, start, end, selectedSatellite, useSingleDate); break;
    }

    if (!result) {
      return errorResponse(res, 'No imagery available for the requested index and time range.', 404);
    }

    // Set polygon coordinates
    if (polygonCoords) {
      result.geojson = { type: "Polygon", coordinates: polygonCoords };
    }

    const poiPolygon = {
      type: "Feature",
      geometry: result.geojson,
      properties: { name: "Field Area", index: index.toUpperCase() }
    };

    successResponse(res, {
      urlFormat: result.urlFormat,
      mapid: result.mapid,
      token: result.token,
      geojson: result.geojson,
      poiPolygon: poiPolygon,
      cloudCover: result.cloud_cover,
      min_value: result.min_value,
      max_value: result.max_value,
      mean_value: result.mean_value,
      std_dev: result.std_dev,
      data_source: result.data_source,
      metadata: {
        dateRange: { start, end },
        algorithm: index.toUpperCase(),
        calculationMethod: getCalculationMethod(indexKey),
        satellite: result.satellite,
        platform: 'Express.js (Local)'
      }
    });

  } catch (error: any) {
    console.error('[AgriculturalIndices] Error:', error);
    errorResponse(res, error.message || 'Unknown error', 500, error);
  }
});

export default router;
