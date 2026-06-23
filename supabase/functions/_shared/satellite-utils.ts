// Satellite Band Harmonization and Multi-Satellite Support
// Supports Sentinel-2, Landsat 8, Landsat 9, and Sentinel-1 SAR

import ee from 'npm:@google/earthengine@1.6.13';

/**
 * Initialize Google Earth Engine using service account credentials from Deno environment
 */
export async function initializeEarthEngine(): Promise<void> {
  let credentials: Record<string, string>;

  const credsJson = Deno.env.get('GOOGLE_CREDENTIALS_JSON');
  if (credsJson) {
    try {
      const parsed = JSON.parse(credsJson);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      credentials = parsed;
    } catch (e: any) {
      throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${e.message}`);
    }
  } else {
    const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    if (!privateKey || !clientEmail) {
      throw new Error('Earth Engine credentials missing: set GOOGLE_CREDENTIALS_JSON or GOOGLE_PRIVATE_KEY + GOOGLE_CLIENT_EMAIL');
    }
    credentials = {
      type: 'service_account',
      project_id: Deno.env.get('GOOGLE_PROJECT_ID') ?? '',
      private_key_id: Deno.env.get('GOOGLE_PRIVATE_KEY_ID') ?? '',
      private_key: privateKey.replace(/\\n/g, '\n'),
      client_email: clientEmail,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: Deno.env.get('GOOGLE_CLIENT_X509_CERT_URL') ?? '',
    };
  }

  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        ee.initialize(
          null,
          null,
          () => resolve(),
          (err: any) => reject(new Error(err))
        );
      },
      (err: any) => reject(new Error(err))
    );
  });
}

// Satellite configurations
export const SATELLITES = {
  SENTINEL2: {
    id: 'COPERNICUS/S2_SR_HARMONIZED',
    name: 'Sentinel-2',
    startDate: '2015-06-23',
    bands: {
      blue: 'B2',
      green: 'B3',
      red: 'B4',
      nir: 'B8',
      swir1: 'B11',
      swir2: 'B12'
    },
    cloudProperty: 'CLOUDY_PIXEL_PERCENTAGE',
    scale: 10,
    scaleFactor: 0.0001 // Surface reflectance scale factor
  },
  LANDSAT8: {
    id: 'LANDSAT/LC08/C02/T1_L2',
    name: 'Landsat-8',
    startDate: '2013-03-18',
    bands: {
      blue: 'SR_B2',
      green: 'SR_B3',
      red: 'SR_B4',
      nir: 'SR_B5',
      swir1: 'SR_B6',
      swir2: 'SR_B7'
    },
    cloudProperty: 'CLOUD_COVER',
    scale: 30,
    scaleFactor: 0.0000275, // Surface reflectance scale factor
    offset: -0.2
  },
  LANDSAT9: {
    id: 'LANDSAT/LC09/C02/T1_L2',
    name: 'Landsat-9',
    startDate: '2021-10-31',
    bands: {
      blue: 'SR_B2',
      green: 'SR_B3',
      red: 'SR_B4',
      nir: 'SR_B5',
      swir1: 'SR_B6',
      swir2: 'SR_B7'
    },
    cloudProperty: 'CLOUD_COVER',
    scale: 30,
    scaleFactor: 0.0000275,
    offset: -0.2
  },
  SENTINEL1: {
    id: 'COPERNICUS/S1_GRD',
    name: 'Sentinel-1 SAR',
    startDate: '2014-10-03',
    bands: {
      vv: 'VV',
      vh: 'VH'
    },
    scale: 10,
    type: 'SAR' // Synthetic Aperture Radar
  }
};

export const SATELLITE_INDEX_MAP: Record<string, string[]> = {
  'Sentinel-2': [
    'ndvi',
    'evi',
    'savi',
    'msavi',
    'ndwi',
    'nitrogen',
    'phosphorus',
    'potassium',
    'salinity',
    'ph',
    'moisture',
    'carbon'
  ],
  'Landsat-8': [
    'ndvi',
    'evi',
    'savi',
    'msavi',
    'ndwi',
    'nitrogen',
    'phosphorus',
    'potassium',
    'salinity',
    'ph',
    'moisture',
    'carbon'
  ],
  'Landsat-9': [
    'ndvi',
    'evi',
    'savi',
    'msavi',
    'ndwi',
    'nitrogen',
    'phosphorus',
    'potassium',
    'salinity',
    'ph',
    'moisture',
    'carbon'
  ],
  'Sentinel-1 SAR': [
    'sar_moisture'
  ]
};

export function getIndicesForSatellite(satellite: string): string[] {
  return SATELLITE_INDEX_MAP[satellite] || [];
}

/**
 * Scale Sentinel-2 surface reflectance values to a 0-1 float range.
 */
export function scaleSentinel2Bands(image: any, config: any): any {
  return image
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .multiply(config.scaleFactor)
    .clamp(0, 1)
    .toFloat();
}

/**
 * Scale Landsat surface reflectance values to a 0-1 float range.
 */
export function scaleLandsatBands(image: any, config: any): any {
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

/**
 * Harmonize Landsat surface reflectance to match Sentinel-2 range
 */
export function harmonizeLandsat(image: any, config: any): any {
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

  return ee.Image(scaled).copyProperties(
    image,
    properties
  );
}

/**
 * Harmonize Sentinel-2 surface reflectance
 */
export function harmonizeSentinel2(image: any, config: any): any {
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

  return ee.Image(scaled).copyProperties(
    image,
    properties
  );
}

/**
 * Get merged optical collection from multiple satellites
 * Returns images from Sentinel-2, Landsat 8, and Landsat 9
 */
export function getMergedOpticalCollection(
  poi: any,
  startDate: string,
  endDate: string,
  maxCloudCover: number = 100
): any {
  // Sentinel-2 Collection
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

  // Landsat 8 Collection
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

  // Landsat 9 Collection
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

  // Merge all collections
  const mergedCollection = s2Collection
    .merge(l8Collection)
    .merge(l9Collection)
    .sort('system:time_start');

  return mergedCollection;
}

/**
 * Get all available dates from all optical satellites
 * Returns ALL observations from all satellites (no deduplication by date)
 */
export async function getAllOpticalDates(
  poi: any,
  startDate: string,
  endDate: string,
  evaluate: (obj: any) => Promise<any>,
  maxCloudCover: number = 30
): Promise<Array<{
  date: string;
  timestamp: number;
  cloud_cover: number | null;
  satellite: string;
  tile_id?: string;
  available_indices: string[];
}>> {
  const allDates: Array<{
    date: string;
    timestamp: number;
    cloud_cover: number | null;
    satellite: string;
    tile_id?: string | undefined;
    available_indices: string[];
  }> = [];

  // Query each satellite independently to get metadata
  const satellites = [
    { config: SATELLITES.SENTINEL2, name: 'Sentinel-2' },
    { config: SATELLITES.LANDSAT8, name: 'Landsat-8' },
    { config: SATELLITES.LANDSAT9, name: 'Landsat-9' }
  ];

  console.log(`🔍 Querying ${satellites.length} optical satellites for dates between ${startDate} and ${endDate}`);

  for (const { config, name } of satellites) {
    try {
      console.log(`  📡 Querying ${name}...`);
      
      const collection = ee.ImageCollection(config.id)
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt(config.cloudProperty, maxCloudCover))
        .sort('system:time_start');

      const imageList = await evaluate(
        collection.map((img: any) => {
          const metadata: any = {
            'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
            'timestamp': img.get('system:time_start'),
            'cloud_cover': img.get(config.cloudProperty),
            'satellite': name
          };

          // Add tile_id for Sentinel-2
          if (name === 'Sentinel-2') {
            metadata['tile_id'] = img.get('MGRS_TILE');
          } else {
            metadata['tile_id'] = img.get('LANDSAT_PRODUCT_ID');
          }

          return ee.Feature(null, metadata);
        }).aggregate_array('.all')
      );

      // Parse results - keep ALL observations (don't deduplicate)
      let count = 0;
      for (const img of imageList) {
        if (!img || !img.properties) {
          console.warn(`  ⚠️  Skipping invalid image data from ${name}`);
          continue;
        }

        const cloudCoverRaw = Number(img.properties.cloud_cover);
        const cloudCover = Number.isFinite(cloudCoverRaw)
          ? Math.round(cloudCoverRaw * 10) / 10
          : null;

        const entry = {
          date: String(img.properties.date || ''),
          timestamp: Number(img.properties.timestamp || 0),
          cloud_cover: cloudCover,
          satellite: String(img.properties.satellite || name),
          tile_id: img.properties.tile_id ? String(img.properties.tile_id) : undefined,
          available_indices: getIndicesForSatellite(name)
        };

        // Validate entry before adding
        if (entry.date && entry.timestamp > 0) {
          allDates.push(entry);
          count++;
        } else {
          console.warn(`  ⚠️  Skipping invalid entry from ${name}:`, entry);
        }
      }

      console.log(`  ✅ ${name}: Found ${count} observations`);
    } catch (error: any) {
      console.error(`  ❌ Error querying ${name}:`, error?.message || error);
      // Continue with other satellites even if one fails
    }
  }

  // Sort by timestamp
  allDates.sort((a, b) => a.timestamp - b.timestamp);
  console.log(`✅ Total optical observations: ${allDates.length}`);

  return allDates;
}

/**
 * Get Sentinel-1 SAR collection
 * Useful for all-weather monitoring (not affected by clouds)
 */
export function getSentinel1Collection(
  poi: any,
  startDate: string,
  endDate: string,
  orbitPass: 'ASCENDING' | 'DESCENDING' | 'BOTH' = 'BOTH'
): any {
  let collection = ee.ImageCollection(SATELLITES.SENTINEL1.id)
    .filterBounds(poi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'));

  if (orbitPass !== 'BOTH') {
    collection = collection.filter(ee.Filter.eq('orbitProperties_pass', orbitPass));
  }

  return collection;
}

/**
 * Get Sentinel-1 SAR observation dates
 */
export async function getSentinel1Dates(
  poi: any,
  startDate: string,
  endDate: string,
  evaluate: (obj: any) => Promise<any>
): Promise<Array<{
  date: string;
  timestamp: number;
  cloud_cover: number | null;
  satellite: string;
  tile_id?: string;
  available_indices: string[];
}>> {
  try {
    console.log(`  📡 Querying Sentinel-1 SAR...`);
    
    const collection = getSentinel1Collection(poi, startDate, endDate, 'BOTH')
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
      .map((img: any) => {
        const metadata: any = {
          'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
          'timestamp': img.get('system:time_start'),
          'satellite': 'Sentinel-1 SAR',
          'tile_id': img.get('PRODUCT_ID')
        };

        return ee.Feature(null, metadata);
      });

    const imageList = await evaluate(collection.aggregate_array('.all'));

    const dates: Array<{
      date: string;
      timestamp: number;
      cloud_cover: number | null;
      satellite: string;
      tile_id?: string;
      available_indices: string[];
    }> = [];

    for (const img of imageList) {
      if (!img || !img.properties) {
        console.warn(`  ⚠️  Skipping invalid SAR image data`);
        continue;
      }

      const entry = {
        date: String(img.properties.date || ''),
        timestamp: Number(img.properties.timestamp || 0),
        cloud_cover: null,
        satellite: 'Sentinel-1 SAR',
        tile_id: img.properties.tile_id ? String(img.properties.tile_id) : undefined,
        available_indices: getIndicesForSatellite('Sentinel-1 SAR')
      };

      // Validate entry before adding
      if (entry.date && entry.timestamp > 0) {
        dates.push(entry);
      } else {
        console.warn(`  ⚠️  Skipping invalid SAR entry:`, entry);
      }
    }

    console.log(`  ✅ Sentinel-1 SAR: Found ${dates.length} observations`);
    return dates;
  } catch (error: any) {
    console.error(`  ❌ Error querying Sentinel-1 SAR:`, error?.message || error);
    return []; // Return empty array on error, don't fail completely
  }
}

/**
 * Get all satellite dates (optical + SAR)
 * Returns ALL observations from all satellites (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1 SAR)
 */
export async function getAllSatelliteDates(
  poi: any,
  startDate: string,
  endDate: string,
  evaluate: (obj: any) => Promise<any>,
  maxCloudCover: number = 30
): Promise<Array<{
  date: string;
  timestamp: number;
  cloud_cover: number | null;
  satellite: string;
  tile_id?: string;
  available_indices: string[];
}>> {
  console.log(`🛰️  Fetching dates from all satellites (${startDate} to ${endDate})`);
  
  // Fetch optical and SAR dates in parallel for better performance
  const [opticalDates, sarDates] = await Promise.all([
    getAllOpticalDates(poi, startDate, endDate, evaluate, maxCloudCover),
    getSentinel1Dates(poi, startDate, endDate, evaluate)
  ]);

  const combined = opticalDates.concat(sarDates);
  combined.sort((a, b) => a.timestamp - b.timestamp);

  // Log summary by satellite
  const satelliteCounts = combined.reduce((acc: Record<string, number>, item) => {
    acc[item.satellite] = (acc[item.satellite] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`✅ Total observations from all satellites: ${combined.length}`);
  console.log(`📊 Breakdown:`, satelliteCounts);

  return combined;
}

/**
 * Calculate data source summary for response metadata
 */
export function getDataSourceSummary(collection: any, evaluate: (obj: any) => Promise<any>): Promise<any> {
  return evaluate(
    collection.aggregate_array('satellite').distinct()
  ).then((satellites: string[]) => {
    return {
      satellites: satellites || ['Sentinel-2', 'Landsat-8', 'Landsat-9'],
      description: 'Multi-satellite optical imagery (harmonized)'
    };
  }).catch(() => {
    return {
      satellites: ['Sentinel-2', 'Landsat-8', 'Landsat-9'],
      description: 'Multi-satellite optical imagery (harmonized)'
    };
  });
}

/**
 * Get the best available scale for a collection
 */
export function getCollectionScale(satellites: string[]): number {
  // If Sentinel-2 is available, use its 10m resolution
  if (satellites.includes('Sentinel-2')) {
    return 10;
  }
  // Otherwise use Landsat 30m
  return 30;
}

/**
 * Convert GeoJSON geometry (Polygon or MultiPolygon) to Earth Engine geometry
 * Handles both Polygon and MultiPolygon types correctly
 */
export function geoJsonToEarthEngine(geometry: {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}): any {
  if (geometry.type === 'Polygon') {
    // Polygon: coordinates is number[][][] (array of rings, first is exterior)
    const coords = geometry.coordinates as number[][][];
    return ee.Geometry.Polygon(coords);
  } else if (geometry.type === 'MultiPolygon') {
    // MultiPolygon: coordinates is number[][][][] (array of polygons)
    const coords = geometry.coordinates as number[][][][];
    return ee.Geometry.MultiPolygon(coords);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

/**
 * Evaluate Earth Engine object using callback-based approach
 * This avoids the "Deno.openSync is blocklisted" error in Supabase Edge Functions
 * Use this instead of .getInfo()
 */
export function evaluate(obj: any): Promise<any> {
  return new Promise((resolve, reject) =>
    obj.evaluate((result: any, error: any) =>
      error ? reject(new Error(error)) : resolve(result)
    )
  );
}

