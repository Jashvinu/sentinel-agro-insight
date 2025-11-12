import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelineData {
  farm: {
    id: string;
    name: string;
    bounds: any;
    created_at: string;
  };
  timeline: Record<string, any[]>;
  observation_dates: string[];
  stats: {
    total_observations: number;
    total_indices: number;
    index_types: string[];
    date_range: {
      earliest: string;
      latest: string;
    };
  };
}

interface FarmTimelineProps {
  farmId?: string;
  onDateSelect?: (date: string, indices: any[]) => void;
}

export function FarmTimeline({ farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0', onDateSelect }: FarmTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        setError(null);
        
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:54321/functions/v1';
        const response = await fetch(`${API_BASE}/farm-timeline?farm_id=${farmId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch timeline: ${response.statusText}`);
        }
        
        const data = await response.json();
        setTimeline(data);
        
        // Auto-select the latest date
        if (data.observation_dates && data.observation_dates.length > 0) {
          const latestDate = data.observation_dates[0];
          setSelectedDate(latestDate);
          if (onDateSelect) {
            onDateSelect(latestDate, data.timeline[latestDate]);
          }
        }
      } catch (err: any) {
        console.error('Error fetching timeline:', err);
        setError(err.message || 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [farmId, onDateSelect]);

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    if (onDateSelect && timeline) {
      onDateSelect(date, timeline.timeline[date]);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getIndexBadgeColor = (indexType: string) => {
    const colors: Record<string, string> = {
      ndvi: 'bg-green-500',
      evi: 'bg-emerald-500',
      savi: 'bg-lime-500',
      msavi: 'bg-teal-500',
      ndwi: 'bg-blue-500',
      nitrogen: 'bg-purple-500',
      phosphorus: 'bg-orange-500',
      potassium: 'bg-pink-500',
      salinity: 'bg-red-500',
      ph: 'bg-yellow-500',
      moisture: 'bg-cyan-500',
      carbon: 'bg-amber-500'
    };
    return colors[indexType] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="space-y-2 mt-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="text-red-500">
          <p className="font-semibold">Error Loading Timeline</p>
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  if (!timeline || timeline.observation_dates.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-gray-500">
          <p className="font-semibold">No Timeline Data</p>
          <p className="text-sm">No observations recorded yet for this farm.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold">{timeline.farm.name} - Timeline</h3>
          <div className="flex gap-2 mt-2 text-sm text-gray-600">
            <Badge variant="outline">
              {timeline.stats.total_observations} observations
            </Badge>
            <Badge variant="outline">
              {timeline.stats.total_indices} indices
            </Badge>
          </div>
        </div>

        {/* Date Range */}
        {timeline.stats.date_range.earliest && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Period:</span>{' '}
            {formatDate(timeline.stats.date_range.earliest)} -{' '}
            {formatDate(timeline.stats.date_range.latest)}
          </div>
        )}

        {/* Available Index Types */}
        <div className="flex flex-wrap gap-2">
          {timeline.stats.index_types.map(indexType => (
            <Badge
              key={indexType}
              className={`${getIndexBadgeColor(indexType)} text-white`}
            >
              {indexType.toUpperCase()}
            </Badge>
          ))}
        </div>

        {/* Timeline List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {timeline.observation_dates.map(date => {
            const indices = timeline.timeline[date];
            const isSelected = date === selectedDate;

            return (
              <div
                key={date}
                onClick={() => handleDateClick(date)}
                className={`
                  p-3 rounded-lg border cursor-pointer transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{formatDate(date)}</p>
                    <div className="flex gap-1 mt-1">
                      {indices.map((index, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-xs"
                        >
                          {index.index_type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {indices.length} index{indices.length > 1 ? 'es' : ''}
                  </div>
                </div>
                
                {/* Show details when selected */}
                {isSelected && (
                  <div className="mt-2 pt-2 border-t text-xs space-y-1">
                    {indices.map((index, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2">
                        <span className="font-medium">{index.index_type}:</span>
                        <span className="text-gray-600">
                          {index.mean_value?.toFixed(3)} (±{index.std_dev?.toFixed(3)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

