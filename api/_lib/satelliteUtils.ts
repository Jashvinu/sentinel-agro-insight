/**
 * Satellite Band Harmonization and Multi-Satellite Support
 * Supports Sentinel-2, Landsat 8, Landsat 9, and Sentinel-1 SAR
 */

import ee from '@google/earthengine';

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
        'ndvi', 'evi', 'savi', 'msavi', 'ndwi', 'gndvi', 'ndre',
        'nitrogen', 'phosphorus', 'potassium', 'salinity', 'ph', 'moisture', 'carbon'
    ],
    'Landsat-8': [
        'ndvi', 'evi', 'savi', 'msavi', 'ndwi', 'gndvi',
        'nitrogen', 'phosphorus', 'potassium', 'salinity', 'ph', 'moisture', 'carbon'
    ],
    'Landsat-9': [
        'ndvi', 'evi', 'savi', 'msavi', 'ndwi', 'gndvi',
        'nitrogen', 'phosphorus', 'potassium', 'salinity', 'ph', 'moisture', 'carbon'
    ],
    'Sentinel-1 SAR': ['sar_moisture']
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
        'system:bands', 'system:bands_names', 'system:bands_types', 'system:band_types'
    ];

    let properties = ee.List(image.propertyNames());
    for (const prop of propertiesToRemove) {
        properties = properties.remove(prop);
    }

    return ee.Image(scaled).copyProperties(image, properties);
}

/**
 * Harmonize Sentinel-2 surface reflectance
 */
export function harmonizeSentinel2(image: any, config: any): any {
    const scaled = scaleSentinel2Bands(image, config);

    const propertiesToRemove = [
        'system:bands', 'system:bands_names', 'system:bands_types', 'system:band_types'
    ];

    let properties = ee.List(image.propertyNames());
    for (const prop of propertiesToRemove) {
        properties = properties.remove(prop);
    }

    return ee.Image(scaled).copyProperties(image, properties);
}

/**
 * Get merged optical collection from multiple satellites
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
    return s2Collection
        .merge(l8Collection)
        .merge(l9Collection)
        .sort('system:time_start');
}

/**
 * Convert GeoJSON geometry to Earth Engine geometry
 */
export function geoJsonToEarthEngine(geometry: {
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
        throw new Error(`Unsupported geometry type: ${(geometry as any).type}`);
    }
}

/**
 * Evaluate Earth Engine object using callback-based approach
 */
export function evaluate(obj: any): Promise<any> {
    return new Promise((resolve, reject) =>
        obj.evaluate((result: any, error: any) =>
            error ? reject(new Error(error)) : resolve(result)
        )
    );
}

export { ee };
