import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Satellite,
  Map,
  Layers,
  Play,
  Pause,
  RefreshCw,
  Download,
  Info,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { bbox } from '@turf/turf';
import { cn } from '@/lib/utils';

interface EarthEngineData {
  urlFormat: string;
  geojson: Record<string, unknown>;
  poiPolygon: Record<string, unknown>;
  msaviData?: {
    mean: number;
    max: number;
    min: number;
    stdDev: number;
    cloudCover: number;
    date: number;
  };
}

interface FieldMapProps {
  className?: string;
  height?: string;
}

export const FieldMap: React.FC<FieldMapProps> = ({
  className,
  height = "h-96"
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState('MSAVI');
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const [earthEngineData, setEarthEngineData] = useState<EarthEngineData | null>(null);
  const [loading, setLoading] = useState(false);
  const map = useRef<maplibregl.Map | null>(null);
  const { toast } = useToast();

  // Earth engine layer id
  const eeLayerId = "ee-layer";
  const boundingBoxId = "bounding-box";

  const layers = [
    { id: 'MSAVI', name: 'MSAVI', color: 'bg-success', description: 'Modified Soil Adjusted Vegetation Index' },
    { id: 'NDVI', name: 'NDVI', color: 'bg-primary', description: 'Normalized Difference Vegetation Index' },
    { id: 'EVI', name: 'EVI', color: 'bg-accent', description: 'Enhanced Vegetation Index' },
    { id: 'NDWI', name: 'NDWI', color: 'bg-warning', description: 'Normalized Difference Water Index' },
  ];

  const fetchEarthEngineData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch data from the Node.js server
      const response = await fetch('http://localhost:3001/api/ee');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add mock MSAVI data for display purposes
      const earthEngineData = {
        ...data,
        msaviData: {
          mean: 0.45,
          max: 0.78,
          min: 0.12,
          stdDev: 0.15,
          cloudCover: 8.5,
          date: new Date().getTime()
        }
      };

      setEarthEngineData(earthEngineData);

      // If it is good then add the layer url to the map
      if (map.current) {
        // Remove existing Earth Engine layer if it exists
        if (map.current.getLayer(eeLayerId)) {
          map.current.removeLayer(eeLayerId);
        }
        if (map.current.getSource(eeLayerId)) {
          map.current.removeSource(eeLayerId);
        }

        // Add Earth Engine source
        map.current.addSource(eeLayerId, {
          type: "raster",
          tiles: [earthEngineData.urlFormat],
          tileSize: 256,
        });

        // After the source is added then add it as map layer
        map.current.addLayer({
          type: "raster",
          source: eeLayerId,
          id: eeLayerId,
          minzoom: 0,
          maxzoom: 20,
        });

        // Create bounding box around the polygon
        if (earthEngineData.geojson) {
          const bounds = bbox(earthEngineData.geojson);

          // Add POI polygon if available
          if (earthEngineData.poiPolygon) {
            // Remove existing POI polygon layers if they exist
            if (map.current.getLayer("poi-polygon-fill")) {
              map.current.removeLayer("poi-polygon-fill");
            }
            if (map.current.getLayer("poi-polygon-outline")) {
              map.current.removeLayer("poi-polygon-outline");
            }
            if (map.current.getSource("poi-polygon")) {
              map.current.removeSource("poi-polygon");
            }

            // Add POI polygon source
            map.current.addSource("poi-polygon", {
              type: "geojson",
              data: earthEngineData.poiPolygon
            });

            // Add POI polygon fill layer
            map.current.addLayer({
              id: "poi-polygon-fill",
              type: "fill",
              source: "poi-polygon",
              paint: {
                "fill-color": "transparent",
                "fill-opacity": 0.1
              }
            });

            // Add POI polygon outline layer
            map.current.addLayer({
              id: "poi-polygon-outline",
              type: "line",
              source: "poi-polygon",
              paint: {
                "line-color": "#3b82f6",
                "line-width": 2,
                "line-dasharray": [2, 2]
              }
            });
          }

          // Fit map to bounds
          map.current.fitBounds(bounds as [number, number, number, number], {
            padding: 50,
            duration: 1000
          });
        }
      }
    } catch (error) {
      console.error('Error fetching Earth Engine data:', error);
      toast({
        title: "Error",
        description: "Failed to load satellite data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const initializeMap = useCallback(() => {
    if (!mapContainer || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: [77.77333199305133, 12.392392446684909],
      zoom: 15,
      maxZoom: 20,
      minZoom: 10
    });

    map.current.on('load', () => {
      fetchEarthEngineData();
    });
  }, [mapContainer, fetchEarthEngineData]);

  useEffect(() => {
    if (mapContainer && !map.current) {
      initializeMap();
    }
  }, [mapContainer, initializeMap]);

  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

  const handleLayerChange = (layerId: string) => {
    setSelectedLayer(layerId);
    // For now, we only have MSAVI implemented
    // In the future, you can add different vegetation indices
    if (layerId !== 'MSAVI') {
      toast({
        title: "Feature coming soon",
        description: `${layerId} calculation will be implemented soon`,
      });
    }
  };

  const toggleSatelliteView = () => {
    if (!map.current) return;

    const currentStyle = map.current.getStyle();
    const currentLayers = currentStyle.layers || [];
    const hasSatellite = currentLayers.some(layer => layer.id === 'satellite');

    if (hasSatellite) {
      // Switch to OSM
      map.current.setStyle({
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      });
    } else {
      // Switch to satellite
      map.current.setStyle({
        version: 8,
        sources: {
          'satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '© Esri'
          }
        },
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'satellite',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      });
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span>Earth Engine Analytics</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              Google Project: avid-infinity-456706-d6
            </Badge>
            {earthEngineData && (
              <Badge variant="outline" className="text-xs bg-success/10 text-success">
                Live Data
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Map Controls */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={toggleSatelliteView}>
              <Layers className="w-4 h-4 mr-2" />
              Toggle View
            </Button>
            <div className="flex items-center space-x-1">
              {layers.map((layer) => (
                <Button
                  key={layer.id}
                  variant={selectedLayer === layer.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleLayerChange(layer.id)}
                  disabled={loading}
                  className="text-xs"
                >
                  {layer.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" disabled={loading} onClick={fetchEarthEngineData}>
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Info className="w-4 h-4 mr-2" />
              )}
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <div
          ref={setMapContainer}
          className={cn("w-full relative", height)}
          style={{ minHeight: '400px' }}
        >
          {/* MSAVI Data Overlay */}
          {earthEngineData && (
            <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 z-10">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold">MSAVI Active</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Vegetation Health: {earthEngineData.msaviData?.mean > 0.6 ? 'High' :
                  earthEngineData.msaviData?.mean > 0.3 ? 'Medium' : 'Low'}
              </div>
            </div>
          )}
        </div>

        {/* Data Display */}
        {earthEngineData && (
          <div className="p-4 bg-muted/20 border-t border-border/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">
                  {earthEngineData.msaviData?.mean?.toFixed(3) || '0.450'}
                </div>
                <div className="text-xs text-muted-foreground">Mean MSAVI</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {earthEngineData.msaviData?.max?.toFixed(3) || '0.780'}
                </div>
                <div className="text-xs text-muted-foreground">Max MSAVI</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">
                  {earthEngineData.msaviData?.cloudCover?.toFixed(1) || '8.5'}%
                </div>
                <div className="text-xs text-muted-foreground">Cloud Cover</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">
                  {earthEngineData.msaviData?.date ? new Date(earthEngineData.msaviData.date).toLocaleDateString() : '2024'}
                </div>
                <div className="text-xs text-muted-foreground">Data Date</div>
              </div>
            </div>

            {/* MSAVI Legend */}
            <div className="mt-4 p-3 bg-card rounded-lg">
              <h4 className="text-sm font-semibold mb-2">MSAVI Vegetation Health</h4>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>Low (0.0-0.3)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>Medium (0.3-0.6)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>High (0.6-1.0)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};