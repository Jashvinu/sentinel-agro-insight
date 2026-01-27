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
 * Using actual field coordinates from Bangalore, Karnataka, India
 */
const DEFAULT_EVERGREEN_FARM = {
  id: 'farm-1769529565115-xww13ef6h',
  name: 'Evergreen Farms',
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [77.77333199305133, 12.392392446684909],
      [77.77285377084087, 12.391034719901086],
      [77.77415744218291, 12.390603704636632],
      [77.77438732135664, 12.391302225016886],
      [77.77376792469431, 12.391501801924363],
      [77.77399141833513, 12.392187846379386],
      [77.77333199305133, 12.392392446684909]
    ]]
  },
  bounds: {
    minLng: 77.77285377084087,
    minLat: 12.390603704636632,
    maxLng: 77.77438732135664,
    maxLat: 12.392392446684909
  },
  area_hectares: 0.15,
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

