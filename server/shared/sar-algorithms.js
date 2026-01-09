/**
 * SAR Algorithms for Node.js
 */

import ee from '@google/earthengine';
import { evaluate } from './satellite-utils.js';

/**
 * Get Sentinel-1 SAR collection with preprocessing
 */
export function getSentinel1Collection(
    geometry,
    startDate,
    endDate,
    config
) {
    let collection = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filterBounds(geometry)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq('instrumentMode', 'IW'));

    if (config.orbitDirection !== 'BOTH') {
        collection = collection.filter(
            ee.Filter.eq('orbitProperties_pass', config.orbitDirection)
        );
    }

    if (config.applySpeckleFilter) {
        if (config.filterType === 'REFINED_LEE') {
            collection = collection.map((img) => applyRefinedLeeFilter(img));
        } else {
            collection = collection.map((img) => applyBoxcarFilter(img));
        }
    }

    if (config.polarization === 'VV') {
        collection = collection.select(['VV']);
    } else if (config.polarization === 'VH') {
        collection = collection.select(['VH']);
    } else {
        collection = collection.select(['VV', 'VH']);
    }

    return collection;
}

function applyRefinedLeeFilter(image) {
    const img = ee.Image(image);
    const bands = img.bandNames();

    const filtered = bands.map((band) => {
        const bandImg = img.select([band]);
        const kernel = ee.Kernel.square(3, 'pixels');
        const mean = bandImg.reduceNeighborhood({
            reducer: ee.Reducer.mean(),
            kernel: kernel,
        });

        const variance = bandImg.reduceNeighborhood({
            reducer: ee.Reducer.variance(),
            kernel: kernel,
        });

        const cv = variance.sqrt().divide(mean);
        const noiseVariance = cv.multiply(cv).multiply(mean).multiply(mean);
        const weights = variance.subtract(noiseVariance)
            .divide(variance)
            .clamp(0, 1);

        const filtered = mean.multiply(weights)
            .add(bandImg.multiply(ee.Image(1).subtract(weights)));

        // rename expects an array, not a string
        return filtered.rename([band]);
    });

    return ee.ImageCollection(filtered).toBands()
        .rename(bands)
        .copyProperties(img, img.propertyNames());
}

function applyBoxcarFilter(image) {
    const img = ee.Image(image);
    const kernel = ee.Kernel.square(3, 'pixels');

    return img.reduceNeighborhood({
        reducer: ee.Reducer.mean(),
        kernel: kernel,
    }).copyProperties(img, img.propertyNames());
}

/**
 * Calculate temporal statistics for SAR time series
 */
export async function calculateSARTemporalStats(
    collection,
    geometry,
    polarization = 'VV'
) {
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
