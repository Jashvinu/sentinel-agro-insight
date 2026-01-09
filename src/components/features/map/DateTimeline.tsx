import React, { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Cloud, Satellite } from 'lucide-react';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';

interface SatelliteDetail {
  name: string;
  indices: string[];
}

export interface DateObservation {
  observation_date: string;
  cloud_cover_percentage: number | null;
  tile_id: string;
  satellite: string;
  satellites: string[];
  satelliteDetails: SatelliteDetail[];
}

interface DateTimelineProps {
  farmId?: string;
  onDateSelect?: (date: string, observation: DateObservation) => void;
  selectedDate?: string;
}

// Helper functions outside component to avoid recreating on each render
const getCacheKey = (farmId: string) => `dateTimeline_cache_${farmId}`;

const loadFromCache = (farmId: string): DateObservation[] | null => {
  try {
    const cacheKey = getCacheKey(farmId);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Check if cache is older than 2 minutes - if so, consider it stale
      // Reduced from 5 minutes to ensure new dates appear faster
      const cacheAge = Date.now() - (timestamp || 0);
      const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

      if (cacheAge > CACHE_TTL) {
        return null; // Return null to force refresh
      }

      return data as DateObservation[];
    }
  } catch (err) {
  }
  return null;
};

const saveToCache = (farmId: string, data: DateObservation[]) => {
  try {
    const cacheKey = getCacheKey(farmId);
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (err) {
  }
};

function DateTimelineComponent({
  farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0',
  onDateSelect,
  selectedDate
}: DateTimelineProps) {
  // Initialize with cached data if available - use lazy initialization
  const initialCache = farmId ? loadFromCache(farmId) : null;
  const [observations, setObservations] = useState<DateObservation[]>(initialCache || []);
  const [loading, setLoading] = useState(!initialCache); // Only show loading if no cache
  const [error, setError] = useState<string | null>(null);

  // Track which farm we've loaded to avoid unnecessary fetches
  const loadedFarmIdRef = useRef<string | null>(
    initialCache && initialCache.length > 0 ? farmId : null
  );

  // Track if we've initialized to prevent resetting loading state
  const initializedRef = useRef(!!initialCache);

  // Ref to preserve observations even if state somehow resets
  const observationsRef = useRef<DateObservation[]>(initialCache || []);

  // Keep ref in sync with state
  useEffect(() => {
    if (observations.length > 0) {
      observationsRef.current = observations;
    }
  }, [observations]);

  // Guard: Never allow loading state to be true if we have observations
  useEffect(() => {
    if (observations.length > 0 && loading) {
      setLoading(false);
    }

    // Guard: If state somehow got cleared but we have ref data, restore it
    if (observations.length === 0 && observationsRef.current.length > 0 && loadedFarmIdRef.current === farmId) {
      setObservations(observationsRef.current);
      setLoading(false);
    }
  }, [observations.length, loading, farmId]);

  useEffect(() => {
    async function fetchObservations() {
      if (!farmId) {
        setLoading(false);
        setError('No farm ID provided');
        setObservations([]);
        loadedFarmIdRef.current = null;
        initializedRef.current = true;
        return;
      }

      // Skip if we've already loaded this farm and have observations
      if (loadedFarmIdRef.current === farmId && observations.length > 0) {
        // Ensure loading is false if we have data
        setLoading(false);
        initializedRef.current = true;
        return;
      }

      // Guard: If we have observations for this farm, don't fetch again
      if (observations.length > 0 && loadedFarmIdRef.current === farmId) {
        setLoading(false);
        return;
      }

      // Check cache first
      const cachedObservations = loadFromCache(farmId);
      if (cachedObservations && cachedObservations.length > 0) {
        observationsRef.current = cachedObservations; // Update ref immediately
        setObservations(cachedObservations);
        setLoading(false);
        setError(null);
        loadedFarmIdRef.current = farmId;
        const wasInitialized = initializedRef.current;
        initializedRef.current = true;

        // Auto-select first date if none selected (only on initial load)
        if (!wasInitialized && !selectedDate && cachedObservations.length > 0 && onDateSelect) {
          onDateSelect(cachedObservations[0].observation_date, cachedObservations[0]);
        }

        // Refresh in background to get latest data (non-blocking)
        // This will update the state automatically when new dates are found
        fetchObservationsFromAPI(true).catch(err => {
          // Don't show error, just log it
        });

        return; // Use cached data immediately, refresh in background
      }

      // No cache, fetch from API
      await fetchObservationsFromAPI();
    }

    async function fetchObservationsFromAPI(isBackgroundRefresh: boolean = false) {
      // Guard: Don't fetch if we already have observations for this farm (unless it's a background refresh)
      if (!isBackgroundRefresh && observations.length > 0 && loadedFarmIdRef.current === farmId) {
        setLoading(false);
        return;
      }

      try {
        // Only show loading if we don't already have observations
        if (!isBackgroundRefresh && observations.length === 0) {
          setLoading(true);
        }
        setError(null);

        // Use get-observation-dates endpoint which queries database directly (faster, more reliable)
        // Add force_refresh parameter for background refreshes to ensure we get latest data
        const endpoint = buildApiUrl(`get-observation-dates?farm_id=${farmId}${isBackgroundRefresh ? '&force_refresh=true' : ''}`);
        const headers = getSupabaseFunctionHeaders();


        let response: Response;
        try {
          response = await fetch(endpoint, {
            headers: Object.keys(headers).length > 0 ? headers : undefined
          });
        } catch (networkError: any) {
          // Handle network errors (CORS, connection refused, etc.)
          throw new Error(`Network error: ${networkError.message || 'Failed to connect to server'}`);
        }

        if (!response.ok) {
          let errorMessage = `Failed to fetch observations: ${response.status} ${response.statusText || 'Unknown error'}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch (e) {
            // If response is not JSON, try to get text
            try {
              const text = await response.text();
              if (text) {
                errorMessage += ` - ${text.substring(0, 100)}`;
              }
            } catch (textError) {
              // Ignore text parsing errors
            }
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();

        // get-observation-dates returns { success: true, dates: [...], total_dates: N } format
        // The successResponse spreads data directly, so dates is at the top level
        const datesArray = Array.isArray(data.dates) ? data.dates : [];

        const obs: DateObservation[] = datesArray
          .map((item: any) => {
            const primarySatellite = typeof item.satellite === 'string' && item.satellite.length > 0
              ? item.satellite
              : 'Unknown';

            const cloudCover = typeof item.cloud_cover_percentage === 'number'
              ? Math.round(item.cloud_cover_percentage * 10) / 10
              : null;

            const observationDate = typeof item.observation_date === 'string'
              ? item.observation_date
              : null;

            if (!observationDate) {
              return null;
            }

            // Use satellite_details if available, otherwise construct from satellite and indices
            const satelliteDetails: SatelliteDetail[] = Array.isArray(item.satellite_details)
              ? item.satellite_details
                .filter((detail: any) => detail && typeof detail.name === 'string')
                .map((detail: any) => ({
                  name: detail.name,
                  indices: Array.isArray(detail.indices)
                    ? detail.indices
                      .filter((idx: any) => typeof idx === 'string')
                      .map((idx: string) => idx.toLowerCase())
                    : []
                }))
              : [{
                name: primarySatellite,
                indices: [] // Will be populated if available_indices exists
              }];

            const satellites = Array.isArray(item.satellites)
              ? item.satellites.filter((name: any) => typeof name === 'string' && name.length > 0)
              : [primarySatellite];

            return {
              observation_date: observationDate,
              cloud_cover_percentage: cloudCover,
              tile_id: typeof item.tile_id === 'string' && item.tile_id.length > 0
                ? item.tile_id
                : `${primarySatellite}_${observationDate}`,
              satellite: primarySatellite,
              satellites: satellites.length > 0 ? satellites : [primarySatellite],
              satelliteDetails
            };
          })
          .filter((item): item is DateObservation => item !== null)
          .sort((a, b) => new Date(b.observation_date).getTime() - new Date(a.observation_date).getTime());

        // Save to cache
        saveToCache(farmId, obs);

        // Update ref and state
        observationsRef.current = obs; // Update ref immediately

        // Always update state with latest data (even on background refresh)
        // This ensures new dates appear automatically
        const hadObservations = observations.length > 0;
        const previousDates = hadObservations ? new Set(observations.map(o => o.observation_date)) : new Set();
        const newDates = obs.filter(o => !previousDates.has(o.observation_date));

        // Always update state - this ensures new dates appear even if total count is same
        setObservations(obs);
        loadedFarmIdRef.current = farmId;
        initializedRef.current = true;

        // Log if background refresh found new dates or updated existing ones
        if (isBackgroundRefresh) {
          if (newDates.length > 0) {
          } else if (obs.length > observations.length) {
          } else if (obs.length !== observations.length || JSON.stringify(obs) !== JSON.stringify(observations)) {
          }
        }

        // Only auto-select on initial load, not on background refresh
        if (!isBackgroundRefresh && !selectedDate && obs.length > 0 && onDateSelect) {
          onDateSelect(obs[0].observation_date, obs[0]);
        }
      } catch (err: any) {
        console.error('Error fetching observations:', err);
        const errorMessage = err.message || err.toString() || 'Failed to load observations';

        // Only show error if not a background refresh
        if (!isBackgroundRefresh) {
          setError(errorMessage);
        }

        // Never clear observations on error - keep existing data
        // Only clear if we truly have no data and no cache
        if (observations.length === 0) {
          const cachedData = loadFromCache(farmId);
          if (!cachedData || cachedData.length === 0) {
            setObservations([]);
            loadedFarmIdRef.current = null;
          } else {
            // Restore from cache on error
            setObservations(cachedData);
            loadedFarmIdRef.current = farmId;
          }
        }
        initializedRef.current = true;
      } finally {
        if (!isBackgroundRefresh) {
          setLoading(false);
        }
      }
    }

    fetchObservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]); // Only re-fetch when farmId changes, not when onDateSelect or selectedDate change

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      day: date.getDate(),
      year: date.getFullYear(),
      full: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };
  };

  const getCloudCoverColor = (percentage: number | null) => {
    if (percentage === null) return 'text-gray-400';
    if (percentage < 10) return 'text-green-500';
    if (percentage < 30) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const handleDateClick = (date: string) => {
    if (!onDateSelect) return;

    // Use current observations or fallback to ref
    const currentObs = observations.length > 0 ? observations : observationsRef.current;
    const observation = currentObs.find((obs) => obs.observation_date === date);

    if (observation) {
      // Valid date with observation data
      onDateSelect(date, observation);
    } else {
      // Date not found in observations - don't allow selection
      // Don't call onDateSelect for invalid dates
      return;
    }
  };

  // Use observations from state, fallback to ref if state is empty
  const displayObservations = observations.length > 0 ? observations : observationsRef.current;

  const uniqueSatellites = Array.from(
    new Set(
      displayObservations.flatMap((obs) =>
        (obs.satelliteDetails && obs.satelliteDetails.length > 0)
          ? obs.satelliteDetails.map(detail => detail.name)
          : (obs.satellites && obs.satellites.length > 0
            ? obs.satellites
            : [obs.satellite])
      )
    )
  ).filter((satellite) => satellite && satellite !== 'Unknown');

  if (loading) {
    return (
      <div className="w-full py-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Available Satellite Observations</h3>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="min-w-[140px] h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="text-red-500">
          <p className="font-semibold">Error Loading Dates</p>
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  if (displayObservations.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-gray-500 text-center py-8">
          <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="font-semibold">No Observations Available</p>
          <p className="text-sm">Run the satellite sync to populate dates</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="w-full py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Available Satellite Observations</h3>
          <Badge variant="outline" className="ml-2">
            {displayObservations.length} dates
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap justify-end">
          <Satellite className="w-4 h-4" />
          {uniqueSatellites.map((satellite) => (
            <Badge key={satellite} variant="secondary">
              {satellite}
            </Badge>
          ))}
        </div>
      </div>

      {/* Scrollable Date Tiles */}
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
        {displayObservations.map((obs) => {
          const dateInfo = formatDate(obs.observation_date);
          const isSelected = selectedDate === obs.observation_date;
          const observationKey = `${obs.observation_date}-${obs.tile_id}-${obs.satellite}`;

          return (
            <div
              key={observationKey}
              onClick={() => handleDateClick(obs.observation_date)}
              className={`
                min-w-[140px] p-4 rounded-lg border-2 cursor-pointer
                transition-all duration-200 snap-start
                hover:shadow-lg hover:scale-105
                ${isSelected
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-gray-200 hover:border-primary/50 bg-white'
                }
              `}
            >
              {/* Month */}
              <div className={`
                text-xs font-semibold uppercase tracking-wider mb-1
                ${isSelected ? 'text-primary' : 'text-gray-500'}
              `}>
                {dateInfo.month} {dateInfo.year}
              </div>

              {/* Day */}
              <div className={`
                text-3xl font-bold mb-2
                ${isSelected ? 'text-primary' : 'text-gray-900'}
              `}>
                {dateInfo.day}
              </div>

              {/* Cloud Cover (if available) */}
              {obs.cloud_cover_percentage !== null ? (
                <div className="flex items-center gap-1 text-xs mb-1">
                  <Cloud className={`w-3 h-3 ${getCloudCoverColor(obs.cloud_cover_percentage)}`} />
                  <span className={getCloudCoverColor(obs.cloud_cover_percentage)}>
                    {obs.cloud_cover_percentage.toFixed(0)}%
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs mb-1 text-gray-400">
                  <Cloud className="w-3 h-3" />
                  <span>N/A</span>
                </div>
              )}

              {/* Satellite Source(s) */}
              <div className="flex flex-wrap gap-1 text-xs font-semibold text-gray-600 mb-1">
                {obs.satelliteDetails.map((detail) => (
                  <Badge
                    key={`${obs.observation_date}-${detail.name}`}
                    variant="secondary"
                    title={
                      detail.indices.length > 0
                        ? `Indices: ${detail.indices.join(', ').toUpperCase()}`
                        : undefined
                    }
                  >
                    {detail.name}
                  </Badge>
                ))}
              </div>

              {/* Tile Info */}
              <div className="text-xs text-gray-500">
                {obs.tile_id}
              </div>

              {/* Selected Indicator */}
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-primary/20">
                  <div className="text-xs font-medium text-primary">
                    ✓ Selected
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scroll Hint */}
      <div className="text-center text-xs text-gray-400 mt-2">
        ← Scroll to see more dates →
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders when only selectedDate changes
export const DateTimeline = React.memo(DateTimelineComponent, (prevProps, nextProps) => {
  // Only re-render if farmId changes (which requires new data fetch)
  // Ignore changes to selectedDate and onDateSelect to prevent flickering
  // Return true if props are equal (skip re-render), false if different (re-render)
  const farmIdChanged = prevProps.farmId !== nextProps.farmId;

  if (farmIdChanged) {
    return false; // Re-render needed
  }

  // FarmId is the same, skip re-render even if selectedDate or onDateSelect changed
  return true; // Skip re-render
});

