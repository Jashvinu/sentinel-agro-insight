/**
 * Service to calculate water distribution metrics from satellite data
 * Uses NDWI (Normalized Difference Water Index) and moisture indices
 * 
 * Supports all satellite sources:
 * - Sentinel-2 (NDWI, moisture indices)
 * - Landsat 8/9 (NDWI, moisture indices)
 * - Sentinel-1 (SAR-based moisture)
 * 
 * Data is aggregated from all available satellites for comprehensive analysis
 */

import { supabase } from './supabase';
import { getAllFarms } from './farmService';
import { getCachedWaterMetrics } from './waterMetricsCacheService';

export interface WaterDistributionMetrics {
  balancePercentage: number; // 0-100, how evenly distributed
  status: 'balanced' | 'uneven' | 'critical';
  meanMoisture: number; // Average moisture value
  stdDev: number; // Standard deviation (lower = more balanced)
  trend: {
    value: number; // Percentage change
    label: string;
  };
  subtitle: string;
  variant: 'default' | 'success' | 'warning' | 'destructive';
  focus?: {
    lat: number;
    lon: number;
    note: string;
  };
}

/**
 * Calculate standard deviation from array of values
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate water distribution balance percentage
 * Lower std dev = higher balance (more even distribution)
 */
function calculateBalance(stdDev: number, meanValue: number): number {
  if (meanValue === 0) return 0;
  
  // Coefficient of variation (CV) = std dev / mean
  // Lower CV = more balanced
  const cv = stdDev / Math.abs(meanValue);
  
  // Convert CV to balance percentage (0-100)
  // CV of 0 = 100% balanced, CV > 0.5 = <50% balanced
  const balance = Math.max(0, Math.min(100, 100 - (cv * 100)));
  
  return Math.round(balance);
}

/**
 * Get status based on balance and moisture levels
 */
function getStatus(balance: number, meanMoisture: number): WaterDistributionMetrics['status'] {
  if (balance < 50) return 'critical';
  if (balance < 70) return 'uneven';
  return 'balanced';
}

/**
 * Get variant color based on status
 */
function getVariant(status: WaterDistributionMetrics['status']): WaterDistributionMetrics['variant'] {
  switch (status) {
    case 'balanced':
      return 'success';
    case 'uneven':
      return 'warning';
    case 'critical':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * Generate subtitle based on metrics
 */
function generateSubtitle(status: WaterDistributionMetrics['status'], stdDev: number): string {
  switch (status) {
    case 'balanced':
      return 'Soil moisture even across plots';
    case 'uneven':
      return `Moisture variation: ${stdDev.toFixed(1)}%`;
    case 'critical':
      return 'Significant moisture imbalance detected';
    default:
      return 'Monitoring water distribution';
  }
}


/**
 * Fetch water distribution metrics for user's farms
 * Uses cached 14-day data from water_metrics_cache table
 */
export async function getWaterDistributionMetrics(
  farmId?: string,
  days: number = 14
): Promise<WaterDistributionMetrics | null> {
  try {
    // Get user's farms
    const farms = await getAllFarms();
    if (farms.length === 0) {
      return null;
    }

    // Use specified farm or first farm
    const targetFarmId = farmId || farms[0].id;

    if (!targetFarmId) {
      return null;
    }

    // Get cached data (last 14 days)
    const cachedData = await getCachedWaterMetrics(targetFarmId);

    if (!cachedData || cachedData.length === 0) {
      // No cached data available
      return {
        balancePercentage: 0,
        status: 'critical',
        meanMoisture: 0,
        stdDev: 0,
        trend: { value: 0, label: 'no data' },
        subtitle: 'No water data available - syncing...',
        variant: 'destructive',
      };
    }

    // Calculate metrics from cached data
    const validData = cachedData.filter(d => 
      d.mean_value !== null && d.mean_value !== undefined
    );

    if (validData.length === 0) {
      return {
        balancePercentage: 0,
        status: 'critical',
        meanMoisture: 0,
        stdDev: 0,
        trend: { value: 0, label: 'no data' },
        subtitle: 'No valid water data',
        variant: 'destructive',
      };
    }

    // Calculate simple mean across all days and indices
    const meanValues = validData.map(d => d.mean_value || 0);
    const stdDevValues = validData.map(d => d.std_dev || 0);

    // Overall mean across all days and indices
    const meanMoisture = meanValues.reduce((sum, val) => sum + val, 0) / meanValues.length;
    
    // Calculate overall standard deviation
    const avgStdDev = stdDevValues.length > 0 
      ? stdDevValues.reduce((sum, val) => sum + val, 0) / stdDevValues.length
      : calculateStdDev(meanValues);

    // Calculate balance percentage
    const balancePercentage = calculateBalance(avgStdDev, meanMoisture);
    const status = getStatus(balancePercentage, meanMoisture);

    // Calculate trend (compare first 7 days to last 7 days)
    let trendValue = 0;
    const sortedData = [...validData].sort((a, b) => 
      new Date(a.observation_date).getTime() - new Date(b.observation_date).getTime()
    );
    
    if (sortedData.length >= 7) {
      const firstHalf = sortedData.slice(0, Math.floor(sortedData.length / 2));
      const secondHalf = sortedData.slice(Math.floor(sortedData.length / 2));
      
      const firstHalfMean = firstHalf.reduce((sum, d) => sum + (d.mean_value || 0), 0) / firstHalf.length;
      const secondHalfMean = secondHalf.reduce((sum, d) => sum + (d.mean_value || 0), 0) / secondHalf.length;

      if (firstHalfMean !== 0) {
        trendValue = ((secondHalfMean - firstHalfMean) / Math.abs(firstHalfMean)) * 100;
      }
    }

    // Get farm center for focus point
    const targetFarm = farms.find(f => f.id === targetFarmId) || farms[0];
    const bounds = targetFarm?.bounds;
    const focusLat = bounds 
      ? (bounds.minLat + bounds.maxLat) / 2 
      : 12.391;
    const focusLon = bounds 
      ? (bounds.minLng + bounds.maxLng) / 2 
      : 77.7742;

    // Generate focus note based on status
    let focusNote = 'Water distribution monitoring';
    if (status === 'critical') {
      focusNote = 'Immediate attention needed - significant moisture imbalance';
    } else if (status === 'uneven') {
      focusNote = 'Monitor moisture variation across plots';
    } else {
      focusNote = 'Water distribution is balanced across the farm';
    }

    return {
      balancePercentage,
      status,
      meanMoisture: Math.round(meanMoisture * 100) / 100,
      stdDev: Math.round(avgStdDev * 100) / 100,
      trend: {
        value: Math.round(trendValue * 10) / 10,
        label: `last ${days} days`,
      },
      subtitle: generateSubtitle(status, avgStdDev),
      variant: getVariant(status),
      focus: {
        lat: focusLat,
        lon: focusLon,
        note: focusNote,
      },
    };
  } catch (error) {
    console.error('Error calculating water distribution metrics:', error);
    return null;
  }
}

