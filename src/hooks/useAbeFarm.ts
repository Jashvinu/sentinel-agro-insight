import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getAllFarms } from '@/services/farmService';
import type { Geometry } from '@/services/supabase';

interface Farm {
  id: string;
  name: string;
  geometry: Geometry;
  area_hectares?: number;
  crop?: string;
  crop_type?: string;
  cropType?: string;
  primary_crop?: string;
}

const ACTIVE_FARM_KEY = 'activeFarmId';

/**
 * Hook to get farm data. The "active" farm is whichever the user most recently
 * saved in Supabase (id stored in localStorage under `activeFarmId`).
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
        const allFarms = await getAllFarms();
        setFarms(allFarms as Farm[]);

        const activeId = localStorage.getItem(ACTIVE_FARM_KEY);
        const active = activeId ? allFarms.find((f) => f.id === activeId) : undefined;
        const latestFarm = [...allFarms].sort((a, b) => {
          const aTime = a.created_at ? Date.parse(a.created_at) : 0;
          const bTime = b.created_at ? Date.parse(b.created_at) : 0;
          return bTime - aTime;
        })[0];
        const chosen = active || latestFarm;

        if (chosen) {
          setFarmId(chosen.id);
          setFarm(chosen as Farm);
          if (!activeId) {
            localStorage.setItem(ACTIVE_FARM_KEY, chosen.id);
          }
        } else {
          setFarmId(null);
          setFarm(null);
        }
      } catch (err) {
        console.error('Error fetching farms:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchFarms();
  }, [user]);

  const selectFarm = (id: string) => {
    const selectedFarm = farms.find((f) => f.id === id);
    if (selectedFarm) {
      setFarmId(selectedFarm.id);
      setFarm(selectedFarm);
      localStorage.setItem(ACTIVE_FARM_KEY, selectedFarm.id);
    }
  };

  const refreshFarms = async () => {
    setLoading(true);
    try {
      const allFarms = await getAllFarms();
      setFarms(allFarms as Farm[]);

      if (farmId) {
        const currentFarm = allFarms.find((f) => f.id === farmId);
        if (currentFarm) {
          setFarm(currentFarm as Farm);
        } else if (allFarms.length > 0) {
          setFarmId(allFarms[0].id);
          setFarm(allFarms[0] as Farm);
          localStorage.setItem(ACTIVE_FARM_KEY, allFarms[0].id);
        } else {
          setFarmId(null);
          setFarm(null);
          localStorage.removeItem(ACTIVE_FARM_KEY);
        }
      } else if (allFarms.length > 0) {
        setFarmId(allFarms[0].id);
        setFarm(allFarms[0] as Farm);
        localStorage.setItem(ACTIVE_FARM_KEY, allFarms[0].id);
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
