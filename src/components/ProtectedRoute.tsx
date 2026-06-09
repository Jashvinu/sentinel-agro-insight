import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { getAllFarms } from '@/services/farmService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * If true, this route requires at least one saved farm. If none exists,
   * the user is bounced back to "/" to design one first.
   */
  requireFarm?: boolean;
}

export function ProtectedRoute({ children, requireFarm = false }: ProtectedRouteProps) {
  const [isReady, setIsReady] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkRoute = async () => {
      if (requireFarm) {
        const farms = await getAllFarms();
        if (!cancelled) {
          setShouldRedirect(farms.length === 0);
        }
      }

      if (!cancelled) {
        setIsReady(true);
      }
    };

    checkRoute();

    return () => {
      cancelled = true;
    };
  }, [requireFarm]);

  if (!isReady) {
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

  if (shouldRedirect) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
