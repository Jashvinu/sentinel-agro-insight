/**
 * DiagnosticsWeatherCard Component
 * Compact weather card for the diagnostics sidebar
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Thermometer,
  Droplets,
  Loader2,
} from 'lucide-react';

interface WeatherData {
  hourly: {
    time: Date[];
    temperature_2m: Float32Array;
    precipitation: Float32Array;
    wind_speed_10m: Float32Array;
    cloud_cover: Float32Array;
    weather_code: Float32Array;
  };
}

interface DiagnosticsWeatherCardProps {
  data: WeatherData | null;
  loading: boolean;
}

const getWeatherIcon = (weatherCode: number) => {
  if (weatherCode <= 1) return Sun;
  if (weatherCode <= 3) return Cloud;
  if (weatherCode >= 61 && weatherCode <= 67) return CloudRain;
  if (weatherCode >= 80 && weatherCode <= 82) return CloudRain;
  return Cloud;
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

export const DiagnosticsWeatherCard: React.FC<DiagnosticsWeatherCardProps> = ({
  data,
  loading,
}) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading weather...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.hourly.time.length === 0) return null;

  const currentTemp = Math.round(data.hourly.temperature_2m[0]);
  const currentWind = Math.round(data.hourly.wind_speed_10m[0] * 3.6);
  const currentCloud = Math.round(data.hourly.cloud_cover[0]);
  const currentCode = data.hourly.weather_code[0];
  const CurrentIcon = getWeatherIcon(currentCode);

  // Build 3-day mini forecast
  const forecast: { day: string; high: number; low: number; icon: typeof Sun; precip: number }[] = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let d = 0; d < 3; d++) {
    const startHour = d * 24;
    const endHour = Math.min((d + 1) * 24, data.hourly.time.length);
    if (startHour >= data.hourly.time.length) break;

    const temps = Array.from(data.hourly.temperature_2m.slice(startHour, endHour));
    const precips = Array.from(data.hourly.precipitation.slice(startHour, endHour));
    const codes = Array.from(data.hourly.weather_code.slice(startHour, endHour));

    const avgCode = Math.round(codes.reduce((a, b) => a + b, 0) / codes.length);
    const date = data.hourly.time[startHour];
    const dayName = d === 0 ? 'Today' : days[date.getDay()];

    forecast.push({
      day: dayName,
      high: Math.round(Math.max(...temps)),
      low: Math.round(Math.min(...temps)),
      icon: getWeatherIcon(avgCode),
      precip: Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10,
    });
  }

  const totalPrecip = forecast.reduce((sum, d) => sum + d.precip, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cloud className="w-4 h-4 text-blue-500" />
          Current Weather
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current conditions */}
        <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
          <CurrentIcon className="w-8 h-8 text-blue-500 shrink-0" />
          <div className="flex-1">
            <div className="text-lg font-semibold">{currentTemp}°C</div>
            <div className="text-xs text-muted-foreground">{getCondition(currentCode)}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1 justify-end">
              <Wind className="w-3 h-3" />
              {currentWind} km/h
            </div>
            <div className="flex items-center gap-1 justify-end">
              <Cloud className="w-3 h-3" />
              {currentCloud}%
            </div>
          </div>
        </div>

        {/* 3-day mini forecast */}
        <div className="grid grid-cols-3 gap-2">
          {forecast.map((day, i) => (
            <div key={i} className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <span className="text-[10px] font-medium text-muted-foreground">{day.day}</span>
              {React.createElement(day.icon, { className: 'w-4 h-4 text-blue-500 my-1' })}
              <span className="text-xs font-semibold">{day.high}°</span>
              <span className="text-[10px] text-muted-foreground">{day.low}°</span>
            </div>
          ))}
        </div>

        {/* Precipitation total */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Droplets className="w-3 h-3 text-blue-500" />
          <span>3-day precipitation: <span className="font-medium text-foreground">{totalPrecip.toFixed(1)}mm</span></span>
        </div>
      </CardContent>
    </Card>
  );
};

export default DiagnosticsWeatherCard;
