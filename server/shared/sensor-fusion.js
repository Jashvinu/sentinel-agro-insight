/**
 * Sensor Fusion Library for Node.js
 */

import ee from '@google/earthengine';

const NDVI_THRESHOLDS = {
    LOW: 0.3,
    HIGH: 0.5,
};

/**
 * Fuse optical (OPTRAM) and SAR moisture estimates using NDVI-based weighting
 */
export function fuseMoistureEstimates(optramMoisture, sarMoisture, ndvi) {
    const lowNDVI = NDVI_THRESHOLDS.LOW;
    const highNDVI = NDVI_THRESHOLDS.HIGH;

    // Calculate optical weight
    const opticalWeight = ee.Image(0)
        .where(ndvi.lt(lowNDVI), 1.0)
        .where(
            ndvi.gte(lowNDVI).and(ndvi.lt(highNDVI)),
            ndvi.subtract(lowNDVI)
                .divide(highNDVI - lowNDVI)
                .multiply(-1)
                .add(1)
        )
        .where(ndvi.gte(highNDVI), 0.0)
        .rename('Optical_Weight');

    // Calculate SAR weight
    const sarWeight = ee.Image(0)
        .where(ndvi.lt(lowNDVI), 0.0)
        .where(
            ndvi.gte(lowNDVI).and(ndvi.lt(highNDVI)),
            ndvi.subtract(lowNDVI)
                .divide(highNDVI - lowNDVI)
        )
        .where(ndvi.gte(highNDVI), 1.0)
        .rename('SAR_Weight');

    // Normalize SAR moisture to 0-1 range
    const sarMoistureNormalized = sarMoisture
        .add(1)
        .divide(2)
        .clamp(0, 1)
        .rename('SAR_Moisture_Normalized');

    // Calculate weighted fusion
    const totalWeight = opticalWeight.add(sarWeight);

    const fusedMoisture = optramMoisture
        .multiply(opticalWeight)
        .add(sarMoistureNormalized.multiply(sarWeight))
        .divide(totalWeight.add(0.0001))
        .clamp(0, 1)
        .rename('Fused_Moisture');

    return {
        fusedMoisture: fusedMoisture,
        opticalWeight: opticalWeight,
        sarWeight: sarWeight,
        ndvi: ndvi,
        metadata: {
            fusionStrategy: 'NDVI-based weighted fusion',
            ndviThresholds: {
                low: lowNDVI,
                high: highNDVI,
            },
        },
    };
}
