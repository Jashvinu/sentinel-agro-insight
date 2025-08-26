import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Satellite,
  RefreshCw,
  Leaf,
  Zap,
  Thermometer,
  Droplets,
  TreePine,
  Waves
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { bbox } from '@turf/turf';
import { cn } from '@/lib/utils';

interface EarthEngineData {
  urlFormat: string;
  geojson: any; // Using any for now to avoid complex GeoJSON type issues
  poiPolygon: any; // Using any for now to avoid complex GeoJSON type issues
  cloudCover: number;
  date: number;
  metadata?: {
    algorithm: string;
    indexType?: string;
    calculationMethod?: string;
  };
}

interface CachedMapData {
  [index: string]: EarthEngineData;
}

interface FieldMapProps {
  className?: string;
  height?: string;
}

export const FieldMap: React.FC<FieldMapProps> = ({
  className,
  height = "h-96"
}) => {
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const [earthEngineData, setEarthEngineData] = useState<EarthEngineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState('ndvi');
  const [mapCache, setMapCache] = useState<CachedMapData>({});
  const map = useRef<maplibregl.Map | null>(null);
  const { toast } = useToast();

  // Helper function to handle index selection with cache awareness
  const handleIndexSelection = useCallback((index: string) => {
    console.log(`Index selection: ${index}, Cache status:`, mapCache);
    setSelectedIndex(index);
    // Only set loading if not cached
    if (!mapCache[index]) {
      console.log(`Setting loading for ${index} - not cached`);
      setLoading(true);
    } else {
      console.log(`Using cached data for ${index}`);
    }
  }, [mapCache]);

  // Earth engine layer id
  const eeLayerId = "ee-layer";
  const boundingBoxId = "bounding-box";

  const fetchEarthEngineData = useCallback(async () => {
    // Check if data is already cached for this index
    if (mapCache[selectedIndex]) {
      console.log(`Using cached data for ${selectedIndex}`);
      setEarthEngineData(mapCache[selectedIndex]);
      updateMapLayer(mapCache[selectedIndex]);
      return;
    }

    setLoading(true);
    try {
      // Fetch data from the Node.js server with the selected index
      const response = await fetch(`/api/ee?index=${selectedIndex}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add mock data for display purposes
      const earthEngineData = {
        ...data,
        cloudCover: 8.5,
        date: new Date().getTime()
      };

      // Cache the new data
      setMapCache(prev => ({
        ...prev,
        [selectedIndex]: earthEngineData
      }));

      setEarthEngineData(earthEngineData);
      updateMapLayer(earthEngineData);

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
  }, [selectedIndex, toast, mapCache]);

  const initializeMap = useCallback(() => {
    if (!mapContainer || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer,
      style: "https://demotiles.maplibre.org/style.json",
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

  // Refresh map data when selected index changes
  useEffect(() => {
    if (map.current) {
      console.log(`Index changed to: ${selectedIndex}, Cache status:`, mapCache);
      // Check if data is already cached for this index
      if (mapCache[selectedIndex]) {
        console.log(`Using cached data for ${selectedIndex}`);
        setEarthEngineData(mapCache[selectedIndex]);
        updateMapLayer(mapCache[selectedIndex]);
        setLoading(false);
      } else {
        console.log(`Fetching new data for ${selectedIndex}`);
        // Only fetch if not cached
        fetchEarthEngineData();
      }
    }
  }, [selectedIndex, mapCache]);

  const updateMapLayer = useCallback((data: EarthEngineData) => {
    if (!map.current) return;

    console.log('Updating map layer with data:', data);
    console.log('Tile URL:', data.urlFormat);

    // Remove existing Earth Engine layer if it exists
    if (map.current.getLayer(eeLayerId)) {
      map.current.removeLayer(eeLayerId);
    }
    if (map.current.getSource(eeLayerId)) {
      map.current.removeSource(eeLayerId);
    }

    try {
      // Add Earth Engine source
      map.current.addSource(eeLayerId, {
        type: "raster",
        tiles: [data.urlFormat],
        tileSize: 256,
      });

      console.log('Source added successfully');

      // After the source is added then add it as map layer
      map.current.addLayer({
        type: "raster",
        source: eeLayerId,
        id: eeLayerId,
        minzoom: 0,
        maxzoom: 20,
      });

      console.log('Layer added successfully');

      // Log tile loading status
      console.log('Earth Engine tiles added successfully');

      // Create bounding box around the polygon
      if (data.geojson) {
        const bounds = bbox(data.geojson);

        // Add POI polygon if available
        if (data.poiPolygon) {
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
            data: data.poiPolygon
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
    } catch (error) {
      console.error('Error updating map layer:', error);
      toast({
        title: "Map Error",
        description: "Failed to load map tiles. Please try again.",
        variant: "destructive",
      });
    }
  }, [eeLayerId, toast]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

  const getIndexUnit = (index: string) => {
    switch (index) {
      case 'nitrogen':
      case 'phosphorus':
      case 'potassium':
        return 'kg/ha';
      case 'salinity':
        return 'dS/m';
      case 'ph':
        return 'pH';
      case 'moisture':
        return '%';
      case 'carbon':
        return 't/ha';
      case 'ndvi':
      case 'evi':
      case 'savi':
      case 'msavi':
        return '';
      case 'ndwi':
        return '';
      default:
        return '';
    }
  };

  const getLegendInfo = (index: string) => {
    switch (index) {
      case 'nitrogen':
        return 'Nitrogen Content (kg N/ha)';
      case 'phosphorus':
        return 'Phosphorus Content (kg P₂O₅/ha)';
      case 'potassium':
        return 'Potassium Content (kg K₂O/ha)';
      case 'salinity':
        return 'Electrical Conductivity (dS/m)';
      case 'ph':
        return 'Soil pH';
      case 'moisture':
        return 'Volumetric Moisture (%)';
      case 'carbon':
        return 'Soil Organic Carbon (%)';
      case 'ndvi':
      case 'evi':
      case 'savi':
      case 'msavi':
        return 'Vegetation Index (0-1)';
      case 'ndwi':
        return 'Water Index (-1 to 1)';
      default:
        return 'Index Values';
    }
  };

  const getLegendColors = (index: string) => {
    switch (index) {
      case 'nitrogen':
      case 'phosphorus':
      case 'potassium':
        return ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'];
      case 'salinity':
        return ['#22c55e', '#eab308', '#f97316', '#ef4444', '#7f1d1d'];
      case 'ph':
        return ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
      case 'moisture':
        return ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e40af'];
      case 'carbon':
        return ['#92400e', '#eab308', '#f97316', '#22c55e', '#15803d'];
      case 'ndvi':
      case 'evi':
      case 'savi':
      case 'msavi':
        return ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'];
      case 'ndwi':
        return ['#ef4444', '#f97316', '#3b82f6', '#1e40af'];
      default:
        return ['#92400e', '#eab308', '#22c55e'];
    }
  };

  const getLegendLabels = (index: string) => {
    switch (index) {
      case 'nitrogen':
        return ['0', '75', '150', '225', '300+'];
      case 'phosphorus':
        return ['0', '50', '100', '150', '200+'];
      case 'potassium':
        return ['0', '62', '125', '187', '250+'];
      case 'salinity':
        return ['0', '4', '8', '12', '16+'];
      case 'ph':
        return ['4.5', '5.6', '6.7', '7.8', '9.0'];
      case 'moisture':
        return ['0%', '12%', '25%', '37%', '50%+'];
      case 'carbon':
        return ['0%', '2.5%', '5%', '7.5%', '10%+'];
      case 'ndvi':
      case 'evi':
      case 'savi':
      case 'msavi':
        return ['0', '0.25', '0.5', '0.75', '1.0'];
      case 'ndwi':
        return ['-1', '-0.5', '0.5', '1.0'];
      default:
        return ['Low', 'Medium', 'High'];
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span>Field Map</span>
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
            <Badge variant="outline" className="text-xs bg-blue-10 text-blue-600">
              Cache: {Object.keys(mapCache).length}/12
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Map Controls */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          {/* Index Selection Buttons - Horizontally Scrollable */}
          <div className="flex-1 overflow-x-auto scrollbar-hide relative">
            {/* Left scroll indicator */}
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-muted/30 to-transparent pointer-events-none z-10"></div>

            <div className="flex items-center space-x-2 min-w-max pl-1">
              {/* NPK Section */}
              <div className="flex items-center space-x-1">
                <span className="text-xs font-medium text-muted-foreground mr-2">NPK:</span>
                <Button
                  variant={selectedIndex === 'nitrogen' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('nitrogen')}
                  disabled={loading}
                  className="text-xs px-2 py-1 relative"
                  style={{
                    backgroundColor: selectedIndex === 'nitrogen' ? '#ef4444' : undefined,
                    borderColor: selectedIndex === 'nitrogen' ? '#ef4444' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  N
                  {mapCache['nitrogen'] && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
                  )}
                </Button>
                <Button
                  variant={selectedIndex === 'phosphorus' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('phosphorus')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'phosphorus' ? '#f59e0b' : undefined,
                    borderColor: selectedIndex === 'phosphorus' ? '#f59e0b' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  P
                </Button>
                <Button
                  variant={selectedIndex === 'potassium' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('potassium')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'potassium' ? '#10b981' : undefined,
                    borderColor: selectedIndex === 'potassium' ? '#10b981' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  K
                </Button>
              </div>

              {/* Soil Health Section */}
              <div className="flex items-center space-x-1">
                <span className="text-xs font-medium text-muted-foreground mr-2">Soil:</span>
                <Button
                  variant={selectedIndex === 'salinity' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('salinity')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'salinity' ? '#f59e0b' : undefined,
                    borderColor: selectedIndex === 'salinity' ? '#f59e0b' : undefined
                  }}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Salinity
                </Button>
                <Button
                  variant={selectedIndex === 'ph' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('ph')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'ph' ? '#10b981' : undefined,
                    borderColor: selectedIndex === 'ph' ? '#10b981' : undefined
                  }}
                >
                  <Thermometer className="w-3 h-3 mr-1" />
                  pH
                </Button>
                <Button
                  variant={selectedIndex === 'moisture' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('moisture')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'moisture' ? '#3b82f6' : undefined,
                    borderColor: selectedIndex === 'moisture' ? '#3b82f6' : undefined
                  }}
                >
                  <Droplets className="w-3 h-3 mr-1" />
                  Moisture
                </Button>
                <Button
                  variant={selectedIndex === 'carbon' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('carbon')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'carbon' ? '#f59e0b' : undefined,
                    borderColor: selectedIndex === 'carbon' ? '#f59e0b' : undefined
                  }}
                >
                  <TreePine className="w-3 h-3 mr-1" />
                  Carbon
                </Button>
              </div>

              {/* Vegetation Section */}
              <div className="flex items-center space-x-1">
                <span className="text-xs font-medium text-muted-foreground mr-2">Veg:</span>
                <Button
                  variant={selectedIndex === 'ndvi' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('ndvi')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'ndvi' ? '#10b981' : undefined,
                    borderColor: selectedIndex === 'ndvi' ? '#10b981' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  NDVI
                </Button>
                <Button
                  variant={selectedIndex === 'evi' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('evi')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'evi' ? '#f59e0b' : undefined,
                    borderColor: selectedIndex === 'evi' ? '#f59e0b' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  EVI
                </Button>
                <Button
                  variant={selectedIndex === 'savi' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('savi')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'savi' ? '#10b981' : undefined,
                    borderColor: selectedIndex === 'savi' ? '#10b981' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  SAVI
                </Button>
                <Button
                  variant={selectedIndex === 'msavi' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('msavi')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'msavi' ? '#10b981' : undefined,
                    borderColor: selectedIndex === 'msavi' ? '#10b981' : undefined
                  }}
                >
                  <Leaf className="w-3 h-3 mr-1" />
                  MSAVI
                </Button>
              </div>

              {/* Water Section */}
              <div className="flex items-center space-x-1">
                <span className="text-xs font-medium text-muted-foreground mr-2">Water:</span>
                <Button
                  variant={selectedIndex === 'ndwi' ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleIndexSelection('ndwi')}
                  disabled={loading}
                  className="text-xs px-2 py-1"
                  style={{
                    backgroundColor: selectedIndex === 'ndwi' ? '#3b82f6' : undefined,
                    borderColor: selectedIndex === 'ndwi' ? '#3b82f6' : undefined
                  }}
                >
                  <Waves className="w-3 h-3 mr-1" />
                  NDWI
                </Button>
              </div>
            </div>

            {/* Right scroll indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-muted/30 to-transparent pointer-events-none z-10"></div>
          </div>

          {/* Refresh Button */}
          <Button variant="outline" size="sm" disabled={loading} onClick={fetchEarthEngineData} className="ml-4 flex-shrink-0">
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh Data
          </Button>
        </div>

        {/* Scroll hint */}
        <div className="px-4 py-1 bg-muted/10 border-b border-border/30">
          <p className="text-xs text-muted-foreground text-center">
            💡 Scroll horizontally to see all available indices
          </p>
        </div>

        {/* Cache Status */}
        <div className="px-4 py-2 bg-blue-50/50 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-blue-700">Cache Status:</span>
              <span className="text-xs text-blue-600">
                {Object.keys(mapCache).length} of 12 indices cached
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMapCache({});
                toast({
                  title: "Cache Cleared",
                  description: "All cached map data has been cleared.",
                });
              }}
              className="text-xs h-6 px-2"
            >
              Clear Cache
            </Button>
          </div>
          {Object.keys(mapCache).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.keys(mapCache).map((index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs bg-green-100 text-green-700 border-green-300"
                >
                  {index.toUpperCase()}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div
          ref={setMapContainer}
          className={cn("w-full relative", height)}
          style={{ minHeight: '400px' }}
        >
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="bg-card rounded-lg p-4 flex items-center space-x-3">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Loading {selectedIndex.toUpperCase()} data...</span>
              </div>
            </div>
          )}

          {/* Data Status Overlay */}
          {earthEngineData && (
            <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 z-10">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold">
                  {selectedIndex.toUpperCase()} Active
                </span>
                {mapCache[selectedIndex] && (
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700">
                    Cached
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Cloud Cover: {earthEngineData.cloudCover?.toFixed(1) || '8.5'}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Algorithm: {earthEngineData.metadata?.algorithm || selectedIndex.toUpperCase()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {getIndexUnit(selectedIndex)}
              </div>
              {earthEngineData.metadata?.calculationMethod && (
                <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {earthEngineData.metadata.calculationMethod}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Color Legend */}
        <div className="p-4 bg-muted/10 border-t border-border/30">
          <div className="flex flex-col items-center space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              {getLegendInfo(selectedIndex)}
            </div>
            <div className="flex items-center space-x-2">
              {getLegendColors(selectedIndex).map((color, index) => (
                <div key={index} className="flex flex-col items-center space-y-1">
                  <div
                    className="w-6 h-4 rounded border border-border"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className="text-xs text-muted-foreground">
                    {getLegendLabels(selectedIndex)[index]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Data Summary */}
        {earthEngineData && (
          <div className="p-4 bg-muted/20 border-t border-border/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">
                  {earthEngineData.cloudCover?.toFixed(1) || '8.5'}%
                </div>
                <div className="text-xs text-muted-foreground">Cloud Cover</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {selectedIndex.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">
                  Active Index {getIndexUnit(selectedIndex) && `(${getIndexUnit(selectedIndex)})`}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">
                  {earthEngineData.date ? new Date(earthEngineData.date).toLocaleDateString() : '2024'}
                </div>
                <div className="text-xs text-muted-foreground">Data Date</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">
                  Real-time
                </div>
                <div className="text-xs text-muted-foreground">Update</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};