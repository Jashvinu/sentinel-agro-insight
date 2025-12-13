import React from 'react';
import { KPICard } from '@/components/ui/kpi-card';
import type { LucideIcon } from 'lucide-react';
import {
  Droplets,
  FlaskConical,
  Bug,
  CloudLightning
} from 'lucide-react';
import { useWaterMetrics } from '@/hooks/useWaterMetrics';
import { getAllFarms } from '@/services/farmService';
import { useState, useEffect } from 'react';

type DashboardInsight = {
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
  variant: 'default' | 'success' | 'warning' | 'destructive';
  focus: {
    lat: number;
    lon: number;
    note: string;
  };
};

export const DASHBOARD_INSIGHTS: Record<'water' | 'inputs' | 'pests' | 'weather', DashboardInsight> = {
  water: {
    title: "Water Distribution",
    value: "79% balanced",
    subtitle: "Soil moisture even across plots",
    trend: { value: -6.4, label: "last 14 days" },
    variant: "warning" as const,
    focus: {
      lat: 12.391,
      lon: 77.7742,
      note: "North-west drip row shows drying trend"
    }
  },
  inputs: {
    title: "Soil Inputs Snapshot",
    value: "NPK balanced",
    subtitle: "pH 6.4 | Salinity normal",
    trend: { value: -2.1, label: "nutrient drift 7d" },
    variant: "default" as const,
    focus: {
      lat: 12.3923,
      lon: 77.7735,
      note: "Track nitrogen drift near center plots"
    }
  },
  pests: {
    title: "Pest & Disease Outlook",
    value: "Low risk",
    subtitle: "Forecast: monitor hotspots",
    variant: "success" as const,
    focus: {
      lat: 12.3909,
      lon: 77.7740,
      note: "Scout shaded boundary edges"
    }
  },
  weather: {
    title: "Weather Alerts",
    value: "Stable now",
    subtitle: "Watching rapid temp swings",
    trend: { value: 1.8, label: "volatility index 3d" },
    variant: "warning" as const,
    focus: {
      lat: 12.3924,
      lon: 77.7733,
      note: "Monitor gust fronts entering from west"
    }
  }
} as const;

type InsightKey = keyof typeof DASHBOARD_INSIGHTS;

const CARD_CONFIG: Array<{
  key: InsightKey;
  icon: LucideIcon;
}> = [
    { key: 'water', icon: Droplets },
    { key: 'inputs', icon: FlaskConical },
    { key: 'pests', icon: Bug },
    { key: 'weather', icon: CloudLightning }
  ];

export const DashboardKPIs: React.FC = () => {
  const [farmId, setFarmId] = useState<string | undefined>(undefined);
  const { metrics, loading: waterLoading } = useWaterMetrics(farmId, 14);

  // Get user's first farm
  useEffect(() => {
    getAllFarms().then(farms => {
      if (farms.length > 0) {
        setFarmId(farms[0].id);
      }
    });
  }, []);

  // Get water insight from real data or fallback to default
  const getWaterInsight = (): DashboardInsight => {
    if (waterLoading) {
      // Show loading state
      return {
        ...DASHBOARD_INSIGHTS.water,
        value: "Loading...",
        subtitle: "Fetching water distribution data",
        variant: "default" as const,
      };
    }

    if (!metrics) {
      // No data available - provide helpful message
      return {
        ...DASHBOARD_INSIGHTS.water,
        value: "No data",
        subtitle: "Fetching satellite data... This may take a moment",
        variant: "default" as const,
      };
    }

    // If metrics exist but balance is 0, it means no data was found
    if (metrics.balancePercentage === 0 && metrics.meanMoisture === 0) {
      return {
        ...DASHBOARD_INSIGHTS.water,
        value: "No data",
        subtitle: metrics.subtitle || "No water data available - check farm polygon",
        variant: "default" as const,
      };
    }

    // Format status text
    const statusText = metrics.status === 'balanced' 
      ? 'balanced' 
      : metrics.status === 'uneven' 
      ? 'uneven' 
      : 'critical';

    return {
      title: "Water Distribution",
      value: `${metrics.balancePercentage}% ${statusText}`,
      subtitle: metrics.subtitle,
      trend: metrics.trend,
      variant: metrics.variant,
      focus: metrics.focus || DASHBOARD_INSIGHTS.water.focus,
    };
  };

  const waterInsight = getWaterInsight();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
      {CARD_CONFIG.map(({ key, icon }) => {
        // Use real data for water, fallback for others
        const insight = key === 'water' ? waterInsight : DASHBOARD_INSIGHTS[key];
        return (
          <KPICard
            key={key}
            title={insight.title}
            value={insight.value}
            subtitle={insight.subtitle}
            icon={icon}
            trend={insight.trend}
            variant={insight.variant}
          />
        );
      })}
    </div>
  );
};