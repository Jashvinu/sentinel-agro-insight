/**
 * Service to manage water metrics cache
 * Maintains 14 days of cached water distribution data per farm
 */

import { supabase } from './supabase';
import { buildApiUrl, getSupabaseFunctionHeaders } from './api';
import { API_ENDPOINTS } from '@/constants';

export interface CachedWaterMetric {
  id: string;
  farm_id: string;
  observation_date: string;
  index_type: 'ndwi' | 'moisture' | 'sar_moisture';
  mean_value: number;
  std_dev: number;
  min_value?: number | null;
  max_value?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Clean up data older than 14 days
 */
export async function cleanupOldWaterMetrics(farmId: string): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const { error } = await supabase
      .from('water_metrics_cache')
      .delete()
      .eq('farm_id', farmId)
      .lt('observation_date', cutoffDateStr);

    if (error) {
      console.error('Error cleaning up old water metrics:', error);
    } else {
      console.log(`Cleaned up water metrics older than ${cutoffDateStr} for farm ${farmId}`);
    }
  } catch (error) {
    console.error('Error in cleanupOldWaterMetrics:', error);
  }
}

/**
 * Fetch water index data from API for a specific date
 */
async function fetchWaterIndexFromAPI(
  farm: any,
  indexType: 'ndwi' | 'moisture' | 'sar_moisture',
  date: string
): Promise<{ mean_value: number; std_dev: number; min_value?: number; max_value?: number } | null> {
  try {
    if (!farm.geometry) {
      console.error('Farm geometry is missing');
      return null;
    }

    const polygon = JSON.stringify(farm.geometry);
    const apiUrl = `${API_ENDPOINTS.agriculturalIndices}?index=${indexType}&polygon=${encodeURIComponent(polygon)}&start=${date}&end=${date}`;
    
    const headers = getSupabaseFunctionHeaders();
    const response = await fetch(buildApiUrl(apiUrl), {
      headers: Object.keys(headers).length > 0 ? headers : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Failed to fetch ${indexType} for ${date}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.mean_value !== null && data.mean_value !== undefined) {
      return {
        mean_value: data.mean_value,
        std_dev: data.std_dev || 0,
        min_value: data.min_value,
        max_value: data.max_value,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching ${indexType} for ${date}:`, error);
    return null;
  }
}

/**
 * Get cached water metrics for a farm (last 14 days)
 */
export async function getCachedWaterMetrics(farmId: string): Promise<CachedWaterMetric[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('water_metrics_cache')
      .select('*')
      .eq('farm_id', farmId)
      .gte('observation_date', cutoffDateStr)
      .order('observation_date', { ascending: false });

    if (error) {
      console.error('Error fetching cached water metrics:', error);
      return [];
    }

    return (data || []) as CachedWaterMetric[];
  } catch (error) {
    console.error('Error in getCachedWaterMetrics:', error);
    return [];
  }
}

/**
 * Check which dates are missing from cache (last 14 days)
 */
export async function getMissingDates(farmId: string): Promise<string[]> {
  try {
    const cached = await getCachedWaterMetrics(farmId);
    const cachedDates = new Set(cached.map(c => c.observation_date));

    const dates: string[] = [];
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Check if we have all 3 index types for this date
      const hasNdwi = cached.some(c => c.observation_date === dateStr && c.index_type === 'ndwi');
      const hasMoisture = cached.some(c => c.observation_date === dateStr && c.index_type === 'moisture');
      const hasSarMoisture = cached.some(c => c.observation_date === dateStr && c.index_type === 'sar_moisture');

      // If any index type is missing, we need to fetch this date
      if (!hasNdwi || !hasMoisture || !hasSarMoisture) {
        dates.push(dateStr);
      }
    }

    return dates;
  } catch (error) {
    console.error('Error in getMissingDates:', error);
    return [];
  }
}

/**
 * Sync water metrics cache for a farm
 * Fetches missing data and updates cache
 */
export async function syncWaterMetricsCache(farm: any): Promise<{ fetched: number; errors: number }> {
  try {
    if (!farm || !farm.id || !farm.geometry) {
      console.error('Invalid farm data for cache sync');
      return { fetched: 0, errors: 0 };
    }

    console.log(`Syncing water metrics cache for farm: ${farm.name || farm.id}`);

    // Step 1: Clean up old data (older than 14 days)
    await cleanupOldWaterMetrics(farm.id);

    // Step 2: Check which dates are missing
    const missingDates = await getMissingDates(farm.id);
    
    if (missingDates.length === 0) {
      console.log('All 14 days of data are cached');
      return { fetched: 0, errors: 0 };
    }

    console.log(`Fetching ${missingDates.length} missing dates:`, missingDates);

    // Step 3: Fetch missing data
    const waterIndices: Array<'ndwi' | 'moisture' | 'sar_moisture'> = ['ndwi', 'moisture', 'sar_moisture'];
    let fetched = 0;
    let errors = 0;

    // Fetch in batches to avoid overwhelming the API
    for (const date of missingDates) {
      for (const indexType of waterIndices) {
        try {
          // Check if this specific index+date combo is already cached
          const { data: existing } = await supabase
            .from('water_metrics_cache')
            .select('id')
            .eq('farm_id', farm.id)
            .eq('observation_date', date)
            .eq('index_type', indexType)
            .single();

          if (existing) {
            continue; // Already cached
          }

          // Fetch from API
          const apiData = await fetchWaterIndexFromAPI(farm, indexType, date);
          
          if (apiData) {
            // Insert into cache
            const { error: insertError } = await supabase
              .from('water_metrics_cache')
              .insert({
                farm_id: farm.id,
                observation_date: date,
                index_type: indexType,
                mean_value: apiData.mean_value,
                std_dev: apiData.std_dev || 0,
                min_value: apiData.min_value,
                max_value: apiData.max_value,
              });

            if (insertError) {
              console.error(`Error caching ${indexType} for ${date}:`, insertError);
              errors++;
            } else {
              fetched++;
            }
          } else {
            errors++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching ${indexType} for ${date}:`, error);
          errors++;
        }
      }
    }

    console.log(`Cache sync complete: ${fetched} records fetched, ${errors} errors`);
    return { fetched, errors };
  } catch (error) {
    console.error('Error in syncWaterMetricsCache:', error);
    return { fetched: 0, errors: 1 };
  }
}

/**
 * Sync water metrics for all user farms
 * Called on login/app load
 */
export async function syncAllFarmsWaterMetrics(): Promise<void> {
  try {
    const { getAllFarms } = await import('./farmService');
    const farms = await getAllFarms();

    if (farms.length === 0) {
      console.log('No farms found for water metrics sync');
      return;
    }

    console.log(`Syncing water metrics for ${farms.length} farm(s)...`);

    // Sync all farms in parallel (but with rate limiting)
    const syncPromises = farms.map(farm => syncWaterMetricsCache(farm));
    const results = await Promise.all(syncPromises);

    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    console.log(`Water metrics sync complete: ${totalFetched} records fetched, ${totalErrors} errors`);
  } catch (error) {
    console.error('Error in syncAllFarmsWaterMetrics:', error);
  }
}
