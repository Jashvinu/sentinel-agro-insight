import React, { useState, useEffect } from 'react';
import { TimeSeriesChart } from '../advanced-monitoring/TimeSeriesChart';
import { Loader2, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';
import { toast } from 'sonner';
import type { AlgorithmTimeSeries } from '@/types/advancedMonitoring';

interface TimeSeriesPanelProps {
  farmId: string;
  algorithm: string;
  farmGeometry: any;
  dateRange: { start: string; end: string };
}

export const TimeSeriesPanel: React.FC<TimeSeriesPanelProps> = ({
  farmId,
  algorithm,
  farmGeometry,
  dateRange
}) => {
  const [data, setData] = useState<AlgorithmTimeSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeSeries = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiUrl = `agricultural-indices?index=${algorithm}&polygon=${encodeURIComponent(
        JSON.stringify(farmGeometry)
      )}&start=${dateRange.start}&end=${dateRange.end}&timeseries=true&farmId=${farmId}`;

      const headers = getSupabaseFunctionHeaders();
      const response = await fetch(buildApiUrl(apiUrl), {
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch time series: ${response.statusText}`);
      }

      const result = await response.json();

      // Check for errors in response
      if (result.error) {
        throw new Error(result.error);
      }

      // Validate response has windows
      if (!result.windows || !Array.isArray(result.windows)) {
        console.error('Invalid API response:', result);
        throw new Error('Invalid response format from API');
      }

      // Transform to AlgorithmTimeSeries format
      const timeSeries: AlgorithmTimeSeries = {
        algorithm: result.algorithm,
        windows: result.windows.map((w: any) => ({
          startDate: w.startDate,
          endDate: w.endDate,
          mean: w.mean,
          stdDev: w.stdDev,
          min: w.min,
          max: w.max,
          pixelCount: 0, // Not provided by API
          cloudCover: w.cloudCover || 0,
          sensors: w.sensors
        }))
      };

      setData(timeSeries);

      if (result.metadata?.cached) {
        toast.success('Loaded from cache', { duration: 2000 });
      }
    } catch (err: any) {
      console.error('Error fetching time series:', err);
      setError(err.message || 'Failed to load time series data');
      toast.error('Failed to load historical trends', {
        description: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeSeries();
  }, [farmId, algorithm, dateRange.start, dateRange.end]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {dateRange.start} to {dateRange.end}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTimeSeries}
          disabled={loading}
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="h-80 flex items-center justify-center border border-dashed border-border rounded-lg">
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading historical trends...</p>
          </div>
        </div>
      ) : error ? (
        <div className="h-80 flex items-center justify-center border border-dashed border-destructive/50 rounded-lg bg-destructive/5">
          <div className="text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchTimeSeries}>
              Try Again
            </Button>
          </div>
        </div>
      ) : data && data.windows.length > 0 ? (
        <div className="border border-border rounded-lg p-4 bg-card">
          <TimeSeriesChart timeseries={[data]} loading={false} />
        </div>
      ) : (
        <div className="h-80 flex items-center justify-center border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">No historical data available</p>
        </div>
      )}
    </div>
  );
};
