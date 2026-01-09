import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Calendar,
    TrendingUp,
    TrendingDown,
    ArrowRight,
    RefreshCw,
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    TooltipProps,
} from 'recharts';
import { ALGORITHM_CONFIGS } from '@/constants';
import type { Algorithm, AlgorithmTimeSeries } from '@/types/advancedMonitoring';

interface SeasonalComparisonProps {
    currentSeason: {
        year: number;
        timeseries: AlgorithmTimeSeries[];
        label?: string;
    };
    previousSeason?: {
        year: number;
        timeseries: AlgorithmTimeSeries[];
        label?: string;
    };
    algorithm: Algorithm;
    loading?: boolean;
    onLoadPreviousSeason?: (year: number) => void;
}

interface ComparisonDataPoint {
    dayOfYear: number;
    date: string;
    current?: number;
    previous?: number;
    difference?: number;
}

/**
 * Convert date to day of year (1-365/366)
 */
function getDayOfYear(dateString: string): number {
    const date = new Date(dateString);
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

/**
 * Calculate comparison statistics
 */
function calculateComparisonStats(currentData: number[], previousData: number[]) {
    if (currentData.length === 0 || previousData.length === 0) {
        return null;
    }

    const currentMean = currentData.reduce((sum, v) => sum + v, 0) / currentData.length;
    const previousMean = previousData.reduce((sum, v) => sum + v, 0) / previousData.length;
    const percentChange = ((currentMean - previousMean) / previousMean) * 100;

    const currentMax = Math.max(...currentData);
    const previousMax = Math.max(...previousData);

    const currentMin = Math.min(...currentData);
    const previousMin = Math.min(...previousData);

    return {
        currentMean,
        previousMean,
        percentChange,
        currentMax,
        previousMax,
        currentMin,
        previousMin,
    };
}

/**
 * Custom tooltip for seasonal comparison
 */
const ComparisonTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || !payload.length) {
        return null;
    }

    return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
            <p className="text-sm font-semibold mb-2">Day {label}</p>
            <div className="space-y-1">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-xs text-muted-foreground">
                                {entry.name}
                            </span>
                        </div>
                        <span className="text-xs font-semibold">
                            {typeof entry.value === 'number'
                                ? entry.value.toFixed(3)
                                : '--'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SeasonalComparison: React.FC<SeasonalComparisonProps> = ({
    currentSeason,
    previousSeason,
    algorithm,
    loading,
    onLoadPreviousSeason,
}) => {
    const algorithmConfig = ALGORITHM_CONFIGS[algorithm];

    // Transform data for comparison
    const comparisonData = useMemo(() => {
        const currentSeries = currentSeason.timeseries.find((s) => s.algorithm === algorithm);
        const previousSeries = previousSeason?.timeseries.find((s) => s.algorithm === algorithm);

        if (!currentSeries) return [];

        const dataPoints = new Map<number, ComparisonDataPoint>();

        // Add current season data
        currentSeries.windows.forEach((window) => {
            const dayOfYear = getDayOfYear(window.startDate);
            dataPoints.set(dayOfYear, {
                dayOfYear,
                date: window.startDate,
                current: window.mean,
            });
        });

        // Add previous season data
        if (previousSeries) {
            previousSeries.windows.forEach((window) => {
                const dayOfYear = getDayOfYear(window.startDate);
                const existing = dataPoints.get(dayOfYear);

                if (existing) {
                    existing.previous = window.mean;
                    existing.difference = existing.current !== undefined
                        ? existing.current - window.mean
                        : undefined;
                } else {
                    dataPoints.set(dayOfYear, {
                        dayOfYear,
                        date: window.startDate,
                        previous: window.mean,
                    });
                }
            });
        }

        return Array.from(dataPoints.values()).sort((a, b) => a.dayOfYear - b.dayOfYear);
    }, [currentSeason, previousSeason, algorithm]);

    // Calculate statistics
    const stats = useMemo(() => {
        const currentValues = comparisonData
            .filter((d) => d.current !== undefined)
            .map((d) => d.current!);
        const previousValues = comparisonData
            .filter((d) => d.previous !== undefined)
            .map((d) => d.previous!);

        return calculateComparisonStats(currentValues, previousValues);
    }, [comparisonData]);

    const handleLoadPreviousYear = () => {
        if (onLoadPreviousSeason) {
            onLoadPreviousSeason(currentSeason.year - 1);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        <div>
                            <CardTitle className="text-lg">Seasonal Comparison</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                {algorithmConfig?.label || algorithm}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {previousSeason && stats && (
                            <Badge
                                variant={
                                    stats.percentChange > 5
                                        ? 'default'
                                        : stats.percentChange < -5
                                        ? 'destructive'
                                        : 'secondary'
                                }
                                className="flex items-center gap-1"
                            >
                                {stats.percentChange > 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                ) : (
                                    <TrendingDown className="w-3 h-3" />
                                )}
                                {Math.abs(stats.percentChange).toFixed(1)}%
                            </Badge>
                        )}
                        {!previousSeason && onLoadPreviousSeason && (
                            <Button
                                onClick={handleLoadPreviousYear}
                                disabled={loading}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        <Calendar className="w-4 h-4" />
                                        Load {currentSeason.year - 1}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Comparison Chart */}
                {comparisonData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="dayOfYear"
                                className="text-xs"
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                label={{
                                    value: 'Day of Year',
                                    position: 'insideBottom',
                                    offset: -5,
                                    style: { fill: 'hsl(var(--muted-foreground))' },
                                }}
                            />
                            <YAxis
                                className="text-xs"
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                label={{
                                    value: algorithmConfig?.unit || 'Value',
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fill: 'hsl(var(--muted-foreground))' },
                                }}
                            />
                            <Tooltip content={<ComparisonTooltip />} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Line
                                type="monotone"
                                dataKey="current"
                                stroke={algorithmConfig?.color || '#3b82f6'}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                name={`${currentSeason.year} ${currentSeason.label || 'Current'}`}
                            />
                            {previousSeason && (
                                <Line
                                    type="monotone"
                                    dataKey="previous"
                                    stroke="#9ca3af"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={{ r: 3 }}
                                    activeDot={{ r: 5 }}
                                    name={`${previousSeason.year} ${previousSeason.label || 'Previous'}`}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[350px] flex items-center justify-center border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">No comparison data available</p>
                    </div>
                )}

                {/* Statistics Summary */}
                {previousSeason && stats && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                        <div>
                            <div className="text-xs text-muted-foreground">Mean Change</div>
                            <div className="text-sm font-semibold flex items-center gap-1">
                                {stats.percentChange > 0 ? (
                                    <TrendingUp className="w-3 h-3 text-green-600" />
                                ) : (
                                    <TrendingDown className="w-3 h-3 text-red-600" />
                                )}
                                {stats.percentChange.toFixed(1)}%
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Current Mean</div>
                            <div className="text-sm font-semibold">
                                {stats.currentMean.toFixed(3)} {algorithmConfig?.unit}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Previous Mean</div>
                            <div className="text-sm font-semibold">
                                {stats.previousMean.toFixed(3)} {algorithmConfig?.unit}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Difference</div>
                            <div className="text-sm font-semibold">
                                {(stats.currentMean - stats.previousMean).toFixed(3)}{' '}
                                {algorithmConfig?.unit}
                            </div>
                        </div>
                    </div>
                )}

                {/* Season Labels */}
                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: algorithmConfig?.color || '#3b82f6' }}
                        />
                        <span>{currentSeason.year} {currentSeason.label || 'Current Season'}</span>
                    </div>
                    {previousSeason && (
                        <>
                            <ArrowRight className="w-4 h-4" />
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded bg-gray-400" />
                                <span>{previousSeason.year} {previousSeason.label || 'Previous Season'}</span>
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
