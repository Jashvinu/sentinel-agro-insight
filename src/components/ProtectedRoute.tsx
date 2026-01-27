import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Local storage key for farms (same as farmService)
const FARMS_STORAGE_KEY = 'sentinel_farms';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireFarm?: boolean; // If true, ensure default farm exists
}

/**
 * Default Evergreen Farm data for MVP mode
 * This farm is auto-seeded when no farms exist in localStorage
 */
const DEFAULT_EVERGREEN_FARM = {
  id: 'farm-1769529565115-xww13ef6h',
  name: 'Evergreen Farms',
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [-74.006, 40.7128],
      [-74.004, 40.7128],
      [-74.004, 40.7148],
      [-74.006, 40.7148],
      [-74.006, 40.7128]
    ]]
  },
  bounds: {
    minLng: -74.006,
    minLat: 40.7128,
    maxLng: -74.004,
    maxLat: 40.7148
  },
  area_hectares: 4.4,
  user_id: 'mvp-demo-user',
  status: 'active',
  created_at: '2026-01-27T00:00:00.000Z',
  updated_at: '2026-01-27T00:00:00.000Z'
};

/**
 * Check if farms exist in localStorage
 */
function hasLocalFarms(): boolean {
  try {
    const data = localStorage.getItem(FARMS_STORAGE_KEY);
    if (data) {
      const farms = JSON.parse(data);
      return Array.isArray(farms) && farms.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Seed default Evergreen Farm into localStorage if none exist
 */
function seedDefaultFarm(): void {
  try {
    if (!hasLocalFarms()) {
      console.log('[ProtectedRoute] No farms found - seeding default Evergreen Farm for MVP');
      localStorage.setItem(FARMS_STORAGE_KEY, JSON.stringify([DEFAULT_EVERGREEN_FARM]));
    }
  } catch (error) {
    console.error('[ProtectedRoute] Error seeding default farm:', error);
  }
}

/**
 * ProtectedRoute for MVP mode - bypasses login and ensures default farm exists
 * All routes are accessible without authentication
 */
export function ProtectedRoute({ children, requireFarm = false }: ProtectedRouteProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Seed default farm if required and none exist
    if (requireFarm) {
      seedDefaultFarm();
    }
    setIsReady(true);
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

  // MVP mode: always render children without authentication
  return <>{children}</>;
}

