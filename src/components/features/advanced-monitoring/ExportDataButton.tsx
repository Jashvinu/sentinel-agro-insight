import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { AlgorithmTimeSeries, TrendAnalysis } from '@/types/advancedMonitoring';
import { ALGORITHM_CONFIGS } from '@/constants';

interface ExportDataButtonProps {
    timeseries: AlgorithmTimeSeries[];
    trends?: TrendAnalysis[];
    farmName?: string;
    disabled?: boolean;
}

/**
 * Generate CSV content from time series and trend data
 */
function generateCSV(
    timeseries: AlgorithmTimeSeries[],
    trends?: TrendAnalysis[]
): string {
    const lines: string[] = [];

    // CSV Header
    lines.push('=== Advanced Monitoring Data Export ===');
    lines.push(`Export Date: ${new Date().toISOString()}`);
    lines.push('');

    // Time Series Data
    lines.push('=== TIME SERIES DATA ===');
    lines.push('');

    for (const series of timeseries) {
        const config = ALGORITHM_CONFIGS[series.algorithm as keyof typeof ALGORITHM_CONFIGS];

        lines.push(`Algorithm: ${config?.label || series.algorithm}`);
        lines.push(
            'Window Start,Window End,Mean Value,Std Dev,Min,Max,Pixel Count,Cloud Cover,Sensors'
        );

        for (const window of series.windows) {
            lines.push(
                [
                    window.startDate,
                    window.endDate,
                    window.mean.toFixed(4),
                    window.stdDev?.toFixed(4) || 'N/A',
                    window.min?.toFixed(4) || 'N/A',
                    window.max?.toFixed(4) || 'N/A',
                    window.pixelCount || 'N/A',
                    window.cloudCover?.toFixed(2) || 'N/A',
                    (window.sensors || []).join('+'),
                ].join(',')
            );
        }

        lines.push('');
    }

    // Trend Analysis Data
    if (trends && trends.length > 0) {
        lines.push('=== TREND ANALYSIS ===');
        lines.push('');

        lines.push(
            'Algorithm,Theil-Sen Slope,Trend Direction,P-Value,R²,CI Low,CI High,Window Count,Start Date,End Date'
        );

        for (const trend of trends) {
            const config = ALGORITHM_CONFIGS[trend.algorithm as keyof typeof ALGORITHM_CONFIGS];

            lines.push(
                [
                    config?.label || trend.algorithm,
                    trend.theilsen_slope.toFixed(6),
                    trend.trend_direction,
                    trend.p_value.toFixed(4),
                    (trend.r_squared * 100).toFixed(2) + '%',
                    trend.confidence_interval_low?.toFixed(6) || 'N/A',
                    trend.confidence_interval_high?.toFixed(6) || 'N/A',
                    trend.window_count,
                    trend.analysis_start_date,
                    trend.analysis_end_date,
                ].join(',')
            );
        }

        lines.push('');
    }

    // Statistics Summary
    lines.push('=== STATISTICS SUMMARY ===');
    lines.push('');

    for (const series of timeseries) {
        const config = ALGORITHM_CONFIGS[series.algorithm as keyof typeof ALGORITHM_CONFIGS];
        const values = series.windows.map((w) => w.mean);

        if (values.length > 0) {
            const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
            const sortedValues = [...values].sort((a, b) => a - b);
            const median =
                sortedValues.length % 2 === 0
                    ? (sortedValues[sortedValues.length / 2 - 1] +
                          sortedValues[sortedValues.length / 2]) /
                      2
                    : sortedValues[Math.floor(sortedValues.length / 2)];
            const min = Math.min(...values);
            const max = Math.max(...values);
            const variance =
                values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);

            lines.push(`${config?.label || series.algorithm}:`);
            lines.push(`  Mean: ${mean.toFixed(4)}`);
            lines.push(`  Median: ${median.toFixed(4)}`);
            lines.push(`  Std Dev: ${stdDev.toFixed(4)}`);
            lines.push(`  Min: ${min.toFixed(4)}`);
            lines.push(`  Max: ${max.toFixed(4)}`);
            lines.push(`  Range: ${(max - min).toFixed(4)}`);
            lines.push(`  Data Points: ${values.length}`);
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Trigger CSV download in browser
 */
function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        // Create download link
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup
        URL.revokeObjectURL(url);
    }
}

/**
 * Export button component
 */
export const ExportDataButton: React.FC<ExportDataButtonProps> = ({
    timeseries,
    trends,
    farmName,
    disabled,
}) => {
    const handleExport = () => {
        if (timeseries.length === 0) {
            return;
        }

        // Generate CSV content
        const csvContent = generateCSV(timeseries, trends);

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const farmPrefix = farmName ? `${farmName.replace(/\s+/g, '_')}_` : '';
        const filename = `${farmPrefix}advanced_monitoring_${timestamp}.csv`;

        // Trigger download
        downloadCSV(csvContent, filename);
    };

    const hasData = timeseries.length > 0 && timeseries.some((s) => s.windows.length > 0);

    return (
        <Button
            onClick={handleExport}
            disabled={disabled || !hasData}
            variant="outline"
            className="flex items-center gap-2"
        >
            <Download className="w-4 h-4" />
            Export to CSV
        </Button>
    );
};
