import React, { useState } from 'react';
import { Navigation } from '@/components/layout/navigation/navigation';
import { DashboardKPIs } from '@/components/features/dashboard/DashboardKPIs';
import { AIFieldReport } from '@/components/features/dashboard/AIFieldReport';
import { WeatherSummary } from '@/components/features/dashboard/WeatherSummary';
import { AlertsOverview } from '@/components/features/dashboard/AlertsOverview';
import { FieldMap } from '@/components/features/map/field-map';
import { AgriculturalIndices } from '@/components/features/dashboard/AgriculturalIndices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, BarChart3, MapPinned } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_CONFIG, DATA_SOURCES, FIELD_BOUNDARIES } from '@/constants';
import { formatDateTime } from '@/utils';

const Dashboard = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      {/* Navigation */}
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {APP_CONFIG.name}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mt-1">
              Field Location: {FIELD_BOUNDARIES.coordinates[0][1].toFixed(4)}°N, {FIELD_BOUNDARIES.coordinates[0][0].toFixed(4)}°E
            </p>
          </div>
          <Button
            onClick={() => navigate('/draw-polygon')}
            className="flex-shrink-0"
          >
            <MapPinned className="w-4 h-4 mr-2" />
            Draw New Farm Polygon
          </Button>
        </div>

        {/* KPI Dashboard */}
        <DashboardKPIs />

        {/* AI Field Brief - Main Feature */}
        <AIFieldReport />

        {/* Main Dashboard Grid - Map and Weather */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Field Map - Takes 3 columns on large screens (bigger) */}
          <div className="lg:col-span-3">
            <div className="relative">
              <FieldMap height="h-[500px] sm:h-[600px] lg:h-[650px]" />
            </div>
          </div>

          {/* Weather Summary - Compact sidebar */}
          <div className="space-y-4 sm:space-y-6">
            <WeatherSummary />

            {/* Quick Stats */}
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2 text-base sm:text-lg font-semibold">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <span>Quick Field Stats</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 bg-gradient-crop/10 rounded-lg text-center border border-success/20 hover:border-success/40 transition-colors">
                    <p className="text-xl sm:text-2xl font-bold text-success mb-1">94.2%</p>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Crop Coverage</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-gradient-sky/10 rounded-lg text-center border border-accent/20 hover:border-accent/40 transition-colors">
                    <p className="text-xl sm:text-2xl font-bold text-accent mb-1">156</p>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Growing Degree Days</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Last 7 days</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-gradient-earth/10 rounded-lg text-center border border-warning/20 hover:border-warning/40 transition-colors">
                    <p className="text-xl sm:text-2xl font-bold text-warning mb-1">42%</p>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Soil Moisture</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-gradient-primary/10 rounded-lg text-center border border-primary/20 hover:border-primary/40 transition-colors">
                    <p className="text-xl sm:text-2xl font-bold text-primary mb-1">15</p>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">Clear Days</p>
                  </div>
                </div>

                <Button variant="outline" className="w-full text-sm sm:text-base py-2.5 sm:py-3" size="default">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Detailed Analytics
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Compact Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AlertsOverview />
          <Card className="p-4">
            <div className="text-center text-muted-foreground py-8">
              <p className="font-semibold">Farm Timeline</p>
              <p className="text-sm">Select a farm to view timeline</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center text-muted-foreground py-8">
              <p className="font-semibold">Abe's farm not found</p>
              <p className="text-sm">Please create Abe's farm first</p>
            </div>
          </Card>
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
        <Card className="bg-muted/30 border-muted">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0 gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <span className="text-sm sm:text-base font-medium text-foreground">Data Sources:</span>
                <div className="flex flex-wrap gap-2">
                  {DATA_SOURCES.map((source) => (
                    <Badge key={source.name} variant="outline" className="text-xs sm:text-sm px-2.5 py-1">
                      {source.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 text-sm sm:text-base text-muted-foreground">
                <span>Last Updated: {formatDateTime(new Date())} UTC</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
                  <span className="font-medium text-success">All systems operational</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
