/**
 * SAR (Synthetic Aperture Radar) Algorithms
 * Sentinel-1 C-band moisture change detection
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { evaluate } from './satellite-utils.ts';

export interface SARChangeResult {
    changeImage: any; // ee.Image
    baselineStats: { mean: number; stdDev: number };
    significanceMap: any; // ee.Image
    moistureChangeImage: any; // ee.Image
}

export interface SARPreprocessingConfig {
    polarization: 'VV' | 'VH' | 'BOTH';
    orbitDirection: 'ASCENDING' | 'DESCENDING' | 'BOTH';
    applySpeckleFilter: boolean;
    filterType: 'REFINED_LEE' | 'BOXCAR';
}

/**
 * Get Sentinel-1 SAR collection with preprocessing
 */
export function getSentinel1Collection(
    geometry: any,
    startDate: string,
    endDate: string,
    config: SARPreprocessingConfig
): any {
    let collection = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq('instrumentMode', 'IW')); // Interferometric Wide swath

    // Filter by orbit direction if specified
    if (config.orbitDirection !== 'BOTH') {
        collection = collection.filter(
            ee.Filter.eq('orbitProperties_pass', config.orbitDirection)
        );
    }

    // Apply speckle filtering
    if (config.applySpeckleFilter) {
        if (config.filterType === 'REFINED_LEE') {
            collection = collection.map((img: any) => applyRefinedLeeFilter(img));
        } else {
            collection = collection.map((img: any) => applyBoxcarFilter(img));
        }
    }

    // Select polarization
    if (config.polarization === 'VV') {
        collection = collection.select(['VV']);
    } else if (config.polarization === 'VH') {
        collection = collection.select(['VH']);
    } else {
        collection = collection.select(['VV', 'VH']);
    }

    return collection;
}

/**
 * Apply Refined Lee speckle filter
 * Adaptive filter that preserves edges while reducing speckle
 */
function applyRefinedLeeFilter(image: any): any {
    // Convert to linear scale (from dB)
    const img = ee.Image(image);

    // Get image bands
    const bands = img.bandNames();

    // Apply filter to each band
    const filtered = bands.map((band: any) => {
        const bandImg = img.select([band]);

        // Refined Lee parameters
        const kernel = ee.Kernel.square(3, 'pixels');
        const mean = bandImg.reduceNeighborhood({
            reducer: ee.Reducer.mean(),
            kernel: kernel,
        });

        const variance = bandImg.reduceNeighborhood({
            reducer: ee.Reducer.variance(),
            kernel: kernel,
        });

        // Coefficient of variation
        const cv = variance.sqrt().divide(mean);

        // Noise variance (estimated)
        const noiseVariance = cv.multiply(cv).multiply(mean).multiply(mean);

        // Weights
        const weights = variance.subtract(noiseVariance)
            .divide(variance)
            .clamp(0, 1);

        // Filtered image
        const filtered = mean.multiply(weights)
            .add(bandImg.multiply(ee.Image(1).subtract(weights)));

        return filtered.rename(band);
    });

    return ee.ImageCollection(filtered).toBands()
        .rename(bands)
        .copyProperties(img, img.propertyNames());
}

/**
 * Apply Boxcar (mean) speckle filter
 * Simple averaging filter
 */
function applyBoxcarFilter(image: any): any {
    const img = ee.Image(image);
    const kernel = ee.Kernel.square(3, 'pixels');

    return img.reduceNeighborhood({
        reducer: ee.Reducer.mean(),
        kernel: kernel,
    }).copyProperties(img, img.propertyNames());
}

/**
 * Detect SAR moisture change using historical baseline normalization
 * Uses Z-score approach to identify significant changes
 */
export async function detectSARMoistureChange(
    currentImage: any,
    historicalCollection: any,
    geometry: any,
    polarization: 'VV' | 'VH' = 'VV'
): Promise<SARChangeResult> {
    // 1. Calculate historical baseline statistics
    const historicalMean = historicalCollection
        .select(polarization)
        .reduce(ee.Reducer.mean())
        .rename('baseline_mean')
        .clip(geometry);

    const historicalStdDev = historicalCollection
        .select(polarization)
        .reduce(ee.Reducer.stdDev())
        .rename('baseline_stdDev')
        .clip(geometry);

    // 2. Get current backscatter
    const currentSigma = currentImage.select(polarization).clip(geometry);

    // 3. Normalize current image to historical statistics (Z-score)
    const normalizedChange = currentSigma
        .subtract(historicalMean)
        .divide(historicalStdDev)
        .rename('SAR_Change');

    // 4. Calculate significance map (|Z| > 1.96 indicates 95% confidence)
    const significanceMap = normalizedChange
        .abs()
        .gt(1.96)
        .rename('is_significant');

    // 5. Convert to moisture change estimate
    // Negative change in backscatter → increased moisture (water attenuates signal)
    // Positive change in backscatter → decreased moisture
    const moistureChange = normalizedChange
        .multiply(-1) // Invert: higher backscatter = drier
        .multiply(0.1) // Sensitivity factor (calibrated empirically)
        .clamp(-1, 1) // Constrain to [-1, 1] range
        .rename('Moisture_Change');

    // 6. Get baseline statistics for metadata
    const baselineStatsRegion = historicalMean.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 10,
        maxPixels: 1e9,
    });

    const baselineStdDevRegion = historicalStdDev.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 10,
        maxPixels: 1e9,
    });

    return {
        changeImage: normalizedChange,
        baselineStats: {
            mean: await evaluate(ee.Number(baselineStatsRegion.get('baseline_mean'))),
            stdDev: await evaluate(ee.Number(baselineStdDevRegion.get('baseline_stdDev'))),
        },
        significanceMap: significanceMap,
        moistureChangeImage: moistureChange,
    };
}

/**
 * Calculate temporal statistics for SAR time series
 * Useful for understanding baseline variability
 */
export async function calculateSARTemporalStats(
    collection: any,
    geometry: any,
    polarization: 'VV' | 'VH' = 'VV'
): Promise<any> {
    const stats = collection.select(polarization).reduce(
        ee.Reducer.mean()
            .combine(ee.Reducer.stdDev(), '', true)
            .combine(ee.Reducer.min(), '', true)
            .combine(ee.Reducer.max(), '', true)
            .combine(ee.Reducer.count(), '', true)
    ).clip(geometry);

    const regionStats = stats.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 10,
        maxPixels: 1e9,
    });

    return {
        mean: await evaluate(ee.Number(regionStats.get(polarization + '_mean'))),
        stdDev: await evaluate(ee.Number(regionStats.get(polarization + '_stdDev'))),
        min: await evaluate(ee.Number(regionStats.get(polarization + '_min'))),
        max: await evaluate(ee.Number(regionStats.get(polarization + '_max'))),
        count: await evaluate(ee.Number(regionStats.get(polarization + '_count'))),
    };
}

/**
 * Convert dB to linear scale (power)
 * SAR data is typically stored in dB for visualization
 */
export function dbToLinear(image: any): any {
    return ee.Image(10).pow(image.divide(10));
}

/**
 * Convert linear scale to dB
 */
export function linearToDb(image: any): any {
    return ee.Image(10).multiply(image.log10());
}

/**
 * Calculate VV/VH ratio
 * Useful for crop type discrimination and biomass estimation
 */
export function calculateVVVHRatio(image: any): any {
    const vv = image.select('VV');
    const vh = image.select('VH');

    const ratio = vv.divide(vh).rename('VV_VH_ratio');

    return image.addBands(ratio);
}
