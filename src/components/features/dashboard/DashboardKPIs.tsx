import React from 'react';
import { KPICard } from '@/components/ui/kpi-card';
import { 
  TrendingUp, 
  Droplets, 
  Thermometer, 
  AlertTriangle,
  Leaf,
  Activity
} from 'lucide-react';

export const DashboardKPIs: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KPICard
        title="NDVI Trend"
        value="0.82"
        subtitle="Avg. last 30 days"
        icon={Leaf}
        trend={{ value: 5.2, label: "vs last month" }}
        variant="success"
      />
      
      <KPICard
        title="Rainfall YTD"
        value="342mm"
        subtitle="Since Jan 1, 2024"
        icon={Droplets}
        trend={{ value: -12.3, label: "vs normal" }}
        variant="warning"
      />
      
      <KPICard
        title="GDD Total"
        value="1,847"
        subtitle="Base 10°C"
        icon={Thermometer}
        trend={{ value: 8.1, label: "vs normal" }}
        variant="default"
      />
      
      <KPICard
        title="Active Alerts"
        value="3"
        subtitle="2 medium, 1 low"
        icon={AlertTriangle}
        variant="warning"
      />
      
      <KPICard
        title="Field Health"
        value="87%"
        subtitle="Overall score"
        icon={Activity}
        trend={{ value: 2.1, label: "improving" }}
        variant="success"
      />
      
      <KPICard
        title="Coverage"
        value="98.3%"
        subtitle="Clear imagery"
        icon={TrendingUp}
        variant="default"
      />
    </div>
  );
};