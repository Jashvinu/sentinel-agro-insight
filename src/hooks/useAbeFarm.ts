import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getDefaultFarm, getAllFarms, saveFarm } from '@/services/farmService';

interface Farm {
  id: string;
  name: string;
  geometry: any;
  area_hectares?: number;
}

// Default Evergreen Farms polygon data
const DEFAULT_FARM = {
  id: 'd556697f-f6a0-457e-b5f8-61657c65c104',
  name: 'Evergreen Farms',
  geometry: {
    type: 'MultiPolygon' as const,
    coordinates: [
      [[[-78.09880022071837,40.65864666584693],[-78.09917082015923,40.657905478380286],[-78.10028261848186,40.65693425475189],[-78.10011416419079,40.65578410322158],[-78.10125965337149,40.65417385776789],[-78.09940665616713,40.652512452677996],[-78.09944034702522,40.650697639844],[-78.0995414196001,40.65016085475858],[-78.09482469944236,40.64757911378487],[-78.09250003022157,40.64995636406658],[-78.09243264850475,40.65074876200808],[-78.09054596044164,40.652154606166874],[-78.08876034495346,40.65102993320929],[-78.08724425633122,40.652154606166874],[-78.09880022071837,40.65864666584693]]],
      [[[-78.06158287165816,40.6713457913508],[-78.05965737181967,40.670419667896795],[-78.05322338455537,40.67262809489833],[-78.05477317710816,40.674693976521866],[-78.06158287165816,40.6713457913508]]]
    ]
  },
  area_hectares: 85.0
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

        // Always ensure Evergreen Farms exists with correct geometry
        const existingIdx = allFarms.findIndex(f => f.id === DEFAULT_FARM.id || f.name === 'Evergreen Farms');
        const defaultFarmEntry = {
          ...DEFAULT_FARM,
          user_id: 'local-dev-user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any;
        if (existingIdx >= 0) {
          // Replace with correct geometry (in case localStorage has stale data)
          allFarms[existingIdx] = defaultFarmEntry;
          console.log('[useAbeFarm] Updated Evergreen Farms geometry');
        } else {
          // Add if not found
          allFarms.unshift(defaultFarmEntry);
          console.log('[useAbeFarm] Added default Evergreen Farms');
        }

        setFarms(allFarms as Farm[]);

        // Prioritize Jash farm, then first available
        const priorityFarm = allFarms.find(f => f.id === DEFAULT_FARM.id || f.name === 'Evergreen Farms') || allFarms[0];
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
