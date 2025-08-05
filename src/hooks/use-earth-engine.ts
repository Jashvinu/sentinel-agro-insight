import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface EarthEngineData {
  mean: number;
  max: number;
  min: number;
  stdDev: number;
  cloudCover: number;
  date: number;
}

interface UseEarthEngineReturn {
  data: EarthEngineData | null;
  loading: boolean;
  error: string | null;
  fetchData: (polygon: number[][], startDate: string, endDate: string, index: string) => Promise<void>;
}

export const useEarthEngine = (): UseEarthEngineReturn => {
  const [data, setData] = useState<EarthEngineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async (
    polygon: number[][],
    startDate: string,
    endDate: string,
    index: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/functions/v1/earth-engine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          polygon,
          startDate,
          endDate,
          index
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Earth Engine data');
      }

      const result = await response.json();
      setData(result);
      
      toast({
        title: "Satellite data updated",
        description: `Retrieved ${index} data from Google Earth Engine`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      toast({
        title: "Error fetching satellite data",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return {
    data,
    loading,
    error,
    fetchData,
  };
};