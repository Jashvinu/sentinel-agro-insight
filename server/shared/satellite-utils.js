/**
 * Satellite Utilities for Node.js
 * Earth Engine geometry conversion and evaluation helpers
 */

import ee from '@google/earthengine';

/**
 * Convert GeoJSON geometry to Earth Engine geometry
 */
export function geoJsonToEarthEngine(geometry) {
    if (geometry.type === 'Polygon') {
        const coords = geometry.coordinates;
        return ee.Geometry.Polygon(coords);
    } else if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates;
        return ee.Geometry.MultiPolygon(coords);
    } else {
        throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }
}

/**
 * Evaluate Earth Engine object using callback-based approach
 */
export function evaluate(obj) {
    return new Promise((resolve, reject) =>
        obj.evaluate((result, error) =>
            error ? reject(new Error(error)) : resolve(result)
        )
    );
}
