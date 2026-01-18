import { buildApiUrl, getSupabaseFunctionHeaders } from './api';
import type {
    AdvancedMonitoringRequest,
    AdvancedMonitoringResponse,
    Algorithm,
    AlgorithmTimeSeries,
    TrendAnalysis,
} from '@/types/advancedMonitoring';

/**
 * Service for Advanced Monitoring features
 * Handles communication with backend edge functions for multi-sensor fusion,
 * soil parameter retrieval, and trend analysis
 */
export const advancedMonitoringService = {
    /**
     * Fetch complete analysis including time series and trends
     * @param request Analysis configuration
     * @returns Promise with timeseries, trends, and maps
     */
    async fetchAnalysis(
        request: AdvancedMonitoringRequest
    ): Promise<AdvancedMonitoringResponse> {
        const url = buildApiUrl('/advanced-monitoring');

        // Check if using local server (localhost or 127.0.0.1)
        const isLocalServer = url.includes('localhost') || url.includes('127.0.0.1');

        // Only include Supabase headers if not using local server
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (!isLocalServer) {
            Object.assign(headers, getSupabaseFunctionHeaders());
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
            throw new Error(error.error?.message || 'Failed to fetch analysis');
        }

        const result = await response.json();

        // Validate response structure - data can be at root level or nested in 'data' property
        if (!result.success) {
            throw new Error('Invalid response format from server');
        }

        // Handle both response formats:
        // 1. { success, data: { timeseries, trends, metadata } }
        // 2. { success, timeseries, trends, maps, metadata }
        if (result.data) {
            return result.data;
        }

        // Extract data from root level response
        return {
            timeseries: result.timeseries || [],
            trends: result.trends || [],
            maps: result.maps || {},
            metadata: result.metadata,
        };
    },

};
