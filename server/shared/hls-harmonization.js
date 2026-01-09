/**
 * HLS Harmonization Library for Node.js
 * Uses the same approach as working Supabase functions
 */

import ee from '@google/earthengine';

/**
 * Harmonize Sentinel-2 bands to standard naming
 * Uses friendly band names: blue, green, red, nir, swir1, swir2
 */
function harmonizeSentinel2(img) {
    const scaled = img
        .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
        .multiply(0.0001)
        .clamp(0, 1)
        .toFloat()
        .rename(['blue', 'green', 'red', 'nir', 'swir1', 'swir2']);

    return scaled
        .set('satellite', 'Sentinel-2')
        .set('system:time_start', img.get('system:time_start'))
        .set('cloud_cover', img.get('CLOUDY_PIXEL_PERCENTAGE'));
}

/**
 * Harmonize Landsat bands to friendly naming convention
 * Uses friendly band names: blue, green, red, nir, swir1, swir2
 */
function harmonizeLandsat(img, satelliteName, cloudProperty) {
    const scaled = img
        .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
        .multiply(0.0000275)
        .add(-0.2)
        .clamp(0, 1)
        .toFloat()
        .rename(['blue', 'green', 'red', 'nir', 'swir1', 'swir2']);

    return scaled
        .set('satellite', satelliteName)
        .set('system:time_start', img.get('system:time_start'))
        .set('cloud_cover', img.get(cloudProperty));
}

/**
 * Get merged optical collection (S2 + L8 + L9) with HLS harmonization
 * Matches the working Supabase implementation exactly
 */
export function getMergedOpticalCollectionHLS(
    geometry,
    startDate,
    endDate,
    cloudCoverThreshold,
    config
) {
    // Sentinel-2
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudCoverThreshold))
        .map((img) => harmonizeSentinel2(img));

    // Landsat-8
    const l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', cloudCoverThreshold))
        .map((img) => harmonizeLandsat(img, 'Landsat-8', 'CLOUD_COVER'));

    // Landsat-9
    const l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', cloudCoverThreshold))
        .map((img) => harmonizeLandsat(img, 'Landsat-9', 'CLOUD_COVER'));

    // Merge collections and sort by time
    return s2.merge(l8).merge(l9).sort('system:time_start');
}
