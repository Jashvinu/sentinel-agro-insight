import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Satellite,
  RefreshCw,
  Leaf,
  Zap,
  Thermometer,
  Droplets,
  TreePine,
  Waves,
  Download,
  Save,
  MapPin,
  ChevronDown,
  Search,
  X,
  Edit2,
  Trash2,
  Layers
} from 'lucide-react';
import L from 'leaflet';
import { useToast } from '@/hooks/use-toast';
import { bbox } from '@turf/turf';
import { cn } from '@/lib/utils';
import { API_ENDPOINTS } from '@/constants';
import { API_BASE_URL, buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';
import { getAllFarms, updateFarmName, deleteFarm } from '@/services/farmService';
import { DateTimeline, type DateObservation } from './DateTimeline';
import { IndicesTiles } from './IndicesTiles';

interface SatelliteLayer {
  satellite: string;
  urlFormat: string;
  token?: string;
  mapid?: string;
  cloudCover?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  mean_value?: number | null;
  std_dev?: number | null;
  data_source?: {
    satellites: string[];
    description: string;
  };
  metadata?: {
    algorithm: string;
    calculationMethod?: string;
    cloudFilter?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

interface EarthEngineData {
  urlFormat: string;
  token?: string;
  mapid?: string;
  geojson: any; // Using any for now to avoid complex GeoJSON type issues
  poiPolygon: any; // Using any for now to avoid complex GeoJSON type issues
  cloudCover?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  mean_value?: number | null;
  std_dev?: number | null;
  date: number;
  metadata?: {
    algorithm: string;
    indexType?: string;
    calculationMethod?: string;
    dataSource?: {
      satellites: string[];
      description: string;
    };
    cloudFilter?: string;
    dateRange?: {
      start: string;
      end: string;
    };
    satellites?: string[];
  };
  satellites?: SatelliteLayer[];
}

interface CachedMapData {
  [index: string]: EarthEngineData;
}

interface SavedPolygon {
  id: string;
  name: string;
  geojson: any;
  createdAt: string;
  indices?: {
    [index: string]: EarthEngineData;
  };
}

interface FieldMapProps {
  className?: string;
  height?: string;
  farmId?: string | null;
}

const ALL_SUPPORTED_INDICES = [
  'ndvi',
  'evi',
  'savi',
  'msavi',
  'ndwi',
  'nitrogen',
  'phosphorus',
  'potassium',
  'salinity',
  'ph',
  'moisture',
  'carbon',
  'sar_moisture'
] as const;

export const FieldMap: React.FC<FieldMapProps> = ({
  className,
  height = "h-96",
  farmId: propFarmId
}) => {
  const [earthEngineData, setEarthEngineData] = useState<EarthEngineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false); // Separate state for map-specific loading (index/date changes)
  const [selectedIndex, setSelectedIndex] = useState('ndvi');
  const [allowedIndices, setAllowedIndices] = useState<string[]>([...ALL_SUPPORTED_INDICES]);
  const [mapCache, setMapCache] = useState<CachedMapData>({});
  const [savedPolygons, setSavedPolygons] = useState<SavedPolygon[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [currentPolygonId, setCurrentPolygonId] = useState<string | null>(null);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(propFarmId || null);
  const [selectedSatellite, setSelectedSatellite] = useState<string>('combined');
  const [polygonSearchQuery, setPolygonSearchQuery] = useState('');
  const [showPolygonManager, setShowPolygonManager] = useState(false);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [editPolygonName, setEditPolygonName] = useState('');
  const isInitialMount = useRef(true); // Track if this is the first render
  const { toast } = useToast();

  // Helper function to handle index selection (cache disabled)
  const handleIndexSelection = useCallback((index: string, options?: { force?: boolean }) => {
    const normalizedIndex = index.toLowerCase();
    const isAllowed = allowedIndices.length === 0 || allowedIndices.includes(normalizedIndex);

    if (!options?.force && !isAllowed) {
      toast({
        title: 'Index not available',
        description: `${normalizedIndex.toUpperCase()} is not supported for the selected satellite/date.`,
        variant: 'destructive'
      });
      return;
    }

    console.log(`🎯 Index selected: ${normalizedIndex}`);
    console.log(`🚫 Cache disabled - will fetch fresh from Supabase`);
    setSelectedIndex(normalizedIndex);
    setSelectedSatellite('combined');
    setMapLoading(true); // Show map loading overlay when switching indices
  }, [allowedIndices, toast]);

  // Leaflet base tile - Using Esri World Imagery for satellite view
  const baseTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  const availableLayers = useMemo(() => {
    if (!earthEngineData) return [];

    const combinedLayer: SatelliteLayer = {
      satellite: 'Combined',
      urlFormat: earthEngineData.urlFormat,
      token: earthEngineData.token,
      mapid: earthEngineData.mapid,
      cloudCover: earthEngineData.cloudCover ?? null,
      min_value: earthEngineData.min_value ?? null,
      max_value: earthEngineData.max_value ?? null,
      mean_value: earthEngineData.mean_value ?? null,
      std_dev: earthEngineData.std_dev ?? null,
      data_source: earthEngineData.metadata?.dataSource,
      metadata: {
        algorithm: earthEngineData.metadata?.algorithm || selectedIndex.toUpperCase(),
        calculationMethod: earthEngineData.metadata?.calculationMethod,
        cloudFilter: earthEngineData.metadata?.cloudFilter,
        dateRange: earthEngineData.metadata?.dateRange
      }
    };

    const satelliteLayers = Array.isArray(earthEngineData.satellites)
      ? earthEngineData.satellites
      : [];

    return [combinedLayer, ...satelliteLayers];
  }, [earthEngineData, selectedIndex]);

  const activeLayer = useMemo(() => {
    if (availableLayers.length === 0) return null;
    if (!selectedSatellite || selectedSatellite === 'combined') {
      return availableLayers[0];
    }
    return availableLayers.find(layer => layer.satellite === selectedSatellite) || availableLayers[0];
  }, [availableLayers, selectedSatellite]);

  const earthEngineTileUrl = useMemo(() => {
    if (!activeLayer?.urlFormat) return null;
    if (activeLayer.token) {
      const separator = activeLayer.urlFormat.includes('?') ? '&' : '?';
      return `${activeLayer.urlFormat}${separator}token=${activeLayer.token}`;
    }
    return activeLayer.urlFormat;
  }, [activeLayer]);

  const fetchEarthEngineData = useCallback(async () => {
    // Check if data is already cached for this index
    if (mapCache[selectedIndex]) {
      console.log(`Using cached data for ${selectedIndex}`);
      setEarthEngineData(mapCache[selectedIndex]);
      setSelectedSatellite('combined');
      return;
    }

    setLoading(true);
    try {
      // Require API base URL via env to avoid mismatched origins (Firebase vs Supabase Edge Functions)
      const apiBase = API_BASE_URL;
      console.log('[FieldMap] API base:', apiBase);
      // Quick health check to provide clearer errors
      try {
        const headers = getSupabaseFunctionHeaders();
        const health = await fetch(buildApiUrl(API_ENDPOINTS.health), {
          method: 'GET',
          headers: Object.keys(headers).length > 0 ? headers : undefined
        });
        if (!health.ok) {
          const body = await health.text();
          throw new Error(`API health check failed (${health.status}). ${body}`);
        }
      } catch (e: any) {
        throw new Error(`Cannot reach API at ${apiBase}. ${e?.message || e}`);
      }
      // Fetch data from the server with the selected index
      const requestUrl = buildApiUrl(`${API_ENDPOINTS.agriculturalIndices}?index=${selectedIndex}`);
      console.log('[FieldMap] Fetching:', requestUrl);
      const headers = getSupabaseFunctionHeaders();
      const response = await fetch(requestUrl, {
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Indices request failed (${response.status}). ${body}`);
      }

      const data = await response.json();

      // Validate that we received the expected data structure
      if (!data.urlFormat || !data.geojson || !data.poiPolygon) {
        throw new Error('Invalid data format received from server');
      }

      const earthEngineData: EarthEngineData = {
        ...data,
        cloudCover: typeof data.cloudCover === 'number' ? data.cloudCover : null,
        min_value: data.min_value ?? null,
        max_value: data.max_value ?? null,
        mean_value: data.mean_value ?? null,
        std_dev: data.std_dev ?? null,
        satellites: Array.isArray(data.satellites) ? data.satellites : [],
        date: new Date().getTime()
      };

      // Cache the new data
      setMapCache(prev => ({
        ...prev,
        [selectedIndex]: earthEngineData
      }));

      setEarthEngineData(earthEngineData);
      setSelectedSatellite('combined');

    } catch (error) {
      console.error('Error fetching Earth Engine data:', error);
      toast({
        title: "Satellite data error",
        description: error instanceof Error ? error.message : "Failed to load satellite data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setMapLoading(false); // Hide map loading overlay
    }
  }, [selectedIndex, toast, mapCache]);

  // Initialize and load saved polygons from database (with localStorage fallback)
  useEffect(() => {
    const loadPolygons = async () => {
      let polygons: SavedPolygon[] = [];

      // Try to load from database first
      try {
        const farms = await getAllFarms();
        polygons = farms.map(farm => ({
          id: farm.id,
          name: farm.name,
          geojson: {
            type: 'Feature' as const,
            geometry: farm.geometry,
            properties: {}
          },
          createdAt: farm.created_at || new Date().toISOString(),
        }));

        // Also sync to localStorage as cache
        if (polygons.length > 0) {
          localStorage.setItem('savedPolygons', JSON.stringify(polygons));
        }
      } catch (error) {
        console.warn('Failed to load farms from database, falling back to localStorage:', error);
        
        // Fallback to localStorage
        const stored = localStorage.getItem('savedPolygons');
        if (stored) {
          try {
            polygons = JSON.parse(stored);
          } catch (e) {
            console.error('Failed to load saved polygons from localStorage:', e);
          }
        }
      }

      // Add default "Jash farm" if no farms exist
      if (polygons.length === 0) {
        const defaultJashFarmGeoJSON = {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[
              [-77.84787380620527, 40.760804082400966],
              [-77.8460000532441, 40.758886478177885],
              [-77.8438098442277, 40.76055807705745],
              [-77.84583349742549, 40.76257024787489],
              [-77.84787380620527, 40.760804082400966]
            ]]
          },
          properties: {}
        };

        const defaultPolygon: SavedPolygon = {
          id: 'df43eedf-850d-454c-9fbf-36a052be10c0',
          name: 'Jash farm',
          geojson: defaultJashFarmGeoJSON,
          createdAt: new Date().toISOString(),
        };

        polygons = [defaultPolygon];
        localStorage.setItem('savedPolygons', JSON.stringify(polygons));
      }

      setSavedPolygons(polygons);

      // Set selected farm: prioritize propFarmId, then "Abe's farm", then "Jash farm", then first available
      if (propFarmId) {
        const propFarm = polygons.find(p => p.id === propFarmId);
        if (propFarm) {
          setSelectedFarmId(propFarmId);
          setCurrentPolygonId(propFarmId);
        }
      } else {
        const abesFarm = polygons.find(p => p.name?.toLowerCase().includes("abe"));
        if (abesFarm) {
          setSelectedFarmId(abesFarm.id);
          setCurrentPolygonId(abesFarm.id);
        } else {
          const jashFarm = polygons.find(p => p.name === 'Jash farm');
          if (jashFarm) {
            setSelectedFarmId(jashFarm.id);
            setCurrentPolygonId(jashFarm.id);
          } else if (polygons.length > 0) {
            setSelectedFarmId(polygons[0].id);
            setCurrentPolygonId(polygons[0].id);
          }
        }
      }
    };

    loadPolygons();
  }, [propFarmId]);

  // Initial fetch on mount - wait for savedPolygons to be loaded first
  useEffect(() => {
    // Only fetch if we have saved polygons and a selected farm
    if (savedPolygons.length > 0 && selectedFarmId) {
      // Don't fetch immediately, let the selectedIndex effect handle it
      return;
    }
    // Fallback: fetch default data if no farms are selected
    if (savedPolygons.length === 0) {
      fetchEarthEngineData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPolygons.length, selectedFarmId]);

  // Fetch indices for a polygon
  const fetchIndicesForPolygon = useCallback(async (polygonGeoJSON: any, polygonId: string) => {
    setLoading(true);
    try {
      // Build API URL with date range if a specific date is selected
      let apiUrl = `${API_ENDPOINTS.agriculturalIndices}?index=${selectedIndex}&polygon=${encodeURIComponent(
        JSON.stringify(polygonGeoJSON.geometry)
      )}`;

      // If a specific date is selected, use it for the date range
      if (selectedDate) {
        const date = new Date(selectedDate);
        const startDate = new Date(date);
        startDate.setDate(startDate.getDate() - 2); // 2 days before
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 2); // 2 days after

        apiUrl += `&start=${startDate.toISOString().split('T')[0]}&end=${endDate.toISOString().split('T')[0]}`;

        console.log(`📅 Fetching data for selected date: ${selectedDate}`);
      }

      // Send polygon to API and fetch indices
      const headers = getSupabaseFunctionHeaders();
      const response = await fetch(buildApiUrl(apiUrl), {
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch indices: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.urlFormat || !data.geojson || !data.poiPolygon) {
        throw new Error('Invalid data format received from server');
      }

      const earthEngineData: EarthEngineData = {
        ...data,
        cloudCover: typeof data.cloudCover === 'number' ? data.cloudCover : null,
        min_value: data.min_value ?? null,
        max_value: data.max_value ?? null,
        mean_value: data.mean_value ?? null,
        std_dev: data.std_dev ?? null,
        satellites: Array.isArray(data.satellites) ? data.satellites : [],
        date: selectedDate ? new Date(selectedDate).getTime() : new Date().getTime()
      };

      // Update saved polygon with indices
      setSavedPolygons(prev => {
        const updated = prev.map(p => {
          if (p.id === polygonId) {
            return {
              ...p,
              indices: {
                ...p.indices,
                [selectedIndex]: earthEngineData
              }
            };
          }
          return p;
        });
        localStorage.setItem('savedPolygons', JSON.stringify(updated));
        return updated;
      });

      // Update map cache and display (include date in cache key)
      const cacheKey = selectedDate
        ? `${polygonId}-${selectedIndex}-${selectedDate}`
        : `${polygonId}-${selectedIndex}`;

      setMapCache(prev => ({
        ...prev,
        [cacheKey]: earthEngineData
      }));

      setEarthEngineData(earthEngineData);
      setSelectedSatellite('combined');

      const farmName = savedPolygons.find(p => p.id === polygonId)?.name || 'polygon';
      const dateStr = selectedDate ? ` (${selectedDate})` : '';
      toast({
        title: "Indices Loaded",
        description: `${selectedIndex.toUpperCase()} data loaded for ${farmName}${dateStr}.`,
      });
    } catch (error) {
      console.error('Error fetching indices for polygon:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load indices for polygon.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setMapLoading(false); // Hide map loading overlay
    }
  }, [selectedIndex, selectedDate, toast, savedPolygons]);

  // Sync propFarmId with selectedFarmId when it changes
  useEffect(() => {
    if (propFarmId && propFarmId !== selectedFarmId) {
      setSelectedFarmId(propFarmId);
      setCurrentPolygonId(propFarmId);
    }
  }, [propFarmId, selectedFarmId]);

  // Handle farm selection - load indices for selected farm
  const handleFarmSelection = useCallback(async (farmId: string) => {
    const farm = savedPolygons.find(p => p.id === farmId);
    if (!farm) return;

    setSelectedFarmId(farmId);
    setCurrentPolygonId(farmId);

    // Check if we have cached indices for this farm and selected index
    const cacheKey = `${farmId}-${selectedIndex}`;
    if (mapCache[cacheKey]) {
      setEarthEngineData(mapCache[cacheKey]);
      setSelectedSatellite('combined');
      setLoading(false);
      setMapLoading(false); // Hide map loading overlay when using cached data
      return;
    }

    // Check if farm has indices stored
    if (farm.indices && farm.indices[selectedIndex]) {
      setEarthEngineData(farm.indices[selectedIndex]);
      setMapCache(prev => ({
        ...prev,
        [cacheKey]: farm.indices![selectedIndex]
      }));
      setLoading(false);
      setMapLoading(false); // Hide map loading overlay when using stored indices
      return;
    }

    // Fetch indices for this farm
    await fetchIndicesForPolygon(farm.geojson, farmId);
  }, [savedPolygons, selectedIndex, mapCache, fetchIndicesForPolygon]);

  // Refresh map data when selected index or date changes
  useEffect(() => {
    // Skip showing loading overlay on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Still fetch data, but don't show loading overlay
      if (selectedFarmId) {
        const farm = savedPolygons.find(p => p.id === selectedFarmId);
        if (farm) {
          fetchIndicesForPolygon(farm.geojson, selectedFarmId);
        }
      } else {
        fetchEarthEngineData();
      }
      return;
    }

    console.log(`🔄 Index changed to: ${selectedIndex}`);
    console.log(`📍 Selected farm ID: ${selectedFarmId}`);
    console.log(`📅 Selected date: ${selectedDate || 'latest'}`);
    console.log(`🚫 CACHE DISABLED - Always fetching fresh from Supabase`);

    setMapLoading(true); // Show map loading overlay when switching indices or dates

    // If a farm is selected, fetch its indices
    if (selectedFarmId) {
      const farm = savedPolygons.find(p => p.id === selectedFarmId);
      if (farm) {
        console.log(`📡 Fetching ${selectedIndex} for farm: ${farm.name || selectedFarmId}${selectedDate ? ` on ${selectedDate}` : ''}`);
        fetchIndicesForPolygon(farm.geojson, selectedFarmId);
      }
    } else {
      console.log(`📡 Fetching ${selectedIndex} (no specific farm)`);
      fetchEarthEngineData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, selectedFarmId, selectedDate]);

  // Helper to compute Leaflet bounds from GeoJSON bbox
  const computedBounds = useMemo(() => {
    // Use selected farm's polygon if available, otherwise use earth engine data
    if (selectedFarmId) {
      const selectedFarm = savedPolygons.find(p => p.id === selectedFarmId);
      if (selectedFarm?.geojson?.geometry) {
        const [minX, minY, maxX, maxY] = bbox(selectedFarm.geojson.geometry) as [number, number, number, number];
        return [
          [minY, minX],
          [maxY, maxX]
        ] as [[number, number], [number, number]];
      }
    }

    if (earthEngineData?.geojson) {
      const [minX, minY, maxX, maxY] = bbox(earthEngineData.geojson) as [number, number, number, number];
      return [
        [minY, minX],
        [maxY, maxX]
      ] as [[number, number], [number, number]];
    }

    return null;
  }, [earthEngineData, selectedFarmId, savedPolygons]);

  // Inner component to manage map effects with React-Leaflet context
  const MapEffects: React.FC = () => {
    const map = useMap();

    useEffect(() => {
      if (computedBounds) {
        map.fitBounds(computedBounds, { padding: [50, 50] });
      }
    }, [map, computedBounds]);

    return null;
  };


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
      case 'sar_moisture':
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
      case 'sar_moisture':
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
      case 'sar_moisture':
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
      case 'sar_moisture':
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

  // Filter polygons based on search query
  const filteredPolygons = useMemo(() => {
    if (!polygonSearchQuery.trim()) {
      return savedPolygons;
    }
    const query = polygonSearchQuery.toLowerCase();
    return savedPolygons.filter(polygon =>
      polygon.name.toLowerCase().includes(query) ||
      polygon.id.toLowerCase().includes(query)
    );
  }, [savedPolygons, polygonSearchQuery]);

  // Delete polygon from database and localStorage
  const handleDeletePolygon = useCallback(async (polygonId: string) => {
    try {
      // Delete from database
      const success = await deleteFarm(polygonId);
      
      if (!success) {
        throw new Error('Failed to delete farm from database');
      }

      // Update local state
      const updated = savedPolygons.filter(p => p.id !== polygonId);
      setSavedPolygons(updated);
      localStorage.setItem('savedPolygons', JSON.stringify(updated));

      // If deleted polygon was selected, select first available or clear
      if (selectedFarmId === polygonId) {
        if (updated.length > 0) {
          await handleFarmSelection(updated[0].id);
        } else {
          setSelectedFarmId(null);
          setCurrentPolygonId(null);
          setEarthEngineData(null);
        }
      }

      toast({
        title: "Polygon Deleted",
        description: "Polygon has been removed from database successfully.",
      });
    } catch (error) {
      console.error('Error deleting polygon:', error);
      toast({
        title: "Error Deleting Polygon",
        description: error instanceof Error ? error.message : "Failed to delete polygon from database.",
        variant: "destructive",
      });
    }
  }, [savedPolygons, selectedFarmId, handleFarmSelection, toast]);

  // Edit polygon name
  const handleEditPolygon = useCallback((polygonId: string) => {
    const polygon = savedPolygons.find(p => p.id === polygonId);
    if (polygon) {
      setEditingPolygonId(polygonId);
      setEditPolygonName(polygon.name);
    }
  }, [savedPolygons]);

  // Save edited polygon name to database
  const handleSaveEdit = useCallback(async () => {
    if (!editingPolygonId || !editPolygonName.trim()) return;

    try {
      // Update in database
      const updatedFarm = await updateFarmName(editingPolygonId, editPolygonName.trim());
      
      if (!updatedFarm) {
        throw new Error('Failed to update farm name in database');
      }

      // Update local state
      const updated = savedPolygons.map(p =>
        p.id === editingPolygonId
          ? { ...p, name: updatedFarm.name }
          : p
      );
      setSavedPolygons(updated);
      localStorage.setItem('savedPolygons', JSON.stringify(updated));

      setEditingPolygonId(null);
      setEditPolygonName('');

      toast({
        title: "Polygon Updated",
        description: "Polygon name has been updated successfully.",
      });
    } catch (error) {
      console.error('Error updating polygon name:', error);
      toast({
        title: "Error Updating Polygon",
        description: error instanceof Error ? error.message : "Failed to update polygon name in database.",
        variant: "destructive",
      });
    }
  }, [editingPolygonId, editPolygonName, savedPolygons, toast]);

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
              Google Project: wrkfarm-415118
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
        {/* Polygon Manager Dialog */}
        <Dialog open={showPolygonManager} onOpenChange={setShowPolygonManager}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Layers className="w-5 h-5" />
                <span>Manage Polygons</span>
              </DialogTitle>
              <DialogDescription>
                Search, edit, or delete your saved field polygons
              </DialogDescription>
            </DialogHeader>

            {/* Search Bar */}
            <div className="relative py-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search polygons by name..."
                value={polygonSearchQuery}
                onChange={(e) => setPolygonSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {polygonSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setPolygonSearchQuery('')}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Polygon List */}
            <div className="flex-1 overflow-y-auto border rounded-lg">
              {filteredPolygons.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {polygonSearchQuery ? (
                    <>
                      <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">No polygons found</p>
                      <p className="text-sm mt-1">Try a different search term</p>
                    </>
                  ) : (
                    <>
                      <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">No polygons saved yet</p>
                      <p className="text-sm mt-1">Polygons will appear here once saved</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredPolygons.map((polygon) => (
                    <div
                      key={polygon.id}
                      className={cn(
                        "p-4 hover:bg-muted/50 transition-colors",
                        selectedFarmId === polygon.id && "bg-primary/5 border-l-4 border-l-primary"
                      )}
                    >
                      {editingPolygonId === polygon.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editPolygonName}
                            onChange={(e) => setEditPolygonName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit();
                              } else if (e.key === 'Escape') {
                                setEditingPolygonId(null);
                                setEditPolygonName('');
                              }
                            }}
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={!editPolygonName.trim()}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPolygonId(null);
                              setEditPolygonName('');
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                              <p className="font-semibold text-foreground truncate">{polygon.name}</p>
                              {selectedFarmId === polygon.id && (
                                <Badge variant="default" className="text-xs">Active</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              ID: {polygon.id}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                handleFarmSelection(polygon.id);
                                setShowPolygonManager(false);
                              }}
                              className="h-8"
                            >
                              Select
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPolygon(polygon.id)}
                              className="h-8"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete "${polygon.name}"?`)) {
                                  handleDeletePolygon(polygon.id);
                                }
                              }}
                              className="h-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {filteredPolygons.length} of {savedPolygons.length} polygon{filteredPolygons.length !== 1 ? 's' : ''}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPolygonManager(false);
                    setPolygonSearchQuery('');
                  }}
                >
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  Vegetation Health
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
                  Enhanced Vegetation
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
                  Soil Adjusted
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
                  Crop Health
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
                  Water Content
                </Button>
              </div>
            </div>

            {/* Right scroll indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-muted/30 to-transparent pointer-events-none z-10"></div>
          </div>

          {/* Satellite Selector */}
          {availableLayers.length > 1 && (
            <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
              <div className="relative">
                <select
                  value={selectedSatellite === 'combined' ? 'combined' : selectedSatellite}
                  onChange={(e) => setSelectedSatellite(e.target.value)}
                  className="appearance-none bg-background border border-input rounded-md px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex-shrink-0 min-w-[150px]"
                >
                  <option value="combined">All Satellites</option>
                  {availableLayers.slice(1).map((layer) => (
                    <option key={layer.satellite} value={layer.satellite}>
                      {layer.satellite}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Polygon Management */}
          <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
            {savedPolygons.length > 0 && (
              <div className="relative">
                <select
                  value={selectedFarmId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleFarmSelection(e.target.value);
                    }
                  }}
                  className="appearance-none bg-background border border-input rounded-md px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex-shrink-0 min-w-[150px]"
                >
                  {savedPolygons.map((polygon) => (
                    <option key={polygon.id} value={polygon.id}>
                      {polygon.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPolygonManager(true)}
              className="flex-shrink-0"
            >
              <Layers className="w-4 h-4 mr-2" />
              Manage ({savedPolygons.length})
            </Button>
          </div>

          {/* Map Controls */}
          <div className="flex items-center space-x-2 ml-4 flex-shrink-0 relative">
            {savedPolygons.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(savedPolygons, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `all-polygons-${Date.now()}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast({
                    title: "Polygons Exported",
                    description: `All ${savedPolygons.length} polygons have been exported.`,
                  });
                }}
                className="flex-shrink-0"
              >
                <Download className="w-4 h-4 mr-2" />
                Export All ({savedPolygons.length})
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={loading} onClick={fetchEarthEngineData} className="flex-shrink-0">
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh Data
            </Button>
          </div>
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
          className={cn("w-full relative", height)}
          style={{ minHeight: '400px' }}
        >
          <MapContainer
            center={[0, 0]}
            zoom={2}
            minZoom={2}
            maxZoom={20}
            style={{ height: '100%', width: '100%' }}
            preferCanvas
          >
            <TileLayer url={baseTileUrl} attribution="&copy; Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community" />
            {earthEngineTileUrl && (
              <TileLayer url={earthEngineTileUrl} opacity={1} zIndex={500} />
            )}
            {/* Display selected farm polygon */}
            {selectedFarmId && (() => {
              const selectedFarm = savedPolygons.find(p => p.id === selectedFarmId);
              if (selectedFarm) {
                return (
                  <GeoJSON
                    key={selectedFarmId}
                    data={selectedFarm.geojson}
                    style={{
                      color: selectedFarmId === 'df43eedf-850d-454c-9fbf-36a052be10c0' ? '#3b82f6' : '#10b981',
                      weight: 3,
                      fillOpacity: 0.15,
                      fillColor: selectedFarmId === 'df43eedf-850d-454c-9fbf-36a052be10c0' ? '#3b82f6' : '#10b981'
                    }}
                  />
                );
              }
              return null;
            })()}
            {/* Default polygon from Earth Engine data (fallback) */}
            {!selectedFarmId && earthEngineData?.poiPolygon && (
              <GeoJSON
                data={earthEngineData.poiPolygon}
                style={{ color: '#3b82f6', weight: 2, dashArray: '2,2', fillOpacity: 0.1 }}
              />
            )}
            <MapEffects />
          </MapContainer>
          {/* Loading Overlay - Only shows when switching indices or dates */}
          {mapLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-[1000] flex items-center justify-center">
              <div className="bg-card/95 backdrop-blur-sm rounded-xl p-6 shadow-2xl border border-border/50 flex flex-col items-center space-y-4 min-w-[200px]">
                <div className="relative">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Satellite className="w-4 h-4 text-primary/60" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Loading {selectedIndex.toUpperCase()} data
                  </p>
                  {selectedDate && (
                    <p className="text-xs text-muted-foreground">
                      Date: {new Date(selectedDate).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground animate-pulse">
                    Processing satellite imagery...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Data Status Overlay */}
          {activeLayer && (
            <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 z-10">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold">
                  {selectedIndex.toUpperCase()} • {activeLayer.satellite === 'Combined' ? 'All Satellites' : activeLayer.satellite}
                </span>
                {mapCache[selectedIndex] && (
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700">
                    Cached
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Cloud Cover: {typeof activeLayer.cloudCover === 'number' ? activeLayer.cloudCover.toFixed(1) : '—'}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Algorithm: {activeLayer.metadata?.algorithm || selectedIndex.toUpperCase()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {getIndexUnit(selectedIndex)}
              </div>
              {activeLayer.metadata?.calculationMethod && (
                <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {activeLayer.metadata.calculationMethod}
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
        {activeLayer && (
          <div className="p-4 bg-muted/20 border-t border-border/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">
                  {typeof activeLayer.cloudCover === 'number'
                    ? `${activeLayer.cloudCover.toFixed(1)}%`
                    : '—'}
                </div>
                <div className="text-xs text-muted-foreground">Cloud Cover</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {selectedIndex.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeLayer.satellite === 'Combined' ? 'All Satellites' : activeLayer.satellite}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">
                  {earthEngineData?.date ? new Date(earthEngineData.date).toLocaleDateString() : '—'}
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

      {/* Date Timeline - Scrollable date selector */}
      <div className="px-6 py-4 border-t border-border/30">
        <DateTimeline
          farmId={selectedFarmId || undefined}
          selectedDate={selectedDate}
          onDateSelect={(date, observation) => {
            setSelectedDate(date);
            if (observation) {
              const indices = observation.satelliteDetails
                ?.flatMap((detail) => Array.isArray(detail.indices) ? detail.indices : [])
                .map((idx) => idx.toLowerCase())
                .filter((idx) => typeof idx === 'string' && idx.length > 0) || [];

              const normalized = indices.length > 0
                ? Array.from(new Set(indices))
                : [...ALL_SUPPORTED_INDICES];

              setAllowedIndices(normalized);

              if (normalized.length > 0 && !normalized.includes(selectedIndex)) {
                const fallbackIndex = normalized.includes('ndvi') ? 'ndvi' : normalized[0];
                handleIndexSelection(fallbackIndex, { force: true });
              }
            } else {
              setAllowedIndices([...ALL_SUPPORTED_INDICES]);
            }
            console.log('Selected date:', date);
          }}
        />
      </div>

      {/* Agricultural Indices Tiles */}
      {/* <div className="px-6 py-4 border-t border-border/30">
        <IndicesTiles
          farmId={selectedFarmId || undefined}
          selectedDate={selectedDate}
          allowedIndices={allowedIndices}
          onIndexSelect={(indexType) => {
            console.log('Index selected:', indexType);
            handleIndexSelection(indexType);
          }}
        />
      </div> */}
    </Card>
  );
};