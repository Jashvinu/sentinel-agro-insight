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
  analyzeFarm,
  DiagnosticResult,
  GridCell,
} from '@/services/diagnosticService';
import { DiagnosticMap } from '@/components/features/diagnostics/DiagnosticMap';
import { DiagnosticLegend } from '@/components/features/diagnostics/DiagnosticLegend';
import { ProblemDetailPanel } from '@/components/features/diagnostics/ProblemDetailPanel';
import { ProblemSummary } from '@/components/features/diagnostics/ProblemSummary';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Loader2,
  MapPin,
} from 'lucide-react';

const FieldDiagnostics: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('diagnostics');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { farm, farmId, loading: farmLoading } = useAbeFarm();

  // Analysis state
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

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
      const analysisResult = await analyzeFarm(
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
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                  Analyzing: {farm.name}
                </p>
              )}
            </div>
          </div>

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
                      30m resolution
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 relative" style={{ height: '500px' }}>
                  <DiagnosticMap
                    cells={result.cells}
                    farmGeometry={farm?.geometry}
                    onCellClick={handleCellClick}
                    selectedCellId={selectedCell?.id}
                  />
                  <ProblemDetailPanel
                    cell={selectedCell}
                    onClose={handleCloseDetail}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - takes 1 column on large screens */}
            <div className="space-y-4">
              <ProblemSummary result={result} />
              <DiagnosticLegend
                problems={result.problems}
                hasOverlaps={result.farmStats.overlapCells > 0}
              />
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
