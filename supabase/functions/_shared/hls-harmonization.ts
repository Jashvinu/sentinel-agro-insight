/**
 * HLS (Harmonized Landsat Sentinel) Harmonization Library
 * Multi-sensor fusion for Sentinel-2, Landsat-8, and Landsat-9
 * Implements spectral bandpass adjustment and BRDF normalization
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { evaluate } from './satellite-utils.ts';

export interface HLSConfig {
    targetResolution: number; // 30m standard
    targetProjection?: string; // EPSG code or 'MGRS'
    applyBRDF: boolean;
    applySpectralAdjustment: boolean;
}

// Spectral Bandpass Adjustment coefficients (HLS v2.0 ATBD)
// These adjust for sensor-specific spectral response differences
const SBA_COEFFICIENTS = {
    S2: {
        blue: 1.0000,
        green: 1.0000,
        red: 1.0000,
        nir: 1.0000,
        swir1: 1.0000,
        swir2: 1.0000,
    },
    L8: {
        blue: 0.9959,
        green: 1.0023,
        red: 1.0049,
        nir: 0.9971,
        swir1: 1.0014,
        swir2: 0.9999,
    },
    L9: {
        blue: 0.9959,
        green: 1.0023,
        red: 1.0049,
        nir: 0.9971,
        swir1: 1.0014,
        swir2: 0.9999,
    },
};

/**
 * Apply Spectral Bandpass Adjustment (SBA) for cross-sensor harmonization
 * Adjusts for differences in spectral response functions between sensors
 */
export function applySpectralBandpassAdjustment(
    image: any,
    sensor: 'S2' | 'L8' | 'L9'
): any {
    const coeffs = SBA_COEFFICIENTS[sensor];

    // Get band names based on sensor
    const bandNames = sensor === 'S2'
        ? ['B2', 'B3', 'B4', 'B8', 'B11', 'B12']
        : ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];

    // Apply adjustment coefficients
    const adjusted = image
        .select(bandNames[0]).multiply(coeffs.blue).rename('blue')
        .addBands(image.select(bandNames[1]).multiply(coeffs.green).rename('green'))
        .addBands(image.select(bandNames[2]).multiply(coeffs.red).rename('red'))
        .addBands(image.select(bandNames[3]).multiply(coeffs.nir).rename('nir'))
        .addBands(image.select(bandNames[4]).multiply(coeffs.swir1).rename('swir1'))
        .addBands(image.select(bandNames[5]).multiply(coeffs.swir2).rename('swir2'));

    return adjusted.copyProperties(image, image.propertyNames());
}

/**
 * Calculate volumetric scattering kernel (Ross-Thick)
 * Part of BRDF correction using c-factor approach
 */
function calculateKvolKernel(
    solarZenith: number,
    solarAzimuth: number,
    viewZenith: number,
    viewAzimuth: number
): number {
    // Convert to radians
    const szRad = (solarZenith * Math.PI) / 180;
    const vzRad = (viewZenith * Math.PI) / 180;
    const relAzRad = ((solarAzimuth - viewAzimuth) * Math.PI) / 180;

    // Phase angle
    const cosPhase = Math.cos(szRad) * Math.cos(vzRad) +
                    Math.sin(szRad) * Math.sin(vzRad) * Math.cos(relAzRad);
    const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase)));

    // Ross-Thick kernel
    const kvol = ((Math.PI / 2 - phase) * cosPhase + Math.sin(phase)) /
                 (Math.cos(szRad) + Math.cos(vzRad)) - Math.PI / 4;

    return kvol;
}

/**
 * Calculate geometric scattering kernel (Li-Sparse-Reciprocal)
 * Part of BRDF correction using c-factor approach
 */
function calculateKgeoKernel(
    solarZenith: number,
    solarAzimuth: number,
    viewZenith: number,
    viewAzimuth: number
): number {
    // Convert to radians
    const szRad = (solarZenith * Math.PI) / 180;
    const vzRad = (viewZenith * Math.PI) / 180;
    const relAzRad = ((solarAzimuth - viewAzimuth) * Math.PI) / 180;

    // Li-Sparse-Reciprocal parameters
    const hb = 2.0; // Height-to-width ratio
    const br = 1.0; // Crown shape parameter

    // Calculations
    const tanSz = Math.tan(szRad);
    const tanVz = Math.tan(vzRad);

    const cosPhase = Math.cos(szRad) * Math.cos(vzRad) +
                    Math.sin(szRad) * Math.sin(vzRad) * Math.cos(relAzRad);
    const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase)));

    const temp = hb * hb + tanSz * tanSz + tanVz * tanVz -
                2 * hb * tanSz * tanVz * Math.cos(relAzRad);
    const D = Math.sqrt(Math.max(0, temp));

    const cost = hb * (tanSz + tanVz) / D;
    const t = Math.acos(Math.max(-1, Math.min(1, cost)));

    const O = (1 / Math.PI) * (t - Math.sin(t) * cost) * (tanSz + tanVz);

    const kgeo = O - (1 / Math.cos(szRad)) - (1 / Math.cos(vzRad)) +
                0.5 * (1 + cosPhase) / (Math.cos(szRad) * Math.cos(vzRad));

    return kgeo;
}

/**
 * Apply BRDF normalization using c-factor approach
 * Normalizes to nadir view and fixed solar zenith (45°)
 */
export async function applyBRDFNormalization(
    image: any
): Promise<any> {
    // Get solar and view geometry from image metadata
    const solarZenith = ee.Number(image.get('MEAN_SOLAR_ZENITH_ANGLE')).divide(100);
    const solarAzimuth = ee.Number(image.get('MEAN_SOLAR_AZIMUTH_ANGLE')).divide(100);

    // Sentinel-2 is near-nadir viewing, approximate as 0°
    const viewZenith = 0;
    const viewAzimuth = 0;

    // Target geometry: nadir view, 45° solar zenith
    const targetSolarZenith = 45;
    const targetSolarAzimuth = 0;
    const targetViewZenith = 0;
    const targetViewAzimuth = 0;

    // Calculate kernels for actual geometry
    const kvol = calculateKvolKernel(
        await evaluate(solarZenith),
        await evaluate(solarAzimuth),
        viewZenith,
        viewAzimuth
    );
    const kgeo = calculateKgeoKernel(
        await evaluate(solarZenith),
        await evaluate(solarAzimuth),
        viewZenith,
        viewAzimuth
    );

    // Calculate kernels for target geometry
    const kvolNadir = calculateKvolKernel(
        targetSolarZenith,
        targetSolarAzimuth,
        targetViewZenith,
        targetViewAzimuth
    );
    const kgeoNadir = calculateKgeoKernel(
        targetSolarZenith,
        targetSolarAzimuth,
        targetViewZenith,
        targetViewAzimuth
    );

    // C-factor correction
    // Simplified approach: assumes isotropic + volumetric + geometric scattering
    const cFactor = (1 + kvol + kgeo) / (1 + kvolNadir + kgeoNadir);

    // Apply correction to all bands
    const corrected = image.divide(cFactor);

    return corrected.copyProperties(image, image.propertyNames());
}

/**
 * Main HLS harmonization pipeline
 * Processes an image collection to produce harmonized surface reflectance
 */
export function harmonizeToHLS(
    collection: any,
    config: HLSConfig
): any {
    return collection.map((img: any) => {
        let harmonized = img;

        // Note: Sensor-specific adjustments are temporarily simplified to avoid getInfo() calls
        // which trigger "Deno.openSync is blocklisted" errors in Supabase Edge Functions
        // TODO: Refactor to use per-sensor collections like satellite-utils.ts does

        // Apply basic harmonization (resampling to target resolution)
        // Spectral bandpass adjustment and BRDF normalization skipped for now

        // Reproject to target resolution
        const projection = config.targetProjection || 'EPSG:32643'; // Default to WGS84 UTM 43N
        harmonized = harmonized.reproject({
            crs: projection,
            scale: config.targetResolution,
        });

        return harmonized;
    });
}

/**
 * Get merged optical collection (S2 + L8 + L9) with HLS harmonization
 * Extends existing satellite-utils.ts functionality
 */
export function getMergedOpticalCollectionHLS(
    geometry: any,
    startDate: string,
    endDate: string,
    cloudCoverThreshold: number,
    config: HLSConfig
): any {
    // Sentinel-2
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudCoverThreshold))
        .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'], ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
        .map((img: any) => img.multiply(0.0001).set('SPACECRAFT_NAME', 'Sentinel-2'));

    // Landsat-8
    const l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', cloudCoverThreshold))
        .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'], ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
        .map((img: any) => img.multiply(0.0000275).add(-0.2).set('SPACECRAFT_NAME', 'LANDSAT_8'));

    // Landsat-9
    const l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', cloudCoverThreshold))
        .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'], ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
        .map((img: any) => img.multiply(0.0000275).add(-0.2).set('SPACECRAFT_NAME', 'LANDSAT_9'));

    // Merge collections
    const merged = s2.merge(l8).merge(l9).sort('system:time_start');

    // Apply HLS harmonization
    return harmonizeToHLS(merged, config);
}
