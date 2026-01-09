/**
 * Sensor Fusion Library
 * Combines optical and SAR moisture estimates using NDVI-based weighting
 */

import ee from 'npm:@google/earthengine@1.6.13';
import { evaluate } from './satellite-utils.ts';

export interface FusedMoistureResult {
    fusedMoisture: any; // ee.Image
    opticalWeight: any; // ee.Image
    sarWeight: any; // ee.Image
    ndvi: any; // ee.Image
    metadata: {
        fusionStrategy: string;
        ndviThresholds: { low: number; high: number };
    };
}

// NDVI thresholds for fusion strategy
const NDVI_THRESHOLDS = {
    LOW: 0.3, // Below this: prefer OPTRAM (sparse vegetation, optical more sensitive)
    HIGH: 0.5, // Above this: prefer SAR (dense vegetation, optical saturates)
};

/**
 * Fuse optical (OPTRAM) and SAR moisture estimates using NDVI-based weighting
 *
 * Strategy:
 * - Low NDVI (<0.3): Use optical (OPTRAM) - better for bare soil
 * - High NDVI (>0.5): Use SAR - better for dense vegetation
 * - Medium NDVI (0.3-0.5): Weighted blend
 *
 * @param optramMoisture Optical moisture estimate (0-1 range)
 * @param sarMoisture SAR moisture estimate (normalized to 0-1 range)
 * @param ndvi NDVI image for weighting
 * @returns Fused moisture with weights
 */
export function fuseMoistureEstimates(
    optramMoisture: any,
    sarMoisture: any,
    ndvi: any
): FusedMoistureResult {
    const lowNDVI = NDVI_THRESHOLDS.LOW;
    const highNDVI = NDVI_THRESHOLDS.HIGH;

    // 1. Calculate optical weight
    // Full weight (1.0) for NDVI < 0.3
    // Decreasing weight from 1.0 to 0.0 for NDVI 0.3-0.5
    // Zero weight (0.0) for NDVI > 0.5
    const opticalWeight = ee.Image(0)
        // Low NDVI region: full optical weight
        .where(ndvi.lt(lowNDVI), 1.0)
        // Transition region: linear decrease
        .where(
            ndvi.gte(lowNDVI).and(ndvi.lt(highNDVI)),
            ndvi.subtract(lowNDVI)
                .divide(highNDVI - lowNDVI)
                .multiply(-1)
                .add(1)
        )
        // High NDVI region: zero optical weight
        .where(ndvi.gte(highNDVI), 0.0)
        .rename('Optical_Weight');

    // 2. Calculate SAR weight
    // Zero weight (0.0) for NDVI < 0.3
    // Increasing weight from 0.0 to 1.0 for NDVI 0.3-0.5
    // Full weight (1.0) for NDVI > 0.5
    const sarWeight = ee.Image(0)
        // Low NDVI region: zero SAR weight
        .where(ndvi.lt(lowNDVI), 0.0)
        // Transition region: linear increase
        .where(
            ndvi.gte(lowNDVI).and(ndvi.lt(highNDVI)),
            ndvi.subtract(lowNDVI)
                .divide(highNDVI - lowNDVI)
        )
        // High NDVI region: full SAR weight
        .where(ndvi.gte(highNDVI), 1.0)
        .rename('SAR_Weight');

    // 3. Normalize SAR moisture to 0-1 range if needed
    // SAR change detection produces values in [-1, 1], convert to [0, 1]
    const sarMoistureNormalized = sarMoisture
        .add(1)
        .divide(2)
        .clamp(0, 1)
        .rename('SAR_Moisture_Normalized');

    // 4. Calculate weighted fusion
    const totalWeight = opticalWeight.add(sarWeight);

    const fusedMoisture = optramMoisture
        .multiply(opticalWeight)
        .add(sarMoistureNormalized.multiply(sarWeight))
        .divide(totalWeight.add(0.0001)) // Add small epsilon to avoid division by zero
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

/**
 * Calculate fusion quality metrics
 * Assesses the reliability of the fused moisture estimate
 */
export async function calculateFusionQuality(
    fusedResult: FusedMoistureResult,
    geometry: any
): Promise<any> {
    const { opticalWeight, sarWeight, ndvi } = fusedResult;

    // Calculate regional statistics
    const stats = ee.Image.cat([
        opticalWeight,
        sarWeight,
        ndvi,
    ]).reduceRegion({
        reducer: ee.Reducer.mean()
            .combine(ee.Reducer.stdDev(), '', true),
        geometry: geometry,
        scale: 30,
        maxPixels: 1e9,
    });

    return {
        meanOpticalWeight: await evaluate(ee.Number(stats.get('Optical_Weight_mean'))),
        meanSARWeight: await evaluate(ee.Number(stats.get('SAR_Weight_mean'))),
        meanNDVI: await evaluate(ee.Number(stats.get('NDVI_mean'))),
        stdDevNDVI: await evaluate(ee.Number(stats.get('NDVI_stdDev'))),
    };
}

/**
 * Create a fusion confidence map
 * Higher confidence when weights are extreme (0 or 1), lower when blended
 */
export function createFusionConfidenceMap(
    fusedResult: FusedMoistureResult
): any {
    const { opticalWeight, sarWeight } = fusedResult;

    // Confidence is higher when one weight dominates
    // Lower confidence in transition zone where both contribute
    const confidence = opticalWeight
        .subtract(0.5)
        .abs()
        .multiply(2) // Scale to [0, 1]
        .rename('Fusion_Confidence');

    return confidence;
}

/**
 * Apply temporal smoothing to fused moisture time series
 * Reduces noise while preserving trends
 */
export function temporalSmoothing(
    moistureCollection: any,
    windowSize: number = 3
): any {
    return moistureCollection.map((img: any) => {
        const date = ee.Date(img.get('system:time_start'));
        const before = date.advance(-windowSize, 'day');
        const after = date.advance(windowSize, 'day');

        const window = moistureCollection
            .filterDate(before, after);

        const smoothed = window.mean();

        return smoothed
            .copyProperties(img, img.propertyNames());
    });
}

/**
 * Calculate moisture anomaly relative to long-term mean
 * Useful for drought/flood detection
 */
export function calculateMoistureAnomaly(
    currentMoisture: any,
    historicalCollection: any,
    geometry: any
): any {
    // Calculate long-term mean
    const longTermMean = historicalCollection
        .mean()
        .clip(geometry)
        .rename('LongTerm_Mean');

    // Calculate long-term standard deviation
    const longTermStdDev = historicalCollection
        .reduce(ee.Reducer.stdDev())
        .clip(geometry)
        .rename('LongTerm_StdDev');

    // Calculate standardized anomaly (Z-score)
    const anomaly = currentMoisture
        .subtract(longTermMean)
        .divide(longTermStdDev)
        .rename('Moisture_Anomaly');

    // Classify anomaly
    const anomalyClass = ee.Image(0)
        .where(anomaly.lt(-1.5), -2) // Severe drought
        .where(anomaly.gte(-1.5).and(anomaly.lt(-1.0)), -1) // Moderate drought
        .where(anomaly.gte(-1.0).and(anomaly.lt(1.0)), 0) // Normal
        .where(anomaly.gte(1.0).and(anomaly.lt(1.5)), 1) // Moderate wet
        .where(anomaly.gte(1.5), 2) // Severe wet
        .rename('Anomaly_Class');

    return {
        anomaly: anomaly,
        anomalyClass: anomalyClass,
        longTermMean: longTermMean,
        longTermStdDev: longTermStdDev,
    };
}

/**
 * Validate fusion by comparing with in-situ measurements (if available)
 * Returns validation metrics
 */
export async function validateFusion(
    fusedMoisture: any,
    inSituPoints: any[], // Array of {lat, lon, moistureValue}
    geometry: any
): Promise<any> {
    if (!inSituPoints || inSituPoints.length === 0) {
        return null;
    }

    // Sample fused moisture at in-situ locations
    const fc = ee.FeatureCollection(
        inSituPoints.map((point) =>
            ee.Feature(
                ee.Geometry.Point([point.lon, point.lat]),
                { observed: point.moistureValue }
            )
        )
    );

    const sampled = fusedMoisture.sampleRegions({
        collection: fc,
        scale: 30,
        geometries: true,
    });

    // Calculate validation statistics
    const predicted = sampled.aggregate_array('Fused_Moisture');
    const observed = sampled.aggregate_array('observed');

    // RMSE, R², bias would be calculated here
    // For now, return sample points
    return {
        sampleCount: await evaluate(sampled.size()),
        samples: await evaluate(sampled),
    };
}
