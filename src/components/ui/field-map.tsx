import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Map, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Calendar,
  Play,
  Pause,
  Square
} from 'lucide-react';

interface FieldMapProps {
  className?: string;
  height?: string;
}

export const FieldMap: React.FC<FieldMapProps> = ({ 
  className,
  height = "h-96"
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState('ndvi');

  const layers = [
    { id: 'ndvi', name: 'NDVI', color: 'bg-success' },
    { id: 'evi', name: 'EVI', color: 'bg-primary' },
    { id: 'ndwi', name: 'NDWI', color: 'bg-accent' },
    { id: 'savi', name: 'SAVI', color: 'bg-warning' },
  ];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Map className="w-5 h-5 text-primary" />
            <span>Field Explorer</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Live Data
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Map Controls */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Layers className="w-4 h-4 mr-2" />
              Layers
            </Button>
            <div className="flex items-center space-x-1">
              {layers.map((layer) => (
                <Button
                  key={layer.id}
                  variant={selectedLayer === layer.id ? "default" : "ghost"}
                  size="sm"
                  className="flex items-center space-x-1"
                  onClick={() => setSelectedLayer(layer.id)}
                >
                  <div className={cn("w-2 h-2 rounded-full", layer.color)} />
                  <span className="text-xs">{layer.name}</span>
                </Button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4" />
            </Button>
            <Button
              variant={isPlaying ? "destructive" : "default"}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <div className={cn("relative bg-gradient-satellite", height)}>
          {/* Placeholder satellite imagery with field overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-muted/20 to-muted/40">
            {/* Field boundary simulation */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-32 border-2 border-primary/60 rounded-lg bg-gradient-crop/20">
              <div className="absolute inset-2 bg-success/30 rounded animate-pulse-glow" />
              
              {/* Data points */}
              <div className="absolute top-4 left-4 w-2 h-2 bg-primary rounded-full animate-pulse" />
              <div className="absolute top-8 right-6 w-2 h-2 bg-warning rounded-full animate-pulse" />
              <div className="absolute bottom-6 left-8 w-2 h-2 bg-success rounded-full animate-pulse" />
              <div className="absolute bottom-4 right-4 w-2 h-2 bg-accent rounded-full animate-pulse" />
            </div>
            
            {/* Coordinate overlay */}
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded px-2 py-1">
              <p className="text-xs text-muted-foreground">
                77.773°E, 12.392°N
              </p>
            </div>
            
            {/* Scale indicator */}
            <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm rounded px-2 py-1">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-0.5 bg-foreground" />
                <span className="text-xs text-muted-foreground">50m</span>
              </div>
            </div>
          </div>

          {/* Map Controls */}
          <div className="absolute top-4 right-4 flex flex-col space-y-2">
            <Button variant="outline" size="sm" className="bg-card/90 backdrop-blur-sm">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="bg-card/90 backdrop-blur-sm">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="bg-card/90 backdrop-blur-sm">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Scanning animation overlay */}
          {isPlaying && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-satellite-scan" />
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between p-3 bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Last Update: 2024-01-15 14:30 UTC</span>
            <span>Resolution: 10m/pixel</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span>Connected</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};