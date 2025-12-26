import { supabase, type Farm, type FarmInsert, type Geometry } from './supabase';
import { bbox, area, circle } from '@turf/turf';

/**
 * Calculate area in hectares from GeoJSON polygon or multipolygon using Turf.js
 */
function calculateArea(geojson: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }): number {
  try {
    // Use Turf.js area function which calculates area in square meters
    // Convert to hectares (1 hectare = 10,000 m²)
    const areaSquareMeters = area(geojson);
    return areaSquareMeters / 10000;
  } catch (error) {
    console.warn('Error calculating area with Turf.js, using approximation:', error);
    // Fallback to bounding box approximation
    const [minX, minY, maxX, maxY] = bbox(geojson) as [number, number, number, number];
    const lat = (minY + maxY) / 2;
    const latMeters = (maxY - minY) * 111000;
    const lngMeters = (maxX - minX) * 111000 * Math.cos((lat * Math.PI) / 180);
    const areaMeters = latMeters * lngMeters;
    return areaMeters / 10000;
  }
}

/**
 * Calculate bounds from GeoJSON polygon or multipolygon coordinates
 */
function calculateBounds(geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} {
  let allCoords: number[][] = [];
  
  if (geometry.type === 'Polygon') {
    allCoords = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === 'MultiPolygon') {
    // Flatten all coordinates from all polygons
    const multipolyCoords = geometry.coordinates as number[][][][];
    allCoords = multipolyCoords.flatMap(polygon => polygon[0]);
  }
  
  const lngs = allCoords.map(c => c[0]);
  const lats = allCoords.map(c => c[1]);
  
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  };
}

/**
 * Save a farm polygon to the database
 */
export async function saveFarm(farmData: FarmInsert): Promise<Farm | null> {
  try {
    // Calculate bounds if not provided
    const bounds = farmData.bounds || calculateBounds(farmData.geometry);
    
    // Calculate area if not provided
    const area_hectares = farmData.area_hectares || calculateArea(farmData.geometry);
    
    const { data, error } = await supabase
      .from('farms')
      .insert({
        name: farmData.name,
        geometry: farmData.geometry,
        bounds,
        area_hectares,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error saving farm:', error);
      throw error;
    }
    
    return data as Farm;
  } catch (error) {
    console.error('Failed to save farm:', error);
    return null;
  }
}

/**
 * Get all farms from the database
 */
export async function getAllFarms(): Promise<Farm[]> {
  try {
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching farms:', error);
      throw error;
    }
    
    return (data || []) as Farm[];
  } catch (error) {
    console.error('Failed to fetch farms:', error);
    return [];
  }
}

/**
 * Get a farm by ID
 */
export async function getFarmById(id: string): Promise<Farm | null> {
  try {
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching farm:', error);
      return null;
    }
    
    return data as Farm;
  } catch (error) {
    console.error('Failed to fetch farm:', error);
    return null;
  }
}

/**
 * Update a farm's name
 */
export async function updateFarmName(id: string, name: string): Promise<Farm | null> {
  try {
    const { data, error } = await supabase
      .from('farms')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating farm:', error);
      throw error;
    }
    
    return data as Farm;
  } catch (error) {
    console.error('Failed to update farm:', error);
    return null;
  }
}

/**
 * Delete a farm
 */
export async function deleteFarm(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('farms')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting farm:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to delete farm:', error);
    return false;
  }
}

/**
 * Convert multiple polygons to MultiPolygon FarmInsert format
 */
export function polygonsToFarmInsert(
  polygons: Array<{ type: 'Polygon'; coordinates: number[][][] }>,
  name: string
): FarmInsert {
  if (polygons.length === 0) {
    throw new Error('At least one polygon is required');
  }
  
  // If only one polygon, return as Polygon
  if (polygons.length === 1) {
    const geometry = polygons[0];
    return {
      name,
      geometry,
      bounds: calculateBounds(geometry),
      area_hectares: calculateArea(geometry),
    };
  }
  
  // If multiple polygons, convert to MultiPolygon
  const multipolygon: { type: 'MultiPolygon'; coordinates: number[][][][] } = {
    type: 'MultiPolygon',
    coordinates: polygons.map(p => p.coordinates),
  };
  
  return {
    name,
    geometry: multipolygon,
    bounds: calculateBounds(multipolygon),
    area_hectares: calculateArea(multipolygon),
  };
}

/**
 * Convert GeoJSON Feature to FarmInsert format (single polygon)
 */
export function geojsonToFarmInsert(
  geojson: { type: 'Feature'; geometry: { type: 'Polygon'; coordinates: number[][][] } },
  name: string
): FarmInsert {
  return polygonsToFarmInsert([geojson.geometry], name);
}

/**
 * Create a circular polygon from center coordinates and radius
 * @param center - [longitude, latitude] coordinates
 * @param radiusInMeters - Radius in meters
 * @param steps - Number of steps to create the circle (default: 64)
 * @returns FarmInsert object ready to be saved
 */
export function createCircularFarm(
  center: [number, number],
  radiusInMeters: number,
  name: string,
  steps: number = 64
): FarmInsert {
  // Create a circle using Turf.js
  // Turf circle expects [lng, lat] and radius in kilometers
  const radiusInKm = radiusInMeters / 1000;
  const circleFeature = circle(center, radiusInKm, { steps, units: 'kilometers' });
  
  // Extract coordinates from the circle
  const coordinates = circleFeature.geometry.coordinates;
  const bounds = calculateBounds(coordinates);
  const area_hectares = calculateArea(circleFeature.geometry);
  
  return {
    name,
    geometry: {
      type: 'Polygon',
      coordinates,
    },
    bounds,
    area_hectares,
  };
}

