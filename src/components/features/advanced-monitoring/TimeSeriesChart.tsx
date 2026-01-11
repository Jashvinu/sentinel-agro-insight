import React from 'react';
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
import { Loader2 } from 'lucide-react';
import type { AlgorithmTimeSeries, ChartDataPoint } from '@/types/advancedMonitoring';
import { ALGORITHM_CONFIGS, TIMESERIES_ALGORITHM_COLORS } from '@/constants';

interface TimeSeriesChartProps {
    timeseries: AlgorithmTimeSeries[];
    loading?: boolean;
}

/**
 * Transform time series data for Recharts format
 * Combines multiple algorithm series into a single array of data points
 */
function transformTimeSeriesForChart(timeseries: AlgorithmTimeSeries[]): ChartDataPoint[] {
    if (!timeseries || timeseries.length === 0) {
        return [];
    }

    // Create a map of dates to values for all algorithms
    const dateMap = new Map<string, ChartDataPoint>();

    timeseries.forEach((series) => {
        series.windows.forEach((window) => {
            const dateKey = window.startDate; // Use start date as key

            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, {
                    date: dateKey,
                });
            }

            const dataPoint = dateMap.get(dateKey)!;
            dataPoint[series.algorithm] = window.mean;
        });
    });

    // Convert map to array and sort by date
    return Array.from(dateMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
}

/**
 * Custom tooltip component for rich data display
 */
const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || !payload.length) {
        return null;
    }

    return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
            <p className="text-sm font-semibold mb-2">
                {new Date(label).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                })}
            </p>
            <div className="space-y-1">
                {payload.map((entry, index) => {
                    const algorithmId = entry.dataKey as string;
                    const config = ALGORITHM_CONFIGS[algorithmId as keyof typeof ALGORITHM_CONFIGS] || {
                        label: algorithmId.toUpperCase(),
                        unit: getIndexUnit(algorithmId),
                        color: TIMESERIES_ALGORITHM_COLORS[algorithmId] || '#6b7280'
                    };

                    if (!config) return null;

                    return (
                        <div key={index} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-xs text-muted-foreground">
                                    {config.label}
                                </span>
                            </div>
                            <span className="text-xs font-semibold">
                                {typeof entry.value === 'number'
                                    ? entry.value.toFixed(3)
                                    : '--'}{' '}
                                {config.unit}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ timeseries, loading }) => {
    if (loading) {
        return (
            <div className="h-96 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!timeseries || timeseries.length === 0) {
        return (
            <div className="h-96 flex items-center justify-center border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No data available</p>
            </div>
        );
    }

    const chartData = transformTimeSeriesForChart(timeseries);

    if (chartData.length === 0) {
        return (
            <div className="h-96 flex items-center justify-center border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No time series data to display</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <ResponsiveContainer width="100%" height={400}>
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(date) =>
                            new Date(date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                            })
                        }
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        label={{
                            value: 'Value',
                            angle: -90,
                            position: 'insideLeft',
                            style: { fill: 'hsl(var(--muted-foreground))' },
                        }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => {
                            const config = ALGORITHM_CONFIGS[value as keyof typeof ALGORITHM_CONFIGS];
                            return (
                                <span className="text-xs text-muted-foreground">
                                    {config?.label || value}
                                </span>
                            );
                        }}
                    />
                    {timeseries.map((series) => {
                        const config = ALGORITHM_CONFIGS[series.algorithm];
                        return (
                            <Line
                                key={series.algorithm}
                                type="monotone"
                                dataKey={series.algorithm}
                                stroke={config.color}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                name={series.algorithm}
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>

            {/* Chart Info */}
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{chartData.length} data points</span>
                <span>
                    {new Date(chartData[0].date).toLocaleDateString()} -{' '}
                    {new Date(chartData[chartData.length - 1].date).toLocaleDateString()}
                </span>
            </div>
        </div>
    );
};

/**
 * Get unit for agricultural index
 * Helper function for fallback config when algorithm not in ALGORITHM_CONFIGS
 */
function getIndexUnit(algorithm: string): string {
    const units: Record<string, string> = {
        // Vegetation indices
        ndvi: 'Index',
        evi: 'Index',
        savi: 'Index',
        msavi: 'Index',
        gndvi: 'Index',
        ndre: 'Index',
        // NPK nutrients
        nitrogen: 'kg N/ha',
        phosphorus: 'kg P₂O₅/ha',
        potassium: 'kg K₂O/ha',
        // Water indices
        ndwi: 'Index',
        moisture: '%',
    };
    return units[algorithm] || '';
}
