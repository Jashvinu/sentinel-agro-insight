/**
 * FieldDiagnostics Page
 * Displays a diagnostic map showing problem areas on the farm
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/layout/navigation/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { useAbeFarm } from '@/hooks/useAbeFarm';
import {
  analyzeFarm,
  DiagnosticResult,
  GridCell,
  normalizeDiagnosticCrop,
} from '@/services/diagnosticService';
import {
  ScoutZone,
  DiseaseScreenResult,
  runDiseaseScreen as runDiseaseScreenService,
  getScoutZones,
  diseaseDisplayName,
} from '@/services/diseaseService';
import { findNearestKVK, type KVKWithDistance } from '@/services/kvkService';
import { updateFarmField } from '@/services/farmService';
import { type Farm } from '@/services/supabase';
import { DiagnosticMap } from '@/components/features/diagnostics/DiagnosticMap';
import { DiagnosticLegend } from '@/components/features/diagnostics/DiagnosticLegend';
import { ProblemDetailPanel } from '@/components/features/diagnostics/ProblemDetailPanel';
import { ProblemSummary } from '@/components/features/diagnostics/ProblemSummary';
import { GeminiAdvisoryCard } from '@/components/features/diagnostics/GeminiAdvisoryCard';
import ScoutZoneSidebar from '@/components/features/diagnostics/ScoutZoneSidebar';
import ScoutZoneCapture from '@/components/features/diagnostics/ScoutZoneCapture';
import NearestKVKCard from '@/components/features/diagnostics/NearestKVKCard';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Loader2,
  MapPin,
  ChevronDown,
  Scan,
  CalendarDays,
  X,
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
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  // Sowing date banner state
  const [sowingDateInput, setSowingDateInput] = useState('');
  const [savingSowingDate, setSavingSowingDate] = useState(false);
  const [sowingBannerDismissed, setSowingBannerDismissed] = useState(false);

  // Derived: show banner when farm has no sowing date and user hasn't dismissed
  const showSowingBanner = !!(
    farm &&
    !farm.sowing_date &&
    !sowingBannerDismissed
  );

  const handleSaveSowingDate = async () => {
    if (!farmId || !sowingDateInput) return;
    setSavingSowingDate(true);
    try {
      await updateFarmField(farmId, { sowing_date: sowingDateInput });
      setSowingBannerDismissed(true);
      // Re-run analysis with the new sowing date so stage thresholds are accurate
      autoRunTriggeredRef.current = false;
      setAnalysisError(null);
      runAnalysis();
      toast({ title: 'Sowing date saved', description: `Analysis re-run with sowing date ${sowingDateInput}.` });
    } finally {
      setSavingSowingDate(false);
    }
  };

  // Disease scout state
  const [scoutZones, setScoutZones] = useState<ScoutZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<ScoutZone | null>(null);
  const [isScreening, setIsScreening] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [nearestKVK, setNearestKVK] = useState<KVKWithDistance | null>(null);

  // Run analysis when farm is loaded
  const runAnalysis = useCallback(async () => {
    if (!farmId || !farm?.geometry) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setProgress(0);
    setProgressMessage('Starting analysis...');
    setSelectedCell(null);

    try {
      const cropProfile = normalizeDiagnosticCrop(
        farm.crop_type || farm.cropType || farm.crop || farm.primary_crop || 'rice'
      );
      // Read sowing_date from localStorage so a just-saved value is picked up
      // without waiting for the farm hook to reload.
      const storedFarms: Farm[] = (() => {
        try { return JSON.parse(localStorage.getItem('sentinel_farms') ?? '[]'); } catch { return []; }
      })();
      const storedFarm = storedFarms.find(f => f.id === farmId);
      const sowingDate: string | undefined =
        storedFarm?.sowing_date || farm.sowing_date || (farm as any).sowingDate || undefined;
      const analysisResult = await analyzeFarm(
        farmId,
        farm.geometry,
        cropProfile,
        (prog, msg) => {
          setProgress(prog);
          setProgressMessage(msg);
        },
        sowingDate,
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
      const msg = error instanceof Error ? error.message : 'Failed to analyze farm.';
      setAnalysisError(msg);
      toast({
        title: 'Analysis Failed',
        description: msg.includes('No usable optical images')
          ? 'No clear satellite imagery found for this location recently. Try again later or check cloud cover conditions.'
          : 'Failed to analyze farm. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [farmId, farm?.geometry, farm?.crop_type, farm?.cropType, farm?.crop, farm?.primary_crop, toast]);

  // Auto-run analysis once when farm first loads — don't retry on failure
  const autoRunTriggeredRef = useRef(false);
  useEffect(() => {
    if (farm?.geometry && !result && !isAnalyzing && !analysisError && !autoRunTriggeredRef.current) {
      autoRunTriggeredRef.current = true;
      runAnalysis();
    }
  }, [farm?.geometry, result, isAnalyzing, analysisError, runAnalysis]);

  // Reset auto-run flag when farm changes so new farm triggers fresh analysis
  useEffect(() => {
    if (farmId && farm?.geometry) {
      autoRunTriggeredRef.current = false;
      setResult(null);
      setAnalysisError(null);
    }
  }, [farmId, farm?.geometry]);

  // Load existing scout zones when farm changes
  useEffect(() => {
    if (!farmId) return;
    getScoutZones(farmId).then(setScoutZones).catch(() => {});
  }, [farmId]);

  // Compute nearest KVK from farm centroid
  useEffect(() => {
    if (!farm?.geometry) return;
    try {
      let coords: number[][];
      if (farm.geometry.type === 'Polygon') coords = farm.geometry.coordinates[0];
      else if (farm.geometry.type === 'MultiPolygon') coords = farm.geometry.coordinates[0][0];
      else return;
      const lats = coords.map((c: number[]) => c[1]);
      const lngs = coords.map((c: number[]) => c[0]);
      const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      setNearestKVK(findNearestKVK(lat, lng));
    } catch { /* skip */ }
  }, [farm?.geometry]);

  // Run satellite disease pre-screen
  const runDiseaseScreen = useCallback(async () => {
    if (!farmId || !farm) return;
    setIsScreening(true);
    try {
      const screenResult: DiseaseScreenResult = await runDiseaseScreenService({
        farmId,
        crop: 'rice',
        season: 'kharif',
        geometry: farm.geometry,
      });
      setScoutZones(screenResult.scout_zones);
      toast({
        title: `Disease screen complete`,
        description: `${screenResult.scout_zones.length} scout zone(s) identified`,
        variant: screenResult.scout_zones.length > 0 ? 'destructive' : 'default',
      });
    } catch (err) {
      toast({ title: 'Disease screen failed', description: String(err), variant: 'destructive' });
    } finally {
      setIsScreening(false);
    }
  }, [farmId, farm, toast]);

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
              <Button onClick={() => navigate('/draw-polygon')}>
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

      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Activity className="w-6 h-6 text-primary" />
                Field Diagnostics
              </h1>
              {farm && (
                <p className="text-sm text-muted-foreground">
                  {farm.name}
                  {result?.growthStageName && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-sm bg-primary/10 text-primary font-medium">
                      {result.growthStageName}
                    </span>
                  )}
                  {result?.sowingDate && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                      Sown {result.sowingDate}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Farm Selector Dropdown */}
          {farms.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Farm:</span>
              <div className="relative">
                <select
                  value={farmId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      selectFarm(e.target.value);
                    }
                  }}
                  className="appearance-none bg-background border border-input rounded-md px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-[150px]"
                >
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {result && (
              <Badge variant={result.problems.length > 0 ? 'destructive' : 'default'}>
                {result.problems.length > 0
                  ? `${result.problems.length} Issue${result.problems.length > 1 ? 's' : ''} Found`
                  : 'Healthy'}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={runDiseaseScreen}
              disabled={isScreening || !farm?.geometry}
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              {isScreening ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scan className="w-4 h-4 mr-2" />}
              {isScreening ? 'Screening...' : 'Disease Screen'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                autoRunTriggeredRef.current = false;
                setAnalysisError(null);
                runAnalysis();
              }}
              disabled={isAnalyzing || !farm?.geometry}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
            </Button>
          </div>
        </div>

        {/* Sowing date banner — shown when farm has no sowing date recorded */}
        {showSowingBanner && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
            <CalendarDays className="w-5 h-5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Set your sowing date for accurate stage thresholds</p>
              <p className="text-xs text-amber-700/80">Without a sowing date, the system infers growth stage from NDVI — adding the actual date improves threshold accuracy.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="date"
                value={sowingDateInput}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setSowingDateInput(e.target.value)}
                className="px-2 py-1 text-sm border border-amber-300 rounded bg-white text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <Button
                size="sm"
                disabled={!sowingDateInput || savingSowingDate}
                onClick={handleSaveSowingDate}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingSowingDate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Re-analyse'}
              </Button>
              <button
                onClick={() => setSowingBannerDismissed(true)}
                className="p-1 rounded hover:bg-amber-100"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-amber-600" />
              </button>
            </div>
          </div>
        )}

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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Map - takes 3 columns on large screens */}
            <div className="lg:col-span-3">
              <Card className="overflow-hidden">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Diagnostic Map</span>
                    <Badge variant="outline" className="font-normal">
                      10m resolution
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 relative" style={{ height: '600px' }}>
                  <DiagnosticMap
                    cells={result.cells}
                    farmGeometry={farm?.geometry}
                    onCellClick={handleCellClick}
                    selectedCellId={selectedCell?.id}
                    zones={scoutZones}
                    onZoneSelect={(zone) => { setSelectedZone(zone); setShowCapture(true); }}
                  />
                  <ProblemDetailPanel
                    cell={selectedCell}
                    result={result}
                    onClose={handleCloseDetail}
                  />
                </CardContent>
              </Card>
            </div>


            {/* Sidebar - takes 1 column on large screens */}
            <div className="space-y-4">
              <ProblemSummary result={result} />
              <GeminiAdvisoryCard
                crop={normalizeDiagnosticCrop(farm?.crop_type || farm?.cropType || farm?.crop || farm?.primary_crop) === 'millet' ? 'millet' : 'rice'}
                season={new Date().getMonth() >= 5 && new Date().getMonth() <= 9 ? 'kharif' : 'rabi'}
                result={result}
                weatherData={weatherData}
                farmName={farm?.name}
              />
              {scoutZones.length > 0 && (
                <ScoutZoneSidebar
                  zones={scoutZones}
                  onSelect={(zone) => { setSelectedZone(zone); setShowCapture(true); }}
                />
              )}
              {nearestKVK && <NearestKVKCard kvk={nearestKVK} />}
              <DiagnosticsWeatherCard data={weatherData} loading={weatherLoading} />
              <DiagnosticLegend
                problems={result.problems}
                hasOverlaps={result.farmStats.overlapCells > 0}
                totalCells={result.farmStats.totalCells}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {!isAnalyzing && !result && analysisError && farm?.geometry && (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h2 className="text-lg font-semibold mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                {analysisError.includes('No usable optical images')
                  ? 'No clear satellite imagery was found for this location in the last 30 days. This can happen during monsoon or heavy cloud seasons.'
                  : 'Failed to run diagnostics. Please check your connection and try again.'}
              </p>
              <Button onClick={() => {
                autoRunTriggeredRef.current = false;
                setAnalysisError(null);
                runAnalysis();
              }}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state when not analyzing and no result */}
        {!isAnalyzing && !result && !analysisError && farm?.geometry && (
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

      {showCapture && selectedZone && (
        <ScoutZoneCapture
          zone={selectedZone}
          farmId={farmId!}
          crop={selectedZone.crop || 'rice'}
          growthStage={selectedZone.growth_stage || 'tillering'}
          onClose={() => { setShowCapture(false); setSelectedZone(null); }}
          onDiagnosed={(zone, diag) => {
            setScoutZones((prev) =>
              prev.map((z) =>
                z.id === zone.id
                  ? { ...z, status: diag.confidence >= 0.65 ? 'confirmed' : 'scouted' }
                  : z
              )
            );
            toast({
              title: `${diseaseDisplayName(diag.confirmed_diagnosis)} — ${(diag.confidence * 100).toFixed(0)}% confidence`,
              variant: diag.confidence >= 0.65 ? 'destructive' : 'default',
            });
          }}
        />
      )}
    </div>
  );
};

export default FieldDiagnostics;
