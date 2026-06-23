import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';

export interface WeatherData {
  hourly: {
    time: Date[];
    temperature_2m: Float32Array;
    rain: Float32Array;
    precipitation: Float32Array;
    apparent_temperature: Float32Array;
    snowfall: Float32Array;
    wind_speed_10m: Float32Array;
    cloud_cover: Float32Array;
    weather_code: Float32Array;
  };
  location: {
    latitude: number;
    longitude: number;
    elevation: number;
    utcOffsetSeconds: number;
  };
}

interface WeatherApiPayload {
  data?: {
    hourly: {
      time: string[];
      temperature_2m: number[];
      rain: number[];
      precipitation: number[];
      apparent_temperature: number[];
      snowfall: number[];
      wind_speed_10m: number[];
      cloud_cover: number[];
      weather_code: number[];
    };
    location: WeatherData['location'];
  };
}

interface UseWeatherReturn {
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
  fetchWeather: (latitude: number, longitude: number, startDate?: string, endDate?: string) => Promise<void>;
}

export const useWeather = (): UseWeatherReturn => {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchWeather = useCallback(async (
    latitude: number,
    longitude: number,
    startDate?: string,
    endDate?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      // Default to next 7 days if no dates provided
      const start = startDate || new Date().toISOString().split('T')[0];
      const end = endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        start_date: start,
        end_date: end,
      });

      const response = await fetch(buildApiUrl(`/weather?${params}`), {
        headers: {
          ...getSupabaseFunctionHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(`Weather API failed: ${response.status} ${await response.text()}`);
      }

      const payload = (await response.json()) as WeatherApiPayload;
      const remote = payload.data;
      if (!remote) {
        throw new Error('Weather API returned no data payload.');
      }

      // Process weather data
      const weatherData: WeatherData = {
        hourly: {
          time: remote.hourly.time.map((value) => new Date(value)),
          temperature_2m: new Float32Array(remote.hourly.temperature_2m),
          rain: new Float32Array(remote.hourly.rain),
          precipitation: new Float32Array(remote.hourly.precipitation),
          apparent_temperature: new Float32Array(remote.hourly.apparent_temperature),
          snowfall: new Float32Array(remote.hourly.snowfall),
          wind_speed_10m: new Float32Array(remote.hourly.wind_speed_10m),
          cloud_cover: new Float32Array(remote.hourly.cloud_cover),
          weather_code: new Float32Array(remote.hourly.weather_code),
        },
        location: remote.location,
      };

      setData(weatherData);
      
      toast({
        title: "Weather data updated",
        description: `Retrieved forecast for ${remote.location.latitude.toFixed(2)}°N ${remote.location.longitude.toFixed(2)}°E`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch weather data';
      setError(errorMessage);
      
      toast({
        title: "Error fetching weather data",
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
    fetchWeather,
  };
};
