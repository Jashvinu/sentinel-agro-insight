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
import { useWeather } from '@/hooks/useWeather';


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
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-sm">
            <Cloud className="w-4 h-4 text-accent" />
            <span>Weather</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchWeather(defaultLatitude, defaultLongitude)}
            disabled={loading}
            className="h-6 w-6 p-0"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Current Conditions - Compact */}
        {currentConditions && (
          <div className="grid grid-cols-3 gap-2 p-2 bg-gradient-sky/10 rounded-lg">
            <div className="text-center">
              <Thermometer className="w-3 h-3 text-warning mx-auto mb-1" />
              <p className="text-xs font-semibold">{currentConditions.currentTemp}°C</p>
              <p className="text-[10px] text-muted-foreground">Temp</p>
            </div>
            <div className="text-center">
              <Wind className="w-3 h-3 text-accent mx-auto mb-1" />
              <p className="text-xs font-semibold">{currentConditions.currentWind}</p>
              <p className="text-[10px] text-muted-foreground">km/h</p>
            </div>
            <div className="text-center">
              <Cloud className="w-3 h-3 text-accent mx-auto mb-1" />
              <p className="text-xs font-semibold">{currentConditions.currentCloud}%</p>
              <p className="text-[10px] text-muted-foreground">Cloud</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">Error: {error}</p>
          </div>
        )}

        {/* 7-Day Forecast - Compact */}
        <div className="grid grid-cols-7 gap-1">
          {loading ? (
            Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center space-y-1 p-2 rounded-lg bg-muted/30">
                <div className="w-4 h-4 bg-muted/50 rounded animate-pulse" />
                <div className="w-6 h-2 bg-muted/50 rounded animate-pulse" />
                <div className="w-4 h-2 bg-muted/50 rounded animate-pulse" />
              </div>
            ))
          ) : (
            weatherData.map((day, index) => (
              <div key={index} className="flex flex-col items-center space-y-1 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground">{day.day}</p>
                {React.createElement(day.icon, { className: "w-4 h-4 text-accent" })}
                <div className="text-center">
                  <p className="text-xs font-semibold text-foreground">{day.high}°</p>
                  <p className="text-[10px] text-muted-foreground">{day.low}°</p>
                </div>
                {day.precipitation > 0 && (
                  <div className="flex items-center space-x-0.5">
                    <Droplets className="w-2 h-2 text-accent" />
                    <span className="text-[10px] text-accent">{day.precipitation}mm</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Weekly Summary - Compact */}
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-1">
            <Droplets className="w-3 h-3 text-accent" />
            <span className="text-xs text-muted-foreground">Rain:</span>
            <span className="text-xs font-semibold text-foreground">{totalPrecipitation.toFixed(1)}mm</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-xs text-muted-foreground">Avg:</span>
            <span className="text-xs font-semibold text-foreground">
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