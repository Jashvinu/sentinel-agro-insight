import { supabase, type Farm, type FarmInsert, type Geometry } from './supabase';
import { bbox, area, circle } from '@turf/turf';

// Local storage key for farms
const FARMS_STORAGE_KEY = 'sentinel_farms';
const TEMP_FARMS_KEY = 'sentinel_temp_farms';
const OFFLINE_TRACE_QUEUE_KEY = 'offline_trace_queue';

interface OfflineQueueEntry {
  id: string;
  type: 'farm_upsert' | 'trace_event' | 'trace_lot';
  payload: Record<string, unknown>;
  createdAt: string;
  lastError?: string;
}

/**
 * Get all farms from localStorage
 */
function getFarmsFromStorage(): Farm[] {
  try {
    const data = localStorage.getItem(FARMS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading farms from localStorage:', error);
    return [];
  }
}

/**
 * Save farms to localStorage
 */
function saveFarmsToStorage(farms: Farm[]): void {
  try {
    localStorage.setItem(FARMS_STORAGE_KEY, JSON.stringify(farms));
  } catch (error) {
    console.error('Error saving farms to localStorage:', error);
  }
}

function isUuid(value?: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function normalizeFarm(row: Record<string, any>): Farm {
  const geometry = typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry;

  return {
    id: String(row.id),
    name: String(row.name),
    geometry,
    bounds: row.bounds ?? null,
    area_hectares: row.area_hectares !== null && row.area_hectares !== undefined
      ? Number(row.area_hectares)
      : null,
    user_id: row.user_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function enqueueOffline(entry: Omit<OfflineQueueEntry, 'id' | 'createdAt'>): void {
  try {
    const existing = localStorage.getItem(OFFLINE_TRACE_QUEUE_KEY);
    const queue: OfflineQueueEntry[] = existing ? JSON.parse(existing) : [];
    queue.push({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(OFFLINE_TRACE_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[FarmService] Could not persist offline queue entry:', error);
  }
}

function mergeFarmIntoStorage(farm: Farm): void {
  const farms = getFarmsFromStorage();
  const index = farms.findIndex((existing) => existing.id === farm.id);
  if (index >= 0) {
    farms[index] = farm;
  } else {
    farms.unshift(farm);
  }
  saveFarmsToStorage(farms);
}

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
 * Save a farm polygon to Supabase.
 */
export async function saveFarm(farmData: FarmInsert): Promise<Farm | null> {
  try {
    // Calculate bounds if not provided
    const bounds = farmData.bounds || calculateBounds(farmData.geometry);

    // Calculate area if not provided
    const area_hectares = farmData.area_hectares || calculateArea(farmData.geometry);

    const { data, error } = await supabase.rpc('upsert_farm_geojson', {
      p_name: farmData.name,
      p_geometry: farmData.geometry,
      p_bounds: bounds,
      p_area_hectares: area_hectares,
      p_user_id: isUuid(farmData.user_id) ? farmData.user_id : null,
    });

    if (error) {
      throw new Error(`Supabase farm save failed: ${error.message}`);
    }

    if (!Array.isArray(data) || !data[0]) {
      throw new Error('Supabase farm save returned no farm row.');
    }

    const farm = normalizeFarm(data[0]);
    mergeFarmIntoStorage(farm);
    console.log('[FarmService] Farm saved to Supabase:', farm.id);
    return farm;
  } catch (error) {
    console.error('Failed to save farm:', error);
    throw error;
  }
}

/**
 * Get all farms from Supabase.
 */
export async function getAllFarms(): Promise<Farm[]> {
  try {
    const { data, error } = await supabase.rpc('list_farms_geojson');
    if (error) {
      throw new Error(`Supabase farm lookup failed: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      throw new Error('Supabase farm lookup returned an invalid payload.');
    }

    const remoteFarms = data.map(normalizeFarm);
    if (remoteFarms.length > 0) {
      saveFarmsToStorage(remoteFarms);
    }
    console.log('[FarmService] Retrieved', remoteFarms.length, 'farms from Supabase');
    return remoteFarms;
  } catch (error) {
    console.error('Failed to fetch farms:', error);
    throw error;
  }
}

/**
 * Get a farm by ID
 */
export async function getFarmById(id: string): Promise<Farm | null> {
  try {
    if (!isUuid(id)) {
      throw new Error(`Farm id must be a Supabase UUID, received: ${id}`);
    }

    const { data, error } = await supabase.rpc('get_farm_geojson', { p_id: id });
    if (error) {
      throw new Error(`Supabase farm-by-id lookup failed: ${error.message}`);
    }
    if (Array.isArray(data) && data[0]) {
      const farm = normalizeFarm(data[0]);
      mergeFarmIntoStorage(farm);
      return farm;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch farm:', error);
    throw error;
  }
}

/**
 * Get the first/default farm (for local development)
 */
export async function getDefaultFarm(): Promise<Farm | null> {
  try {
    const farms = getFarmsFromStorage();
    return farms.length > 0 ? farms[0] : null;
  } catch (error) {
    console.error('Failed to fetch default farm:', error);
    return null;
  }
}

/**
 * Update a farm's name
 */
export async function updateFarmName(id: string, name: string): Promise<Farm | null> {
  try {
    const farms = getFarmsFromStorage();
    const index = farms.findIndex(f => f.id === id);

    if (index === -1) {
      console.error('Farm not found:', id);
      return null;
    }

    farms[index] = {
      ...farms[index],
      name,
      updated_at: new Date().toISOString(),
    };

    saveFarmsToStorage(farms);
    return farms[index];
  } catch (error) {
    console.error('Failed to update farm:', error);
    return null;
  }
}

/**
 * Update a scalar field on a farm (e.g. sowing_date, crop_type).
 * Persists to localStorage; Supabase sync happens on next full upsert.
 */
export async function updateFarmField(
  id: string,
  fields: Partial<{ sowing_date: string; crop_type: string }>
): Promise<Farm | null> {
  try {
    const farms = getFarmsFromStorage();
    const index = farms.findIndex(f => f.id === id);
    if (index === -1) return null;
    farms[index] = { ...farms[index], ...fields, updated_at: new Date().toISOString() };
    saveFarmsToStorage(farms);
    return farms[index];
  } catch (error) {
    console.error('Failed to update farm field:', error);
    return null;
  }
}

/**
 * Get temp-only (local) farms from localStorage
 */
export function getTempFarms(): Farm[] {
  try {
    const data = localStorage.getItem(TEMP_FARMS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveTempFarmsToStorage(farms: Farm[]): void {
  try {
    localStorage.setItem(TEMP_FARMS_KEY, JSON.stringify(farms));
  } catch (error) {
    console.error('Error saving temp farms:', error);
  }
}

function removeTempFarm(id: string): void {
  const farms = getTempFarms().filter(f => f.id !== id);
  saveTempFarmsToStorage(farms);
}

/**
 * Save a farm to local storage only (no Supabase sync).
 */
export function saveTempFarm(farmData: FarmInsert): Farm {
  const bounds = farmData.bounds ?? calculateBounds(farmData.geometry);
  const area_hectares = farmData.area_hectares ?? calculateArea(farmData.geometry);

  const tempFarm: Farm = {
    id: `temp_${Date.now()}`,
    name: farmData.name,
    geometry: farmData.geometry,
    bounds,
    area_hectares,
    user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existing = getTempFarms();
  existing.unshift(tempFarm);
  saveTempFarmsToStorage(existing);
  console.log('[FarmService] Temp farm saved locally:', tempFarm.id);
  return tempFarm;
}

/**
 * Delete a farm — removes from Supabase (if not temp) and localStorage.
 */
export async function deleteFarm(id: string): Promise<boolean> {
  try {
    if (id.startsWith('temp_')) {
      removeTempFarm(id);
      return true;
    }

    const { error } = await supabase.from('farms').delete().eq('id', id);
    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }

    const farms = getFarmsFromStorage().filter(f => f.id !== id);
    saveFarmsToStorage(farms);
    console.log('[FarmService] Farm deleted:', id);
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
  const bounds = calculateBounds(circleFeature.geometry);
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
