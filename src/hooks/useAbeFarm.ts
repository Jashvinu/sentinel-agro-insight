import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getDefaultFarm, getAllFarms, saveFarm } from '@/services/farmService';

interface Farm {
  id: string;
  name: string;
  geometry: any;
  area_hectares?: number;
}

// Default Jash farm polygon data
const DEFAULT_JASH_FARM = {
  id: 'df43eedf-850d-454c-9fbf-36a052be10c0',
  name: 'Jash farm',
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
  area_hectares: 12.5
};

/**
 * Hook to get farm data, prioritizing Jash farm and syncing between storage keys
 */
export function useAbeFarm() {
  const { user } = useAuth();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setFarmId(null);
      setFarm(null);
      setFarms([]);
      setLoading(false);
      return;
    }

    const fetchFarms = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get all farms from farmService storage (sentinel_farms)
        let allFarms = await getAllFarms();

        // Also check savedPolygons localStorage (used by FieldMap)
        const savedPolygonsStr = localStorage.getItem('savedPolygons');
        if (savedPolygonsStr) {
          try {
            const savedPolygons = JSON.parse(savedPolygonsStr);
            // Merge any polygons not in allFarms
            savedPolygons.forEach((polygon: any) => {
              if (!allFarms.find(f => f.id === polygon.id)) {
                allFarms.push({
                  id: polygon.id,
                  name: polygon.name,
                  geometry: polygon.geojson?.geometry || polygon.geometry,
                  area_hectares: polygon.area_hectares || 0,
                  user_id: 'local-dev-user',
                  created_at: polygon.createdAt || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              }
            });
          } catch (e) {
            console.warn('[useAbeFarm] Could not parse savedPolygons:', e);
          }
        }

        // Ensure Jash farm exists
        const jashFarm = allFarms.find(f => f.id === DEFAULT_JASH_FARM.id || f.name === 'Jash farm');
        if (!jashFarm && allFarms.length === 0) {
          // Add default Jash farm if no farms exist
          allFarms.push({
            ...DEFAULT_JASH_FARM,
            user_id: 'local-dev-user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);
          console.log('[useAbeFarm] Added default Jash farm');
        }

        setFarms(allFarms as Farm[]);

        // Prioritize Jash farm, then first available
        const priorityFarm = allFarms.find(f => f.id === DEFAULT_JASH_FARM.id || f.name === 'Jash farm') || allFarms[0];
        if (priorityFarm) {
          setFarmId(priorityFarm.id);
          setFarm(priorityFarm as Farm);
          console.log('[useAbeFarm] Selected farm:', priorityFarm.name);
        }

        console.log('[useAbeFarm] Loaded', allFarms.length, 'farms');
      } catch (err) {
        console.error('Error fetching farms:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchFarms();
  }, [user]);

  // Function to select a different farm
  const selectFarm = (id: string) => {
    const selectedFarm = farms.find(f => f.id === id);
    if (selectedFarm) {
      setFarmId(selectedFarm.id);
      setFarm(selectedFarm);
    }
  };

  // Function to refresh farms list
  const refreshFarms = async () => {
    setLoading(true);
    try {
      const allFarms = await getAllFarms();
      setFarms(allFarms as Farm[]);

      // Update current farm if it still exists
      if (farmId) {
        const currentFarm = allFarms.find(f => f.id === farmId);
        if (currentFarm) {
          setFarm(currentFarm as Farm);
        } else if (allFarms.length > 0) {
          // If current farm was deleted, select the first one
          setFarmId(allFarms[0].id);
          setFarm(allFarms[0] as Farm);
        } else {
          setFarmId(null);
          setFarm(null);
        }
      } else if (allFarms.length > 0) {
        setFarmId(allFarms[0].id);
        setFarm(allFarms[0] as Farm);
      }
    } catch (err) {
      console.error('Error refreshing farms:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    farmId,
    farm,
    farms,
    loading,
    error,
    selectFarm,
    refreshFarms,
  };
}
