import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Cloud, 
  Sun, 
  CloudRain, 
  Wind,
  Thermometer,
  Droplets
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherDayProps {
  day: string;
  high: number;
  low: number;
  icon: React.ComponentType<any>;
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
  const weatherData = [
    { day: 'Today', high: 28, low: 18, icon: Sun, precipitation: 0, condition: 'Sunny' },
    { day: 'Thu', high: 26, low: 16, icon: CloudRain, precipitation: 2.5, condition: 'Light Rain' },
    { day: 'Fri', high: 24, low: 15, icon: Cloud, precipitation: 0, condition: 'Cloudy' },
    { day: 'Sat', high: 27, low: 17, icon: Sun, precipitation: 0, condition: 'Sunny' },
    { day: 'Sun', high: 29, low: 19, icon: Sun, precipitation: 0, condition: 'Sunny' },
    { day: 'Mon', high: 25, low: 16, icon: CloudRain, precipitation: 8.2, condition: 'Rain' },
    { day: 'Tue', high: 23, low: 14, icon: CloudRain, precipitation: 12.1, condition: 'Heavy Rain' },
  ];

  const totalPrecipitation = weatherData.reduce((sum, day) => sum + day.precipitation, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Cloud className="w-5 h-5 text-accent" />
            <span>7-Day Weather</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Bangalore, IN
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Conditions */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-sky/10 rounded-lg">
          <div className="flex items-center space-x-2">
            <Thermometer className="w-4 h-4 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Temperature</p>
              <p className="text-sm font-semibold">28°C / 18°C</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Wind className="w-4 h-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Wind</p>
              <p className="text-sm font-semibold">12 km/h NE</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Droplets className="w-4 h-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Humidity</p>
              <p className="text-sm font-semibold">68%</p>
            </div>
          </div>
        </div>

        {/* 7-Day Forecast */}
        <div className="grid grid-cols-7 gap-1">
          {weatherData.map((day, index) => (
            <WeatherDay key={index} {...day} />
          ))}
        </div>

        {/* Weekly Summary */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-2">
            <Droplets className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">Expected Rain:</span>
            <span className="text-sm font-semibold text-foreground">{totalPrecipitation}mm</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Avg Temp:</span>
            <span className="text-sm font-semibold text-foreground">25°C</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};