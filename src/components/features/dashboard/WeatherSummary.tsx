import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Thermometer,
  Droplets,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useWeather } from '@/hooks/use-weather';

interface WeatherDayProps {
  day: string;
  high: number;
  low: number;
  icon: React.ComponentType<{ className?: string }>;
  precipitation: number;
  condition: string;
}

const WeatherDay: React.FC<WeatherDayProps> = ({
  day,
  high,
  low,
  icon: Icon,
  precipitation,
  condition
}) => (
  <div className="flex flex-col items-center space-y-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
    <p className="text-xs font-medium text-muted-foreground">{day}</p>
    <Icon className="w-6 h-6 text-accent" />
    <div className="text-center">
      <p className="text-sm font-semibold text-foreground">{high}°</p>
      <p className="text-xs text-muted-foreground">{low}°</p>
    </div>
    {precipitation > 0 && (
      <div className="flex items-center space-x-1">
        <Droplets className="w-3 h-3 text-accent" />
        <span className="text-xs text-accent">{precipitation}mm</span>
      </div>
    )}
  </div>
);

export const WeatherSummary: React.FC = () => {
  const { data, loading, error, fetchWeather } = useWeather();

  // Default location (Bangalore coordinates for agriculture demo)
  const defaultLatitude = 12.9716;
  const defaultLongitude = 77.5946;

  useEffect(() => {
    fetchWeather(defaultLatitude, defaultLongitude);
  }, [fetchWeather]);

  const getWeatherIcon = (weatherCode: number) => {
    if (weatherCode <= 1) return Sun; // Clear/Mainly clear
    if (weatherCode <= 3) return Cloud; // Partly cloudy/Overcast
    if (weatherCode >= 61 && weatherCode <= 67) return CloudRain; // Rain
    if (weatherCode >= 80 && weatherCode <= 82) return CloudRain; // Rain showers
    return Cloud; // Default
  };

  const getCondition = (weatherCode: number) => {
    if (weatherCode === 0) return 'Clear';
    if (weatherCode === 1) return 'Mainly Clear';
    if (weatherCode === 2) return 'Partly Cloudy';
    if (weatherCode === 3) return 'Overcast';
    if (weatherCode >= 61 && weatherCode <= 67) return 'Rain';
    if (weatherCode >= 80 && weatherCode <= 82) return 'Showers';
    return 'Cloudy';
  };

  const processDailyData = () => {
    if (!data) return [];

    const dailyData = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Group hourly data by day (take every 24 hours starting from current time)
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const startHour = dayIndex * 24;
      const endHour = Math.min((dayIndex + 1) * 24, data.hourly.time.length);

      if (startHour >= data.hourly.time.length) break;

      const dayTemps = Array.from(data.hourly.temperature_2m.slice(startHour, endHour));
      const dayPrecipitation = Array.from(data.hourly.precipitation.slice(startHour, endHour));
      const dayWeatherCodes = Array.from(data.hourly.weather_code.slice(startHour, endHour));

      const high = Math.round(Math.max(...dayTemps));
      const low = Math.round(Math.min(...dayTemps));
      const precipitation = Math.round(dayPrecipitation.reduce((sum, precip) => sum + precip, 0) * 10) / 10;
      const avgWeatherCode = Math.round(dayWeatherCodes.reduce((sum, code) => sum + code, 0) / dayWeatherCodes.length);

      const date = data.hourly.time[startHour];
      const dayName = dayIndex === 0 ? 'Today' : days[date.getDay()];

      dailyData.push({
        day: dayName,
        high,
        low,
        icon: getWeatherIcon(avgWeatherCode),
        precipitation,
        condition: getCondition(avgWeatherCode)
      });
    }

    return dailyData;
  };

  const getCurrentConditions = () => {
    if (!data || data.hourly.time.length === 0) return null;

    const currentTemp = Math.round(data.hourly.temperature_2m[0]);
    const currentApparent = Math.round(data.hourly.apparent_temperature[0]);
    const currentWind = Math.round(data.hourly.wind_speed_10m[0] * 3.6); // Convert m/s to km/h
    const currentCloud = Math.round(data.hourly.cloud_cover[0]);

    return { currentTemp, currentApparent, currentWind, currentCloud };
  };

  const weatherData = processDailyData();
  const totalPrecipitation = weatherData.reduce((sum, day) => sum + day.precipitation, 0);
  const currentConditions = getCurrentConditions();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Cloud className="w-5 h-5 text-accent" />
            <span>7-Day Weather</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {data ? `${data.location.latitude.toFixed(1)}°N ${data.location.longitude.toFixed(1)}°E` : 'Loading...'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchWeather(defaultLatitude, defaultLongitude)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Conditions */}
        {currentConditions && (
          <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-sky/10 rounded-lg">
            <div className="flex items-center space-x-2">
              <Thermometer className="w-4 h-4 text-warning" />
              <div>
                <p className="text-xs text-muted-foreground">Temperature</p>
                <p className="text-sm font-semibold">{currentConditions.currentTemp}°C</p>
                <p className="text-xs text-muted-foreground">Feels {currentConditions.currentApparent}°C</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Wind className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Wind Speed</p>
                <p className="text-sm font-semibold">{currentConditions.currentWind} km/h</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Cloud className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Cloud Cover</p>
                <p className="text-sm font-semibold">{currentConditions.currentCloud}%</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">Error: {error}</p>
          </div>
        )}

        {/* 7-Day Forecast */}
        <div className="grid grid-cols-7 gap-1">
          {loading ? (
            Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center space-y-2 p-3 rounded-lg bg-muted/30">
                <div className="w-6 h-6 bg-muted/50 rounded animate-pulse" />
                <div className="w-8 h-3 bg-muted/50 rounded animate-pulse" />
                <div className="w-6 h-3 bg-muted/50 rounded animate-pulse" />
              </div>
            ))
          ) : (
            weatherData.map((day, index) => (
              <WeatherDay key={index} {...day} />
            ))
          )}
        </div>

        {/* Weekly Summary */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-2">
            <Droplets className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">Expected Rain:</span>
            <span className="text-sm font-semibold text-foreground">{totalPrecipitation.toFixed(1)}mm</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Avg Temp:</span>
            <span className="text-sm font-semibold text-foreground">
              {weatherData.length > 0
                ? Math.round(weatherData.reduce((sum, day) => sum + (day.high + day.low) / 2, 0) / weatherData.length)
                : '--'
              }°C
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};