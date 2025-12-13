/**
 * Cache service for dashboard data
 * Caches farm timeline, KPIs, and other dashboard-related data
 */

const CACHE_PREFIX = 'dashboard_cache_';
const DEFAULT_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_AGE = 2 * 60 * 60 * 1000; // 2 hours max cache age

interface CachedDashboardData {
  data: any;
  timestamp: number;
  farmId: string;
  cacheType: 'timeline' | 'kpis' | 'indices' | 'observations';
}

/**
 * Get cache key for a farm and cache type
 */
function getCacheKey(farmId: string, cacheType: string): string {
  return `${CACHE_PREFIX}${farmId}_${cacheType}`;
}

/**
 * Get cached dashboard data
 */
export function getCachedDashboardData(farmId: string, cacheType: CachedDashboardData['cacheType']): any | null {
  if (typeof window === 'undefined') return null;

  try {
    const cacheKey = getCacheKey(farmId, cacheType);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;

    const parsed: CachedDashboardData = JSON.parse(cached);
    const now = Date.now();
    const age = now - parsed.timestamp;

    // Check if cache is still valid
    if (age > DEFAULT_CACHE_DURATION) {
      // Cache expired, but if it's not too old, we can return it and refresh in background
      if (age > MAX_CACHE_AGE) {
        // Too old, remove it
        localStorage.removeItem(cacheKey);
        return null;
      }
      // Return stale data but mark as stale
      return { ...parsed.data, _stale: true };
    }

    return parsed.data;
  } catch (error) {
    console.warn('Error reading dashboard cache:', error);
    return null;
  }
}

/**
 * Cache dashboard data
 */
export function setCachedDashboardData(
  farmId: string, 
  cacheType: CachedDashboardData['cacheType'], 
  data: any
): void {
  if (typeof window === 'undefined') return;

  try {
    const cacheKey = getCacheKey(farmId, cacheType);
    const cached: CachedDashboardData = {
      data,
      timestamp: Date.now(),
      farmId,
      cacheType,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    console.warn('Error writing dashboard cache:', error);
    // If storage is full, try to clean up old entries
    try {
      clearOldCacheEntries();
      // Retry once
      localStorage.setItem(getCacheKey(farmId, cacheType), JSON.stringify({
        data,
        timestamp: Date.now(),
        farmId,
        cacheType,
      }));
    } catch (retryError) {
      console.error('Failed to cache dashboard data after cleanup:', retryError);
    }
  }
}

/**
 * Clear cached dashboard data for a specific farm and cache type
 */
export function clearCachedDashboardData(
  farmId: string, 
  cacheType?: CachedDashboardData['cacheType']
): void {
  if (typeof window === 'undefined') return;
  
  try {
    if (cacheType) {
      const cacheKey = getCacheKey(farmId, cacheType);
      localStorage.removeItem(cacheKey);
    } else {
      // Clear all cache types for this farm
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(`${CACHE_PREFIX}${farmId}_`)) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn('Error clearing dashboard cache:', error);
  }
}

/**
 * Clear all dashboard caches
 */
export function clearAllDashboardCaches(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Error clearing all dashboard caches:', error);
  }
}

/**
 * Clean up old cache entries (older than MAX_CACHE_AGE)
 */
function clearOldCacheEntries(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const parsed: CachedDashboardData = JSON.parse(cached);
            const age = now - parsed.timestamp;
            
            if (age > MAX_CACHE_AGE) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // Invalid entry, remove it
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.warn('Error cleaning up old cache entries:', error);
  }
}

/**
 * Check if cached data exists and is still valid
 */
export function hasValidDashboardCache(
  farmId: string, 
  cacheType: CachedDashboardData['cacheType']
): boolean {
  const cached = getCachedDashboardData(farmId, cacheType);
  return cached !== null && !cached._stale;
}


