import React, { useState } from 'react';
import { Navigation } from '@/components/ui/navigation';
import { DashboardKPIs } from '@/components/dashboard/DashboardKPIs';
import { WeatherSummary } from '@/components/dashboard/WeatherSummary';
import { AlertsOverview } from '@/components/dashboard/AlertsOverview';
import { FieldMap } from '@/components/ui/field-map';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Satellite, 
  Calendar,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import satelliteHero from '@/assets/satellite-hero.jpg';

const Index = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      {/* Navigation */}
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      
      {/* Main Content */}
      <main className="px-4 lg:px-6 py-6 space-y-6">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-satellite p-8 text-white">
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${satelliteHero})` }}
          />
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Satellite className="w-6 h-6" />
                  <h1 className="text-2xl lg:text-3xl font-bold">FarmScope Analytics</h1>
                </div>
                <p className="text-white/90 text-lg">
                  Precision agriculture platform monitoring crop health with Sentinel-2 satellite imagery
                </p>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                    <span>Real-time data</span>
                  </div>
                  <span>Field: 77.773°E, 12.392°N</span>
                  <span>Resolution: 10m/pixel</span>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Data
                </Button>
                <Button className="bg-white text-primary hover:bg-white/90">
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Dashboard */}
        <DashboardKPIs />

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

        {/* Recent Alerts */}
        <AlertsOverview />

        {/* Data Sources Footer */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0">
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Data Sources:</span>
                <Badge variant="outline">Sentinel-2 L2A</Badge>
                <Badge variant="outline">ERA5-Land</Badge>
                <Badge variant="outline">CHIRPS v2</Badge>
              </div>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Last Updated: 2024-01-15 14:30 UTC</span>
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
