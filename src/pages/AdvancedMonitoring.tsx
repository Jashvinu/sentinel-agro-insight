import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';
import { AlgorithmSelector } from '@/components/features/advanced-monitoring/AlgorithmSelector';
import { DateRangePicker } from '@/components/features/advanced-monitoring/DateRangePicker';
import { TimeSeriesChart } from '@/components/features/advanced-monitoring/TimeSeriesChart';
import { TrendStatCards } from '@/components/features/advanced-monitoring/TrendStatCards';
import { TrendMap } from '@/components/features/advanced-monitoring/TrendMap';
import { ExportDataButton } from '@/components/features/advanced-monitoring/ExportDataButton';
import { AlertThresholdConfig, type AlertThreshold } from '@/components/features/advanced-monitoring/AlertThresholdConfig';
import { SeasonalComparison } from '@/components/features/advanced-monitoring/SeasonalComparison';
import { useAbeFarm } from '@/hooks/useAbeFarm';
import { advancedMonitoringService } from '@/services/advancedMonitoringService';
import { useToast } from '@/hooks/useToast';
import type { Algorithm, AlgorithmTimeSeries, TrendAnalysis } from '@/types/advancedMonitoring';

export const AdvancedMonitoring: React.FC = () => {
    const { farm, farmId, loading: farmLoading } = useAbeFarm();
    const { toast } = useToast();

    const [selectedAlgorithms, setSelectedAlgorithms] = useState<Algorithm[]>(['optram_moisture']);
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });
    const [loading, setLoading] = useState(false);
    const [analysisData, setAnalysisData] = useState<{
        timeseries: AlgorithmTimeSeries[];
        trends: TrendAnalysis[];
        cached?: boolean;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Alert thresholds state
    const [alertThresholds, setAlertThresholds] = useState<AlertThreshold[]>([]);
    const [showAlertConfig, setShowAlertConfig] = useState(false);

    // Seasonal comparison state
    const [showSeasonalComparison, setShowSeasonalComparison] = useState(false);
    const [previousSeasonData, setPreviousSeasonData] = useState<{
        year: number;
        timeseries: AlgorithmTimeSeries[];
    } | null>(null);
    const [loadingPreviousSeason, setLoadingPreviousSeason] = useState(false);

    const handleAnalyze = async () => {
        if (!farm || !farmId) {
            toast({
                title: 'No farm selected',
                description: 'Please create or select a farm first',
                variant: 'destructive',
            });
            return;
        }

        if (selectedAlgorithms.length === 0) {
            toast({
                title: 'No algorithms selected',
                description: 'Please select at least one algorithm to analyze',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await advancedMonitoringService.fetchAnalysis({
                polygon: farm.geometry,
                farmId: farmId,
                startDate: dateRange.start,
                endDate: dateRange.end,
                algorithms: selectedAlgorithms,
                includeTrends: true,
                aggregationLevel: 'grid',
                windowSizeDays: 10,
            });

            setAnalysisData({
                timeseries: response.timeseries,
                trends: response.trends || [],
                cached: response.metadata.cached,
            });

            toast({
                title: response.metadata.cached ? 'Loaded from cache' : 'Analysis complete',
                description: `Processed ${response.metadata.windowCount} windows across ${response.metadata.algorithmCount} algorithms`,
            });
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : 'Failed to fetch analysis';
            setError(errorMessage);
            toast({
                title: 'Analysis failed',
                description: errorMessage,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleLoadPreviousSeason = async (year: number) => {
        if (!farm || !farmId) return;

        setLoadingPreviousSeason(true);

        try {
            // Calculate dates for previous year
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);
            startDate.setFullYear(year);
            endDate.setFullYear(year);

            const response = await advancedMonitoringService.fetchAnalysis({
                polygon: farm.geometry,
                farmId: farmId,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                algorithms: selectedAlgorithms,
                includeTrends: false, // Don't need trends for comparison
                aggregationLevel: 'grid',
                windowSizeDays: 10,
            });

            setPreviousSeasonData({
                year,
                timeseries: response.timeseries,
            });

            toast({
                title: 'Previous season loaded',
                description: `Data for ${year} loaded successfully`,
            });
        } catch (err) {
            toast({
                title: 'Failed to load previous season',
                description: err instanceof Error ? err.message : 'Unknown error',
                variant: 'destructive',
            });
        } finally {
            setLoadingPreviousSeason(false);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="w-8 h-8 text-accent" />
                    <div>
                        <h1 className="text-3xl font-bold">Advanced Monitoring</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Multi-sensor fusion and trend analysis for high-temporal-resolution insights
                        </p>
                        {farm && (
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                    {farm.name}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                    {farm.area_hectares.toFixed(2)} ha
                                </Badge>
                                {analysisData?.cached && (
                                    <Badge variant="secondary" className="text-xs">
                                        Cached
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <ExportDataButton
                    timeseries={analysisData?.timeseries || []}
                    trends={analysisData?.trends || []}
                    farmName={farm?.name}
                    disabled={loading || !analysisData}
                />
            </div>

            {/* No Farm Warning */}
            {!farmLoading && !farm && (
                <Card className="border-yellow-500 bg-yellow-50">
                    <CardContent className="flex items-center gap-3 p-4">
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                        <div>
                            <p className="font-semibold text-yellow-900">No farm found</p>
                            <p className="text-sm text-yellow-700">
                                Please create a farm first to use Advanced Monitoring
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Configuration Panel */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Analysis Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Algorithm Selector */}
                        <div className="space-y-2">
                            <AlgorithmSelector
                                selectedAlgorithms={selectedAlgorithms}
                                onChange={setSelectedAlgorithms}
                            />
                        </div>

                        {/* Date Range Picker */}
                        <div className="space-y-2">
                            <DateRangePicker
                                startDate={dateRange.start}
                                endDate={dateRange.end}
                                onChange={setDateRange}
                            />
                        </div>
                    </div>

                    {/* Analyze Button */}
                    <div className="flex justify-end pt-4 border-t">
                        <Button
                            onClick={handleAnalyze}
                            disabled={selectedAlgorithms.length === 0 || loading}
                            className="flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Activity className="w-4 h-4" />
                                    Run Analysis
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Time Series Chart */}
            {analysisData && analysisData.timeseries.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Time Series Analysis</CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    10-day window aggregations • Multi-sensor fusion
                                </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {analysisData.timeseries.length} algorithm{analysisData.timeseries.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <TimeSeriesChart
                            timeseries={analysisData.timeseries}
                            loading={loading}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Trend Analysis Statistics */}
            {analysisData && analysisData.trends.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold">Trend Analysis</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Theil-Sen robust trend estimation with Mann-Kendall significance testing
                            </p>
                        </div>
                    </div>
                    <TrendStatCards trends={analysisData.trends} loading={loading} />
                </div>
            )}

            {/* Spatial Trend Map */}
            {analysisData && analysisData.trends.length > 0 && farm && (
                <TrendMap
                    trends={analysisData.trends}
                    farmPolygon={farm.geometry}
                />
            )}

            {/* Advanced Features Section */}
            {analysisData && farm && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">Advanced Features</h2>
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => setShowAlertConfig(!showAlertConfig)}
                                variant={showAlertConfig ? 'default' : 'outline'}
                                size="sm"
                            >
                                Alert Thresholds
                            </Button>
                            <Button
                                onClick={() => setShowSeasonalComparison(!showSeasonalComparison)}
                                variant={showSeasonalComparison ? 'default' : 'outline'}
                                size="sm"
                            >
                                Seasonal Comparison
                            </Button>
                        </div>
                    </div>

                    {/* Alert Threshold Configuration */}
                    {showAlertConfig && (
                        <AlertThresholdConfig
                            thresholds={alertThresholds}
                            onChange={setAlertThresholds}
                        />
                    )}

                    {/* Seasonal Comparison */}
                    {showSeasonalComparison && selectedAlgorithms.length > 0 && (
                        <SeasonalComparison
                            currentSeason={{
                                year: new Date(dateRange.end).getFullYear(),
                                timeseries: analysisData.timeseries,
                                label: 'Current',
                            }}
                            previousSeason={previousSeasonData}
                            algorithm={selectedAlgorithms[0]}
                            loading={loadingPreviousSeason}
                            onLoadPreviousSeason={handleLoadPreviousSeason}
                        />
                    )}
                </div>
            )}

            {/* Empty State - No Analysis Yet */}
            {!analysisData && !loading && farm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Analysis Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg bg-muted/20">
                            <div className="text-center">
                                <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                <p className="text-muted-foreground">
                                    Configure your analysis and click "Run Analysis" to begin
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Select algorithms, date range, then run the analysis
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Error State */}
            {error && !loading && (
                <Card className="border-red-500 bg-red-50">
                    <CardContent className="flex items-center gap-3 p-4">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <div>
                            <p className="font-semibold text-red-900">Analysis Error</p>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
