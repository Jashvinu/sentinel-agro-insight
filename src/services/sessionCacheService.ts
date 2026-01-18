/**
 * Session Cache Service
 * Caches satellite data in sessionStorage for fast retrieval during the session.
 * Data is fetched once when the app loads and persists until the browser tab is closed.
 */

import { buildApiUrl } from './api';
import { API_ENDPOINTS } from '@/constants';

// Session storage keys
const CACHE_KEYS = {
  SATELLITE_INDICES: 'session_satellite_indices',
  OBSERVATION_DATES: 'session_observation_dates',
  LAST_FETCH_TIME: 'session_last_fetch_time',
  CURRENT_FARM_ID: 'session_current_farm_id',
};

// Types
interface CachedIndexData {
  index: string;
  data: any;
  timestamp: number;
}

interface CachedDatesData {
  dates: string[];
  timestamp: number;
}

interface SessionCache {
  indices: Record<string, CachedIndexData>;
  dates: CachedDatesData | null;
  farmId: string | null;
}

// Default indices to prefetch
const PREFETCH_INDICES = ['ndvi', 'evi', 'moisture', 'nitrogen', 'phosphorus', 'potassium'];

/**
 * Get the session cache
 */
function getCache(): SessionCache {
  try {
    const indices = sessionStorage.getItem(CACHE_KEYS.SATELLITE_INDICES);
    const dates = sessionStorage.getItem(CACHE_KEYS.OBSERVATION_DATES);
    const farmId = sessionStorage.getItem(CACHE_KEYS.CURRENT_FARM_ID);

    return {
      indices: indices ? JSON.parse(indices) : {},
      dates: dates ? JSON.parse(dates) : null,
      farmId: farmId || null,
    };
  } catch (error) {
    console.error('[SessionCache] Error reading cache:', error);
    return { indices: {}, dates: null, farmId: null };
  }
}

/**
 * Save index data to session cache
 */
function cacheIndexData(index: string, data: any): void {
  try {
    const cache = getCache();
    cache.indices[index] = {
      index,
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEYS.SATELLITE_INDICES, JSON.stringify(cache.indices));
    console.log(`[SessionCache] Cached ${index} data`);
  } catch (error) {
    console.error('[SessionCache] Error caching index data:', error);
  }
}

/**
 * Get cached index data
 */
export function getCachedIndex(index: string): any | null {
  const cache = getCache();
  return cache.indices[index]?.data || null;
}

/**
 * Cache observation dates
 */
function cacheDates(dates: string[]): void {
  try {
    const data: CachedDatesData = {
      dates,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEYS.OBSERVATION_DATES, JSON.stringify(data));
    console.log(`[SessionCache] Cached ${dates.length} observation dates`);
  } catch (error) {
    console.error('[SessionCache] Error caching dates:', error);
  }
}

/**
 * Get cached observation dates
 */
export function getCachedDates(): string[] | null {
  const cache = getCache();
  return cache.dates?.dates || null;
}

/**
 * Set current farm ID in cache
 */
export function setCurrentFarmId(farmId: string): void {
  const currentFarmId = sessionStorage.getItem(CACHE_KEYS.CURRENT_FARM_ID);
  if (currentFarmId !== farmId) {
    // Farm changed, clear the cache
    clearCache();
    sessionStorage.setItem(CACHE_KEYS.CURRENT_FARM_ID, farmId);
    console.log(`[SessionCache] Farm changed to ${farmId}, cache cleared`);
  }
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
  sessionStorage.removeItem(CACHE_KEYS.SATELLITE_INDICES);
  sessionStorage.removeItem(CACHE_KEYS.OBSERVATION_DATES);
  sessionStorage.removeItem(CACHE_KEYS.LAST_FETCH_TIME);
  console.log('[SessionCache] Cache cleared');
}

/**
 * Check if cache is valid for a farm
 */
export function isCacheValid(farmId: string): boolean {
  const cache = getCache();
  return cache.farmId === farmId && Object.keys(cache.indices).length > 0;
}

/**
 * Fetch a single index from the API
 */
async function fetchIndex(
  index: string,
  polygon: string,
  startDate: string,
  endDate: string
): Promise<any> {
  const url = buildApiUrl(
    `${API_ENDPOINTS.agriculturalIndices}?index=${index}&polygon=${encodeURIComponent(polygon)}&start=${startDate}&end=${endDate}`
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${index}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch observation dates from the API
 */
async function fetchObservationDates(polygon: string): Promise<string[]> {
  const url = buildApiUrl(
    `${API_ENDPOINTS.observationDates}?polygon=${encodeURIComponent(polygon)}`
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch observation dates: ${response.statusText}`);
  }
  const data = await response.json();
  return data.dates || [];
}

/**
 * Prefetch all satellite data for a farm
 * This should be called when the app loads or when a farm is selected
 */
export async function prefetchFarmData(
  farmId: string,
  geometry: any,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  // Check if we already have cached data for this farm
  if (isCacheValid(farmId)) {
    console.log('[SessionCache] Using cached data for farm:', farmId);
    onProgress?.(100, 'Using cached data');
    return;
  }

  console.log('[SessionCache] Prefetching data for farm:', farmId);
  setCurrentFarmId(farmId);

  const polygon = JSON.stringify(geometry);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const totalSteps = PREFETCH_INDICES.length + 1; // +1 for dates
  let completedSteps = 0;

  // Fetch observation dates first
  try {
    onProgress?.(0, 'Fetching observation dates...');
    const dates = await fetchObservationDates(polygon);
    cacheDates(dates);
    completedSteps++;
    onProgress?.((completedSteps / totalSteps) * 100, 'Observation dates loaded');
  } catch (error) {
    console.error('[SessionCache] Error fetching observation dates:', error);
  }

  // Fetch indices in parallel (but with some throttling)
  const batchSize = 3; // Fetch 3 indices at a time
  for (let i = 0; i < PREFETCH_INDICES.length; i += batchSize) {
    const batch = PREFETCH_INDICES.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (index) => {
        try {
          const data = await fetchIndex(index, polygon, startDate, endDate);
          cacheIndexData(index, data);
          return { index, success: true };
        } catch (error) {
          console.error(`[SessionCache] Error fetching ${index}:`, error);
          return { index, success: false };
        }
      })
    );

    completedSteps += batch.length;
    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    onProgress?.(
      (completedSteps / totalSteps) * 100,
      `Loaded ${completedSteps - 1}/${PREFETCH_INDICES.length} indices`
    );
  }

  sessionStorage.setItem(CACHE_KEYS.LAST_FETCH_TIME, Date.now().toString());
  console.log('[SessionCache] Prefetch complete');
  onProgress?.(100, 'Data loading complete');
}

/**
 * Get or fetch index data
 * Returns cached data if available, otherwise fetches from API
 */
export async function getOrFetchIndex(
  index: string,
  polygon: string,
  startDate: string,
  endDate: string
): Promise<any> {
  // Check cache first
  const cached = getCachedIndex(index);
  if (cached) {
    console.log(`[SessionCache] Returning cached ${index} data`);
    return cached;
  }

  // Fetch from API
  console.log(`[SessionCache] Fetching ${index} from API`);
  const data = await fetchIndex(index, polygon, startDate, endDate);
  cacheIndexData(index, data);
  return data;
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): {
  farmId: string | null;
  cachedIndices: string[];
  hasDates: boolean;
  lastFetchTime: number | null;
} {
  const cache = getCache();
  const lastFetchTime = sessionStorage.getItem(CACHE_KEYS.LAST_FETCH_TIME);

  return {
    farmId: cache.farmId,
    cachedIndices: Object.keys(cache.indices),
    hasDates: cache.dates !== null,
    lastFetchTime: lastFetchTime ? parseInt(lastFetchTime) : null,
  };
}
