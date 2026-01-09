import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import type { TrendAnalysis } from '@/types/advancedMonitoring';
import { ALGORITHM_CONFIGS } from '@/constants';

interface TrendStatCardsProps {
    trends: TrendAnalysis[];
    loading?: boolean;
}

/**
 * Get trend direction icon and color
 */
function getTrendIndicator(direction: TrendAnalysis['trendDirection']) {
    switch (direction) {
        case 'Increasing':
            return {
                icon: TrendingUp,
                color: 'text-green-500',
                bgColor: 'bg-green-50',
                label: 'Increasing',
            };
        case 'Decreasing':
            return {
                icon: TrendingDown,
                color: 'text-red-500',
                bgColor: 'bg-red-50',
                label: 'Decreasing',
            };
        case 'Stable':
            return {
                icon: Minus,
                color: 'text-gray-500',
                bgColor: 'bg-gray-50',
                label: 'Stable',
            };
        default:
            return {
                icon: Minus,
                color: 'text-gray-500',
                bgColor: 'bg-gray-50',
                label: 'Unknown',
            };
    }
}

/**
 * Determine statistical significance from p-value
 */
function getSignificanceBadge(pValue: number) {
    if (pValue < 0.01) {
        return <Badge variant="default" className="bg-green-600">Highly Significant (p &lt; 0.01)</Badge>;
    } else if (pValue < 0.05) {
        return <Badge variant="default" className="bg-green-500">Significant (p &lt; 0.05)</Badge>;
    } else if (pValue < 0.1) {
        return <Badge variant="secondary">Marginally Significant (p &lt; 0.1)</Badge>;
    } else {
        return <Badge variant="outline" className="text-muted-foreground">Not Significant (p ≥ 0.1)</Badge>;
    }
}

/**
 * Format slope value with appropriate precision and unit
 */
function formatSlope(slope: number, algorithm: string): string {
    const config = ALGORITHM_CONFIGS[algorithm as keyof typeof ALGORITHM_CONFIGS];
    const unit = config?.unit || '';

    // Convert to percentage change per day
    const percentChange = slope * 100;

    if (Math.abs(percentChange) < 0.01) {
        return `${percentChange.toFixed(4)}% / day`;
    } else if (Math.abs(percentChange) < 1) {
        return `${percentChange.toFixed(3)}% / day`;
    } else {
        return `${percentChange.toFixed(2)}% / day`;
    }
}

/**
 * Individual trend stat card for one algorithm
 */
const TrendStatCard: React.FC<{ trend: TrendAnalysis }> = ({ trend }) => {
    const algorithmConfig = ALGORITHM_CONFIGS[trend.algorithm as keyof typeof ALGORITHM_CONFIGS];
    const trendIndicator = getTrendIndicator(trend.trendDirection);
    const TrendIcon = trendIndicator.icon;

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                        {algorithmConfig?.label || trend.algorithm}
                    </CardTitle>
                    <div className={`p-2 rounded-full ${trendIndicator.bgColor}`}>
                        <TrendIcon className={`w-5 h-5 ${trendIndicator.color}`} />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {algorithmConfig?.description || ''}
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Trend Direction */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Trend Direction</span>
                    <Badge
                        variant="outline"
                        className={`${trendIndicator.color} border-current`}
                    >
                        {trendIndicator.label}
                    </Badge>
                </div>

                {/* Slope */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Theil-Sen Slope</span>
                        <span className="text-sm font-semibold">
                            {formatSlope(trend.theilsenSlope, trend.algorithm)}
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        CI: [{trend.confidenceIntervalLow?.toFixed(4) || 'N/A'}, {trend.confidenceIntervalHigh?.toFixed(4) || 'N/A'}]
                    </div>
                </div>

                {/* Statistical Significance */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Mann-Kendall p-value</span>
                        <span className="text-sm font-mono">{trend.pValue.toFixed(4)}</span>
                    </div>
                    {getSignificanceBadge(trend.pValue)}
                </div>

                {/* Goodness of Fit (R²) */}
                {trend.rSquared !== null && trend.rSquared !== undefined && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">R² (Fit Quality)</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                                {(trend.rSquared * 100).toFixed(1)}%
                            </span>
                            {trend.rSquared < 0.3 && (
                                <AlertCircle className="w-4 h-4 text-yellow-500" title="Low fit quality" />
                            )}
                        </div>
                    </div>
                )}

                {/* Date Range */}
                <div className="pt-2 border-t text-xs text-muted-foreground">
                    {new Date(trend.analysis_start_date).toLocaleDateString()} -{' '}
                    {new Date(trend.analysis_end_date).toLocaleDateString()}
                    {' • '}
                    {trend.windowCount} windows
                </div>
            </CardContent>
        </Card>
    );
};

/**
 * Grid of trend stat cards
 */
export const TrendStatCards: React.FC<TrendStatCardsProps> = ({ trends, loading }) => {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse">
                        <CardHeader>
                            <div className="h-5 bg-muted rounded w-3/4"></div>
                            <div className="h-3 bg-muted rounded w-full mt-2"></div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="h-4 bg-muted rounded w-full"></div>
                                <div className="h-4 bg-muted rounded w-2/3"></div>
                                <div className="h-4 bg-muted rounded w-1/2"></div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (!trends || trends.length === 0) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-48">
                    <div className="text-center">
                        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">No trend analysis data available</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Run analysis with at least 3 time windows (30+ days)
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trends.map((trend) => (
                <TrendStatCard key={`${trend.algorithm}-${trend.id}`} trend={trend} />
            ))}
        </div>
    );
};
