import { useState, useEffect } from 'react';
import { getAbeFarmId } from '@/services/farmService';

/**
 * Hook to get Abe's farm ID
 * Caches the result in memory to avoid repeated database queries
 */
let cachedAbeFarmId: string | null = null;
let abeFarmIdPromise: Promise<string | null> | null = null;

export function useAbeFarm(): { farmId: string | null; loading: boolean } {
  const [farmId, setFarmId] = useState<string | null>(cachedAbeFarmId);
  const [loading, setLoading] = useState(!cachedAbeFarmId);

  useEffect(() => {
    // If we already have a cached ID, use it immediately
    if (cachedAbeFarmId) {
      setFarmId(cachedAbeFarmId);
      setLoading(false);
      return;
    }

    // If there's already a pending request, wait for it
    if (abeFarmIdPromise) {
      abeFarmIdPromise.then(id => {
        setFarmId(id);
        setLoading(false);
      });
      return;
    }

    // Start a new request
    setLoading(true);
    abeFarmIdPromise = getAbeFarmId();
    
    abeFarmIdPromise.then(id => {
      cachedAbeFarmId = id;
      setFarmId(id);
      setLoading(false);
      abeFarmIdPromise = null;
    }).catch(() => {
      setLoading(false);
      abeFarmIdPromise = null;
    });
  }, []);

  return { farmId, loading };
}

/**
 * Get Abe's farm ID synchronously (returns cached value or null)
 */
export function getAbeFarmIdSync(): string | null {
  return cachedAbeFarmId;
}


