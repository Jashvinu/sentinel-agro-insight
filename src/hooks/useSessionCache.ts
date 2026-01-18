import { useState, useEffect, useCallback } from 'react';
import {
  prefetchFarmData,
  getCachedIndex,
  getCachedDates,
  getCacheStatus,
  clearCache,
  isCacheValid,
} from '@/services/sessionCacheService';

interface UseSessionCacheOptions {
  farmId: string | null;
  geometry: any | null;
  autoFetch?: boolean;
}

interface UseSessionCacheResult {
  isLoading: boolean;
  progress: number;
  message: string;
  getCachedIndex: (index: string) => any | null;
  getCachedDates: () => string[] | null;
  refreshCache: () => Promise<void>;
  cacheStatus: ReturnType<typeof getCacheStatus>;
}

/**
 * Hook to manage session-based satellite data cache
 * Automatically prefetches data when a farm is loaded
 */
export function useSessionCache({
  farmId,
  geometry,
  autoFetch = true,
}: UseSessionCacheOptions): UseSessionCacheResult {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [cacheStatus, setCacheStatus] = useState(getCacheStatus());

  // Prefetch data when farm changes
  useEffect(() => {
    if (!farmId || !geometry || !autoFetch) {
      return;
    }

    // Check if we already have valid cache
    if (isCacheValid(farmId)) {
      console.log('[useSessionCache] Cache is valid, skipping prefetch');
      setCacheStatus(getCacheStatus());
      return;
    }

    const prefetch = async () => {
      setIsLoading(true);
      setProgress(0);
      setMessage('Starting data prefetch...');

      try {
        await prefetchFarmData(farmId, geometry, (prog, msg) => {
          setProgress(prog);
          setMessage(msg);
        });
      } catch (error) {
        console.error('[useSessionCache] Prefetch error:', error);
        setMessage('Error loading data');
      } finally {
        setIsLoading(false);
        setCacheStatus(getCacheStatus());
      }
    };

    prefetch();
  }, [farmId, geometry, autoFetch]);

  // Refresh cache manually
  const refreshCache = useCallback(async () => {
    if (!farmId || !geometry) {
      return;
    }

    // Clear existing cache
    clearCache();

    setIsLoading(true);
    setProgress(0);
    setMessage('Refreshing data...');

    try {
      await prefetchFarmData(farmId, geometry, (prog, msg) => {
        setProgress(prog);
        setMessage(msg);
      });
    } catch (error) {
      console.error('[useSessionCache] Refresh error:', error);
      setMessage('Error refreshing data');
    } finally {
      setIsLoading(false);
      setCacheStatus(getCacheStatus());
    }
  }, [farmId, geometry]);

  return {
    isLoading,
    progress,
    message,
    getCachedIndex,
    getCachedDates,
    refreshCache,
    cacheStatus,
  };
}
