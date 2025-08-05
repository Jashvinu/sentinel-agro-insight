import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Map, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Calendar,
  Play,
  Pause,
  Key
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
  const [mapboxToken, setMapboxToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(true);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // Farm polygon coordinates (your provided coordinates)
  const farmPolygon = [
    [77.77333199305133, 12.392392446684909],
    [77.77438732135664, 12.392392446684909],
    [77.77438732135664, 12.391392446684909], // Estimated south point
    [77.77333199305133, 12.391392446684909], // Estimated south point
    [77.77333199305133, 12.392392446684909]  // Close the polygon
  ];

  const layers = [
    { id: 'ndvi', name: 'NDVI', color: 'bg-success' },
    { id: 'evi', name: 'EVI', color: 'bg-primary' },
    { id: 'ndwi', name: 'NDWI', color: 'bg-accent' },
    { id: 'savi', name: 'SAVI', color: 'bg-warning' },
  ];

  const initializeMap = (token: string) => {
    if (!mapContainer.current || !token) return;

    mapboxgl.accessToken = token;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [77.77385665720399, 12.391892446684909], // Center of farm
      zoom: 16,
      pitch: 0,
    });

    map.current.on('load', () => {
      // Add farm polygon
      map.current?.addSource('farm-polygon', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [farmPolygon]
          },
          properties: {}
        }
      });

      // Add polygon fill
      map.current?.addLayer({
        id: 'farm-polygon-fill',
        type: 'fill',
        source: 'farm-polygon',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.2
        }
      });

      // Add polygon outline
      map.current?.addLayer({
        id: 'farm-polygon-outline',
        type: 'line',
        source: 'farm-polygon',
        paint: {
          'line-color': '#22c55e',
          'line-width': 2
        }
      });

      // Add center marker
      new mapboxgl.Marker({ color: '#3b82f6' })
        .setLngLat([77.77385665720399, 12.391892446684909])
        .addTo(map.current!);
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    setShowTokenInput(false);
  };

  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

  const handleTokenSubmit = () => {
    if (mapboxToken.trim()) {
      initializeMap(mapboxToken.trim());
    }
  };

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
        <div className={cn("relative", height)}>
          {showTokenInput ? (
            <div className="absolute inset-0 bg-muted/30 flex items-center justify-center p-6">
              <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
                <div className="text-center space-y-2">
                  <Key className="w-8 h-8 text-primary mx-auto" />
                  <h3 className="text-lg font-semibold">Mapbox Token Required</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter your Mapbox public token to view the satellite map. 
                    Get yours at <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">mapbox.com</a>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mapbox-token">Mapbox Public Token</Label>
                  <Input
                    id="mapbox-token"
                    type="password"
                    placeholder="pk.eyJ1IjoieW91cnVzZXJuYW1lIiwi..."
                    value={mapboxToken}
                    onChange={(e) => setMapboxToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
                  />
                </div>
                <Button onClick={handleTokenSubmit} className="w-full" disabled={!mapboxToken.trim()}>
                  <Map className="w-4 h-4 mr-2" />
                  Load Farm Map
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  For production: Add your token to Supabase Edge Function Secrets
                </p>
              </div>
            </div>
          ) : (
            <>
              <div ref={mapContainer} className={cn("w-full", height)} />
              
              {/* Coordinate overlay */}
              <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded px-2 py-1">
                <p className="text-xs text-muted-foreground">
                  Farm: 77.774°E, 12.392°N
                </p>
              </div>
              
              {/* Scale indicator */}
              <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm rounded px-2 py-1">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-0.5 bg-foreground" />
                  <span className="text-xs text-muted-foreground">10m</span>
                </div>
              </div>

              {/* Scanning animation overlay */}
              {isPlaying && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-satellite-scan" />
                </div>
              )}
            </>
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