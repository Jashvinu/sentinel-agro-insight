import React, { useState } from 'react';
import { Navigation } from '@/components/layout/navigation/navigation';
import { DashboardKPIs } from '@/components/features/dashboard/DashboardKPIs';
import { AIFieldReport } from '@/components/features/dashboard/AIFieldReport';
import { WeatherSummary } from '@/components/features/dashboard/WeatherSummary';
import { AlertsOverview } from '@/components/features/dashboard/AlertsOverview';
import { FieldMap } from '@/components/features/map/field-map';
import { AgriculturalIndices } from '@/components/features/dashboard/AgriculturalIndices';
import { FarmTimeline } from '@/components/features/dashboard/FarmTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, BarChart3 } from 'lucide-react';
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {APP_CONFIG.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {FIELD_BOUNDARIES.coordinates[0][1].toFixed(6)}°N,{' '}
            {FIELD_BOUNDARIES.coordinates[0][0].toFixed(6)}°E
          </p>
        </div>

        {/* KPI Dashboard */}
        <DashboardKPIs />

        {/* AI Report */}
        <AIFieldReport />

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Field Map - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <FieldMap height="h-[400px]" />
          </div>

          {/* Weather Summary */}
          <div className="space-y-6">
            <WeatherSummary />

            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <span>Field Analytics</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gradient-crop/10 rounded-lg text-center">
                    <p className="text-lg font-bold text-success">94.2%</p>
                    <p className="text-xs text-muted-foreground">Crop Coverage</p>
                  </div>
                  <div className="p-3 bg-gradient-sky/10 rounded-lg text-center">
                    <p className="text-lg font-bold text-accent">156</p>
                    <p className="text-xs text-muted-foreground">GDD Last 7d</p>
                  </div>
                  <div className="p-3 bg-gradient-earth/10 rounded-lg text-center">
                    <p className="text-lg font-bold text-warning">42%</p>
                    <p className="text-xs text-muted-foreground">Soil Moisture</p>
                  </div>
                  <div className="p-3 bg-gradient-primary/10 rounded-lg text-center">
                    <p className="text-lg font-bold text-primary">15</p>
                    <p className="text-xs text-muted-foreground">Clear Days</p>
                  </div>
                </div>

                <Button variant="outline" className="w-full" size="sm">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Detailed Analytics
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Agricultural Indices Dashboard */}
        <AgriculturalIndices />

        {/* Farm Timeline - Historical Data */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AlertsOverview />
          </div>
          <div>
            <FarmTimeline />
          </div>
        </div>

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
