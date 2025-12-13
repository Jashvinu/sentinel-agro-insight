import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabase';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireFarm?: boolean; // If true, redirect to draw-polygon if user has no farms
}

export function ProtectedRoute({ children, requireFarm = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [hasFarm, setHasFarm] = useState<boolean | null>(null);
  const [checkingFarm, setCheckingFarm] = useState(false);

  useEffect(() => {
    if (!requireFarm || !user) {
      setHasFarm(null);
      return;
    }

    const checkFarm = async () => {
      setCheckingFarm(true);
      try {
        // First try to get farms with user_id
        let { data, error } = await supabase
          .from('farms')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        // If no farms found with user_id, check if user_id column exists
        // If column doesn't exist or query fails, allow access (backward compatibility)
        if (error) {
          // If error is about column not existing, check all farms (backward compatibility)
          if (error.message?.includes('column') || error.code === '42703') {
            console.log('user_id column may not exist, checking all farms for backward compatibility');
            const { data: allFarms } = await supabase
              .from('farms')
              .select('id')
              .limit(1);
            setHasFarm(allFarms && allFarms.length > 0);
          } else {
            console.error('Error checking farms:', error);
            setHasFarm(false);
          }
        } else {
          setHasFarm(data && data.length > 0);
        }
      } catch (error) {
        console.error('Error checking farms:', error);
        // On error, allow access (backward compatibility)
        setHasFarm(true);
      } finally {
        setCheckingFarm(false);
      }
    };

    checkFarm();
  }, [user, requireFarm]);

  if (loading || (requireFarm && checkingFarm)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If farm is required and user has no farms, redirect to draw-polygon
  if (requireFarm && hasFarm === false) {
    return <Navigate to="/draw-polygon" replace />;
  }

  return <>{children}</>;
}

