/**
 * Hook to fetch and manage water distribution metrics
 */

import { useState, useEffect } from 'react';
import { getWaterDistributionMetrics, type WaterDistributionMetrics } from '@/services/waterMetricsService';

export function useWaterMetrics(farmId?: string, days: number = 14) {
  const [metrics, setMetrics] = useState<WaterDistributionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      // Don't fetch if no farm ID yet
      if (!farmId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log(`[useWaterMetrics] Fetching metrics for farm: ${farmId}, days: ${days}`);
        const data = await getWaterDistributionMetrics(farmId, days);
        if (!cancelled) {
          console.log(`[useWaterMetrics] Received metrics:`, data);
          setMetrics(data);
        }
      } catch (err) {
        console.error('[useWaterMetrics] Error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch water metrics'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [farmId, days]);

  return { metrics, loading, error };
}

