import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/services/supabase';

interface Farm {
  id: string;
  name: string;
  geometry: any;
  area_hectares: number;
}

export function useAbeFarm() {
  const { user } = useAuth();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setFarmId(null);
      setFarm(null);
      return;
    }

    const fetchFarm = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try to get farms for the current user
        let { data, error: queryError } = await supabase
          .from('farms')
          .select('id, name, geometry, area_hectares')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        // If no farms found with user_id, try to get any farm (backward compatibility)
        if (queryError || !data) {
          const { data: anyFarm, error: anyError } = await supabase
            .from('farms')
            .select('id, name, geometry, area_hectares')
            .limit(1)
            .single();

          if (anyError) {
            throw anyError;
          }
          data = anyFarm;
        }

        if (data) {
          setFarmId(data.id);
          setFarm(data as Farm);
        }
      } catch (err) {
        console.error('Error fetching farm:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchFarm();
  }, [user]);

  return {
    farmId,
    farm,
    loading,
    error,
  };
}
