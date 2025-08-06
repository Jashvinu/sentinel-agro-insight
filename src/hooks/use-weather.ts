import { useState, useCallback } from 'react';
import { fetchWeatherApi } from 'openmeteo';
import { useToast } from '@/hooks/use-toast';

interface WeatherData {
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

      const params = {
        latitude,
        longitude,
        hourly: [
          "temperature_2m", 
          "precipitation", 
          "apparent_temperature", 
          "wind_speed_10m", 
          "cloud_cover", 
          "weather_code"
        ],
        start_date: start,
        end_date: end,
      };

      const url = "https://api.open-meteo.com/v1/forecast";
      const responses = await fetchWeatherApi(url, params);

      // Process first location
      const response = responses[0];

      // Get location attributes
      const responseLatitude = response.latitude();
      const responseLongitude = response.longitude();
      const elevation = response.elevation();
      const utcOffsetSeconds = response.utcOffsetSeconds();

      const hourly = response.hourly()!;

      // Process weather data
      const weatherData: WeatherData = {
        hourly: {
          time: [...Array((Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval())].map(
            (_, i) => new Date((Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds) * 1000)
          ),
          temperature_2m: hourly.variables(0)!.valuesArray(),
          rain: hourly.variables(1)!.valuesArray(), // Using precipitation data
          precipitation: hourly.variables(1)!.valuesArray(), // Same as rain for compatibility
          apparent_temperature: hourly.variables(2)!.valuesArray(),
          snowfall: new Float32Array(hourly.variables(0)!.valuesArray().length), // Not requested, use empty array
          wind_speed_10m: hourly.variables(3)!.valuesArray(),
          cloud_cover: hourly.variables(4)!.valuesArray(),
          weather_code: hourly.variables(5)!.valuesArray(),
        },
        location: {
          latitude: responseLatitude,
          longitude: responseLongitude,
          elevation,
          utcOffsetSeconds,
        }
      };

      setData(weatherData);
      
      toast({
        title: "Weather data updated",
        description: `Retrieved forecast for ${responseLatitude.toFixed(2)}°N ${responseLongitude.toFixed(2)}°E`,
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