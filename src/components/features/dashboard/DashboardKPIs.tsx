import React from 'react';
import { KPICard } from '@/components/ui/kpi-card';
import type { LucideIcon } from 'lucide-react';
import {
  Droplets,
  FlaskConical,
  Bug,
  CloudLightning
} from 'lucide-react';

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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {CARD_CONFIG.map(({ key, icon }) => {
        const insight = DASHBOARD_INSIGHTS[key];
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