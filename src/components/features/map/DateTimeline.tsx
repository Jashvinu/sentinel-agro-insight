import React, { useEffect, useState } from 'react';
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

export function DateTimeline({
  farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0',
  onDateSelect,
  selectedDate
}: DateTimelineProps) {
  const [observations, setObservations] = useState<DateObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchObservations() {
      try {
        setLoading(true);
        setError(null);

        const endpoint = buildApiUrl(`get-available-dates?farm_id=${farmId}&months=6`);
        const headers = getSupabaseFunctionHeaders();
        const response = await fetch(endpoint, {
          headers: Object.keys(headers).length > 0 ? headers : undefined
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch observations: ${response.statusText}`);
        }

        const data = await response.json();

        const availableDates = Array.isArray(data.available_dates)
          ? data.available_dates
          : [];

        const obs: DateObservation[] = availableDates
          .map((item: any) => {
            const primarySatellite = typeof item.satellite === 'string' && item.satellite.length > 0
              ? item.satellite
              : 'Unknown';

            const cloudCover = typeof item.cloud_cover === 'number'
              ? Math.round(item.cloud_cover * 10) / 10
              : null;

            const observationDate = typeof item.date === 'string'
              ? item.date
              : (typeof item.observation_date === 'string' ? item.observation_date : null);

            if (!observationDate) {
              return null;
            }

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
                indices: Array.isArray(item.available_indices)
                  ? item.available_indices
                    .filter((idx: any) => typeof idx === 'string')
                    .map((idx: string) => idx.toLowerCase())
                  : []
              }];

            const satellites = satelliteDetails
              .map((detail) => detail.name)
              .filter((name) => typeof name === 'string' && name.length > 0);

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

        setObservations(obs);

        if (!selectedDate && obs.length > 0 && onDateSelect) {
          onDateSelect(obs[0].observation_date, obs[0]);
        }
      } catch (err: any) {
        console.error('Error fetching observations:', err);
        setError(err.message || 'Failed to load observations');
      } finally {
        setLoading(false);
      }
    }

    fetchObservations();
  }, [farmId, onDateSelect, selectedDate]);

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
    if (onDateSelect) {
      const observation = observations.find((obs) => obs.observation_date === date);
      if (observation) {
        onDateSelect(date, observation);
      } else {
        // Fallback: construct a minimal observation if not found
        onDateSelect(date, {
          observation_date: date,
          cloud_cover_percentage: null,
          tile_id: date,
          satellite: 'Unknown',
          satellites: ['Unknown'],
          satelliteDetails: []
        });
      }
    }
  };

  const uniqueSatellites = Array.from(
    new Set(
      observations.flatMap((obs) =>
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

  if (observations.length === 0) {
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
            {observations.length} dates
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
        {observations.map((obs) => {
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

