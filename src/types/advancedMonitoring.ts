import type { LucideIcon } from 'lucide-react';

export type Algorithm =
    | 'optram_moisture'
    | 'sar_moisture_change'
    | 'sar_moisture_fusion'
    | 'pca_phosphorus'
    | 'pca_potassium'
    | 'nitrogen_gndvi'
    | 'nitrogen_ndre';

export interface AlgorithmConfig {
    id: Algorithm;
    label: string;
    description: string;
    unit: string;
    category: 'moisture' | 'nutrients';
    color: string; // Chart line color
    icon: LucideIcon;
}

export interface TimeSeriesWindow {
    startDate: string;
    endDate: string;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    pixelCount: number;
    cloudCover: number;
    sensors: string[];
}

export interface AlgorithmTimeSeries {
    algorithm: Algorithm;
    windows: TimeSeriesWindow[];
}

export interface TrendAnalysis {
    id?: string;
    farm_id?: string;
    algorithm: Algorithm;
    theilsenSlope: number;
    confidenceIntervalLow: number;
    confidenceIntervalHigh: number;
    trendDirection: 'Increasing' | 'Decreasing' | 'Stable';
    pValue: number;
    rSquared: number;
    analysis_start_date: string;
    analysis_end_date: string;
    windowCount: number;
    created_at?: string;
}

export interface TrendMapLayer {
    mapId: string;
    token: string;
    urlFormat: string;
    visualization: {
        palette: string[];
        min: number;
        max: number;
    };
}

export interface AdvancedMonitoringResponse {
    timeseries: AlgorithmTimeSeries[];
    trends?: TrendAnalysis[];
    maps?: Record<string, {
        urlFormat: string;
        mapid: string;
        token: string;
    }>;
    metadata: {
        farmId: string;
        dateRange: { start: string; end: string };
        windowCount: number;
        windowSizeDays: number;
        algorithmCount: number;
        aggregationLevel: string;
        processingDate: string;
        imageCount?: number;
        cached?: boolean;
    };
}

export interface AdvancedMonitoringRequest {
    polygon: GeoJSON.Geometry;
    farmId: string;
    startDate: string;
    endDate: string;
    algorithms: Algorithm[];
    includeTrends?: boolean;
    aggregationLevel?: 'pixel' | 'grid' | 'zone';
    windowSizeDays?: number;
}

export type AggregationLevel = 'pixel' | 'grid' | 'zone';

export interface ChartDataPoint {
    date: string;
    [key: string]: number | string; // Algorithm values keyed by algorithm ID
}
