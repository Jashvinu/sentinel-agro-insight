import React, { useState } from 'react';
import { Navigation } from '@/components/layout/navigation/navigation';
import { DashboardKPIs } from '@/components/features/dashboard/DashboardKPIs';
import { AIFieldReport } from '@/components/features/dashboard/AIFieldReport';
import { WeatherSummary } from '@/components/features/dashboard/WeatherSummary';
import { AlertsOverview } from '@/components/features/dashboard/AlertsOverview';
import { FieldMap } from '@/components/features/map/field-map';
import { AgriculturalIndices } from '@/components/features/dashboard/AgriculturalIndices';
import { FarmTimeline } from '@/components/features/dashboard/FarmTimeline';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { APP_CONFIG, DATA_SOURCES, FIELD_BOUNDARIES } from '@/constants';
import { formatDateTime } from '@/utils';

const Index = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      {/* Navigation */}
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Main Content */}
      <main className="px-4 lg:px-6 py-6 space-y-6">
        {/* KPI Dashboard - Minimalistic */}
        <DashboardKPIs />

        {/* AI Field Report */}
        <AIFieldReport />

        {/* Main Map Section - Full Width & Prominent */}
        <FieldMap height="h-[500px]" />

        {/* Compact Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <WeatherSummary />
          <AlertsOverview />
          <FarmTimeline />
        </div>

        {/* Agricultural Indices - Collapsible Section */}
        <details className="group">
          <summary className="cursor-pointer list-none">
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-semibold text-foreground">Agricultural Indices</span>
                <svg 
                  className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </CardContent>
            </Card>
          </summary>
          <div className="mt-4 animate-accordion-down">
            <AgriculturalIndices />
          </div>
        </details>

        {/* Data Sources Footer */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0">
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Data Sources:</span>
                {DATA_SOURCES.map((source) => (
                  <Badge key={source.name} variant="outline">
                    {source.name}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Last Updated: {formatDateTime(new Date())} UTC</span>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  <span>All systems operational</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
