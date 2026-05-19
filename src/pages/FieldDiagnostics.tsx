/**
 * FieldDiagnostics Page
 * Displays a diagnostic map showing problem areas on the farm
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/layout/navigation/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { useAbeFarm } from '@/hooks/useAbeFarm';
import {
  analyzeFarmWithRaster,
  DiagnosticRasterResult,
  GridCell,
} from '@/services/diagnosticService';
import { DiagnosticMap } from '@/components/features/diagnostics/DiagnosticMap';
import { DiagnosticLegend } from '@/components/features/diagnostics/DiagnosticLegend';
import { ProblemDetailPanel } from '@/components/features/diagnostics/ProblemDetailPanel';
import { ProblemSummary } from '@/components/features/diagnostics/ProblemSummary';
import { NextStepsCard } from '@/components/features/diagnostics/NextStepsCard';
import { DataQualityBadge } from '@/components/features/diagnostics/DataQualityBadge';
import { GeminiAdvisoryCard } from '@/components/features/diagnostics/GeminiAdvisoryCard';
import {
  AdvisoryCrop,
  AdvisorySeason,
  CROP_OPTIONS,
  SEASON_OPTIONS,
} from '@/data/agronomyKnowledge';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Loader2,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { useWeather } from '@/hooks/useWeather';
import { DiagnosticsWeatherCard } from '@/components/features/diagnostics/DiagnosticsWeatherCard';

const FieldDiagnostics: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('diagnostics');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { farm, farmId, farms, loading: farmLoading, selectFarm } = useAbeFarm();

  // Weather
  const { data: weatherData, loading: weatherLoading, fetchWeather } = useWeather();

  // Analysis state
  const [result, setResult] = useState<DiagnosticRasterResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [activeIndex, setActiveIndex] = useState<string>('ndvi');
  const [selectedCrop, setSelectedCrop] = useState<AdvisoryCrop>('rice');
  const [selectedSeason, setSelectedSeason] = useState<AdvisorySeason>('kharif');

  // Run analysis when farm is loaded
  const runAnalysis = useCallback(async () => {
    if (!farmId || !farm?.geometry) {
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setProgressMessage('Starting analysis...');
    setSelectedCell(null);

    try {
      const analysisResult = await analyzeFarmWithRaster(
        farmId,
        farm.geometry,
        (prog, msg) => {
          setProgress(prog);
          setProgressMessage(msg);
        }
      );

      setResult(analysisResult);

      // Show toast based on results
      if (analysisResult.problems.length === 0) {
        toast({
          title: 'Analysis Complete',
          description: 'No problems detected! Your field looks healthy.',
        });
      } else {
        toast({
          title: 'Analysis Complete',
          description: `Found ${analysisResult.problems.length} issue type(s) affecting ${analysisResult.farmStats.problemCells} cells.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[FieldDiagnostics] Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Failed to analyze farm. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [farmId, farm?.geometry, toast]);

  // Auto-run analysis when farm loads
  useEffect(() => {
    if (farm?.geometry && !result && !isAnalyzing) {
      runAnalysis();
    }
  }, [farm?.geometry, result, isAnalyzing, runAnalysis]);

  // Re-run analysis when farm changes
  useEffect(() => {
    if (farmId && farm?.geometry) {
      setResult(null); // Clear previous results to trigger new analysis
    }
  }, [farmId, farm?.geometry]);

  // Fetch weather when farm loads
  useEffect(() => {
    if (!farm?.geometry) return;
    try {
      let coords: number[][];
      if (farm.geometry.type === 'Polygon') {
        coords = farm.geometry.coordinates[0];
      } else if (farm.geometry.type === 'MultiPolygon') {
        coords = farm.geometry.coordinates[0][0];
      } else return;
      const lats = coords.map((c: number[]) => c[1]);
      const lngs = coords.map((c: number[]) => c[0]);
      const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      fetchWeather(lat, lng);
    } catch {
      // silently skip weather
    }
  }, [farm?.geometry, fetchWeather]);

  // Handle cell click
  const handleCellClick = (cell: GridCell) => {
    setSelectedCell(cell);
  };

  // Close detail panel
  const handleCloseDetail = () => {
    setSelectedCell(null);
  };

  // No farm state
  if (!farmLoading && !farm) {
    return (
      <div className="min-h-screen bg-background pb-20 lg:pb-0">
        <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <Card>
            <CardContent className="py-12 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">No Farm Selected</h2>
              <p className="text-muted-foreground mb-4">
                Please draw a farm polygon first to run diagnostics.
              </p>
              <Button onClick={() => navigate('/')}>
                Draw Farm Polygon
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="sticky top-0 z-40 -mx-3 flex flex-col gap-3 border-b bg-background/95 px-3 py-3 shadow-sm backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-lg sm:border sm:bg-muted/30 sm:p-4 sm:shadow-none">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"
              onClick={() => navigate('/')}
              aria-label="Back to plot designer"
            >
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight sm:text-2xl">
                <Activity className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                Field Diagnostics
              </h1>
              {farm && (
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  Analyzing: {farm.name}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {/* Farm Selector Dropdown */}
            {farms.length > 1 && (
              <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">Farm</span>
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <select
                    value={farmId || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        selectFarm(e.target.value);
                      }
                    }}
                    className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:min-w-[150px]"
                  >
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">Crop</span>
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <select
                  value={selectedCrop}
                  onChange={(e) => setSelectedCrop(e.target.value as AdvisoryCrop)}
                  className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:min-w-[132px]"
                  aria-label="Select crop"
                >
                  {CROP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">Season</span>
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value as AdvisorySeason)}
                  className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:min-w-[112px]"
                  aria-label="Select season"
                >
                  {SEASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {result && (
              <Badge variant={result.problems.length > 0 ? 'destructive' : 'default'} className="h-9 px-3">
                {result.problems.length > 0
                  ? `${result.problems.length} Issue${result.problems.length > 1 ? 's' : ''} Found`
                  : 'Healthy'}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 sm:flex-none"
              onClick={runAnalysis}
              disabled={isAnalyzing || !farm?.geometry}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isAnalyzing && (
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">{progressMessage}</p>
                  <p className="text-sm text-muted-foreground">
                    {progress.toFixed(0)}% complete
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {progress >= 80 && progressMessage.includes('cache') ? 'Loaded from cache — instant results' :
                      progress < 20 ? 'Connecting to Earth Engine...' :
                        progress < 50 ? 'Downloading last 2 weeks of imagery...' :
                          progress < 70 ? 'Building 10m grid cells...' :
                            progress < 90 ? 'Detecting problem areas...' :
                              'Finalizing results...'}
                  </p>
                </div>
                <div className="w-full max-w-xs bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main content */}
        {!isAnalyzing && result && (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4">
            {/* Map - takes 3 columns on large screens */}
            <div className="lg:col-span-3">
              <Card className="overflow-hidden rounded-xl sm:rounded-lg">
                <CardHeader className="px-3 py-2 sm:px-6 sm:py-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Diagnostic Map</span>
                    <Badge variant="outline" className="font-normal">
                      10m resolution
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative h-[56vh] min-h-[360px] max-h-[620px] p-0 sm:h-[600px]">
                  <DiagnosticMap
                    cells={result.cells}
                    farmGeometry={farm?.geometry}
                    onCellClick={handleCellClick}
                    selectedCellId={selectedCell?.id}
                    rasterUrls={result.rasterUrls}
                    rasterBounds={result.bounds}
                    activeIndex={activeIndex}
                    onActiveIndexChange={setActiveIndex}
                  />
                  <ProblemDetailPanel
                    cell={selectedCell}
                    result={result}
                    onClose={handleCloseDetail}
                  />
                  <DataQualityBadge result={result} />
                </CardContent>
              </Card>
            </div>


            {/* Sidebar - takes 1 column on large screens */}
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="order-2 lg:order-1">
                <ProblemSummary result={result} />
              </div>
              <div className="order-1 lg:order-2">
                <GeminiAdvisoryCard
                  crop={selectedCrop}
                  season={selectedSeason}
                  result={result}
                  weatherData={weatherData}
                  farmName={farm?.name}
                />
              </div>
              <div className="order-3">
                <NextStepsCard result={result} />
              </div>
              <div className="order-4">
                <DiagnosticsWeatherCard data={weatherData} loading={weatherLoading} result={result} />
              </div>
              <div className="order-5">
                <DiagnosticLegend
                  problems={result.problems}
                  hasOverlaps={result.farmStats.overlapCells > 0}
                  totalCells={result.farmStats.totalCells}
                />
              </div>
            </div>
          </div>
        )}

        {/* Empty state when not analyzing and no result */}
        {!isAnalyzing && !result && farm?.geometry && (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">Ready to Analyze</h2>
              <p className="text-muted-foreground mb-4">
                Click the button below to analyze your farm for problem areas.
              </p>
              <Button onClick={runAnalysis}>
                <Activity className="w-4 h-4 mr-2" />
                Start Analysis
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default FieldDiagnostics;
