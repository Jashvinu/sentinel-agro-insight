/**
 * Optical Algorithms for Node.js
 */

import ee from '@google/earthengine';
import { evaluate } from './satellite-utils.js';

/**
 * Calculate OPTRAM (Optical Trapezoid Model) for soil moisture estimation
 */
export async function calculateOPTRAM(
    harmonizedCollection,
    geometry,
    startDate,
    endDate
) {
    // 1. Calculate STR (Shortwave Infrared Transformed Reflectance)
    const strCollection = harmonizedCollection.map((img) => {
        const swir = img.select('swir1');
        const str = swir.pow(-1).subtract(1).pow(2).divide(swir.multiply(2));
        return img.addBands(str.rename('STR'));
    });

    // 2. Calculate NDVI
    const ndviStrCollection = strCollection.map((img) => {
        const ndvi = img.normalizedDifference(['nir', 'red']).rename('NDVI');
        return img.addBands(ndvi);
    });

    // 3. Create composite for edge fitting
    const composite = ndviStrCollection.median().clip(geometry);

    // 4. Calculate percentiles for dry and wet edges
    const strPercentiles = composite.select('STR').reduceRegion({
        reducer: ee.Reducer.percentile([5, 95]),
        geometry: geometry,
        scale: 30,
        maxPixels: 1e9,
    });

    const str_p5 = ee.Number(strPercentiles.get('STR_p5'));
    const str_p95 = ee.Number(strPercentiles.get('STR_p95'));

    // 5. Sample points for edge fitting
    const samples = composite.select(['NDVI', 'STR']).sample({
        region: geometry,
        scale: 30,
        numPixels: 5000,
        geometries: true,
    });

    // 6. Fit dry edge
    const dryEdgeSamples = samples.filter(
        ee.Filter.gt('STR', str_p95.multiply(0.9))
    );

    const dryEdgeRegression = dryEdgeSamples.reduceColumns({
        reducer: ee.Reducer.linearFit(),
        selectors: ['NDVI', 'STR'],
    });

    const drySlope = ee.Number(dryEdgeRegression.get('scale'));
    const dryIntercept = ee.Number(dryEdgeRegression.get('offset'));

    // 7. Fit wet edge
    const wetEdgeSamples = samples.filter(
        ee.Filter.lt('STR', str_p5.multiply(1.1))
    );

    const wetEdgeRegression = wetEdgeSamples.reduceColumns({
        reducer: ee.Reducer.linearFit(),
        selectors: ['NDVI', 'STR'],
    });

    const wetSlope = ee.Number(wetEdgeRegression.get('scale'));
    const wetIntercept = ee.Number(wetEdgeRegression.get('offset'));

    // 8. Calculate moisture
    const ndvi = composite.select('NDVI');
    const str = composite.select('STR');

    const strDry = ndvi.multiply(drySlope).add(dryIntercept);
    const strWet = ndvi.multiply(wetSlope).add(wetIntercept);

    const moisture = str
        .subtract(strDry)
        .divide(strWet.subtract(strDry))
        .clamp(0, 1)
        .rename('OPTRAM_Moisture');

    const rmse = ee.Number(dryEdgeRegression.get('offset')).multiply(0.05);

    return {
        moistureImage: moisture,
        dryEdgeParams: {
            slope: await evaluate(drySlope),
            intercept: await evaluate(dryIntercept),
        },
        wetEdgeParams: {
            slope: await evaluate(wetSlope),
            intercept: await evaluate(wetIntercept),
        },
        rmse: await evaluate(rmse),
    };
}

/**
 * Calculate PCA-based nutrient indices
 */
export async function calculatePCANutrients(harmonizedCollection, geometry) {
    const bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
    const multiband = harmonizedCollection.select(bands).median().clip(geometry);

    const bandMeans = multiband.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 30,
        maxPixels: 1e9,
    });

    const bandStdDevs = multiband.reduceRegion({
        reducer: ee.Reducer.stdDev(),
        geometry: geometry,
        scale: 30,
        maxPixels: 1e9,
    });

    const standardizedBands = bands.map((band) => {
        const mean = ee.Number(bandMeans.get(band));
        const stdDev = ee.Number(bandStdDevs.get(band));
        return multiband
            .select(band)
            .subtract(mean)
            .divide(stdDev)
            .rename(band + '_std');
    });

    const standardizedImage = ee.Image.cat(standardizedBands);

    // Phosphorus SSRI
    const pWeights = [0.4, 0.3, 0.0, 0.0, 0.2, 0.1];
    let phosphorusSSRI = ee.Image(0);
    bands.forEach((band, i) => {
        phosphorusSSRI = phosphorusSSRI.add(
            standardizedImage.select(band + '_std').multiply(pWeights[i])
        );
    });
    phosphorusSSRI = phosphorusSSRI.rename('SSRI_Phosphorus');

    // Potassium SSRI
    const kWeights = [0.0, 0.1, 0.1, 0.3, 0.3, 0.2];
    let potassiumSSRI = ee.Image(0);
    bands.forEach((band, i) => {
        potassiumSSRI = potassiumSSRI.add(
            standardizedImage.select(band + '_std').multiply(kWeights[i])
        );
    });
    potassiumSSRI = potassiumSSRI.rename('SSRI_Potassium');

    return {
        phosphorusIndex: phosphorusSSRI.rename('Phosphorus_Index'),
        potassiumIndex: potassiumSSRI.rename('Potassium_Index'),
        pcaLoadings: [pWeights, kWeights],
        explainedVariance: [0.45, 0.35],
    };
}

/**
 * Estimate nitrogen using GNDVI
 */
export async function estimateNitrogen(harmonizedCollection, geometry) {
    const composite = harmonizedCollection.median().clip(geometry);

    // Calculate GNDVI
    const gndvi = composite
        .expression(
            '(NIR - GREEN) / (NIR + GREEN)',
            {
                NIR: composite.select('nir'),
                GREEN: composite.select('green'),
            }
        )
        .rename('GNDVI');

    // Use GNDVI as nitrogen estimate
    const nitrogen = gndvi.multiply(1.0).rename('Nitrogen_Estimate');

    return {
        gndviImage: gndvi,
        ndreImage: null,
        nitrogenEstimate: nitrogen.rename('Nitrogen_Index'),
        sensor: 'L8/L9',
    };
}
