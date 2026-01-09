import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';
import {
  Leaf,
  Droplets,
  Sprout,
  TestTube,
  FlaskConical,
  Beaker,
  Waves,
  Activity,
  Wind,
  Mountain,
  Zap,
  RefreshCw
} from 'lucide-react';

interface IndexData {
  index_type: string;
  min_value: number;
  max_value: number;
  mean_value: number;
  std_dev: number;
  tile_url?: string;
  created_at?: string;
}

interface IndicesTilesProps {
  farmId?: string;
  selectedDate?: string;
  onIndexSelect?: (indexType: string) => void;
  allowedIndices?: string[];
}

const INDEX_CONFIG: Record<string, {
  icon: any;
  label: string;
  color: string;
  unit: string;
  description: string;
}> = {
  ndvi: {
    icon: Leaf,
    label: 'NDVI',
    color: 'bg-green-500',
    unit: '',
    description: 'Vegetation Health'
  },
  evi: {
    icon: Sprout,
    label: 'EVI',
    color: 'bg-emerald-500',
    unit: '',
    description: 'Enhanced Vegetation'
  },
  savi: {
    icon: Mountain,
    label: 'SAVI',
    color: 'bg-lime-500',
    unit: '',
    description: 'Soil Adjusted'
  },
  msavi: {
    icon: Activity,
    label: 'MSAVI',
    color: 'bg-teal-500',
    unit: '',
    description: 'Modified SAVI'
  },
  ndwi: {
    icon: Droplets,
    label: 'NDWI',
    color: 'bg-blue-500',
    unit: '',
    description: 'Water Content'
  },
  nitrogen: {
    icon: TestTube,
    label: 'Nitrogen',
    color: 'bg-purple-500',
    unit: 'kg/ha',
    description: 'Nitrogen Level'
  },
  phosphorus: {
    icon: FlaskConical,
    label: 'Phosphorus',
    color: 'bg-orange-500',
    unit: 'kg/ha',
    description: 'Phosphorus Level'
  },
  potassium: {
    icon: Beaker,
    label: 'Potassium',
    color: 'bg-pink-500',
    unit: 'kg/ha',
    description: 'Potassium Level'
  },
  salinity: {
    icon: Waves,
    label: 'Salinity',
    color: 'bg-red-500',
    unit: 'dS/m',
    description: 'Soil Salinity'
  },
  ph: {
    icon: Zap,
    label: 'pH',
    color: 'bg-yellow-500',
    unit: '',
    description: 'Soil pH Level'
  },
  moisture: {
    icon: Wind,
    label: 'Moisture',
    color: 'bg-cyan-500',
    unit: '%',
    description: 'Soil Moisture'
  },
  carbon: {
    icon: Leaf,
    label: 'Carbon',
    color: 'bg-amber-500',
    unit: '%',
    description: 'Organic Carbon'
  },
  sar_moisture: {
    icon: Droplets,
    label: 'SAR Moisture',
    color: 'bg-indigo-500',
    unit: '%',
    description: 'Radar Soil Moisture'
  }
};

export function IndicesTiles({
  farmId = 'df43eedf-850d-454c-9fbf-36a052be10c0',
  selectedDate,
  onIndexSelect,
  allowedIndices
}: IndicesTilesProps) {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState<string | null>(null);

  const allowedSet = useMemo(() => {
    if (!allowedIndices || allowedIndices.length === 0) {
      return null;
    }
    return new Set(allowedIndices.map((idx) => idx.toLowerCase()));
  }, [allowedIndices]);

  useEffect(() => {
    if (!selectedDate) return;

    async function fetchIndices() {
      try {
        setLoading(true);
        setError(null);

        const endpoint = buildApiUrl(`farm-timeline?farm_id=${farmId}`);
        const headers = getSupabaseFunctionHeaders();
        const response = await fetch(endpoint, {
          headers: Object.keys(headers).length > 0 ? headers : undefined
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch indices: ${response.statusText}`);
        }

        const data = await response.json();

        // Get indices for selected date
        const dateIndices = data.timeline?.[selectedDate] || [];
        setIndices(dateIndices);

      } catch (err: any) {
        console.error('Error fetching indices:', err);
        setError(err.message || 'Failed to load indices');
      } finally {
        setLoading(false);
      }
    }

    fetchIndices();
  }, [farmId, selectedDate]);

  const handleCalculateIndex = async (indexType: string) => {
    if (allowedSet && !allowedSet.has(indexType)) {
      return;
    }
    try {
      setCalculating(indexType);

      // This would trigger the agricultural-indices API
      // For now, just call the onIndexSelect callback
      if (onIndexSelect) {
        onIndexSelect(indexType);
      }

    } catch (err: any) {
      console.error('Error calculating index:', err);
    } finally {
      setCalculating(null);
    }
  };

  const formatValue = (value: number | null | undefined, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(decimals);
  };

  const getIndexData = (indexType: string) => {
    return indices.find(idx => idx.index_type === indexType);
  };

  if (!selectedDate) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500 py-8">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="font-semibold">Select a Date</p>
          <p className="text-sm">Choose a date from the timeline above to view indices</p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Agricultural Indices</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Agricultural Indices</h3>
          <p className="text-sm text-gray-500">
            {selectedDate && new Date(selectedDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
        <Badge variant="outline">
          {indices.length} / {Object.keys(INDEX_CONFIG).length} calculated
        </Badge>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Index Tiles Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Object.entries(INDEX_CONFIG).map(([type, config]) => {
          const indexData = getIndexData(type);
          const Icon = config.icon;
          const isCalculated = !!indexData;
          const isCalculating = calculating === type;
          const isSupported = !allowedSet || allowedSet.has(type);

          return (
            <div
              key={type}
              className={`
                relative p-4 rounded-lg border-2 transition-all duration-200
                ${isCalculated
                  ? 'border-gray-200 bg-white hover:shadow-lg hover:border-primary/50'
                  : 'border-dashed border-gray-300 bg-gray-50'
                }
                ${isSupported ? '' : 'opacity-50 pointer-events-none'}
              `}
            >
              {/* Icon and Label */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded ${config.color} text-white`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{config.label}</div>
                  <div className="text-xs text-gray-500">{config.description}</div>
                </div>
              </div>

              {/* Values */}
              {isCalculated ? (
                <div className="space-y-2">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatValue(indexData.mean_value)}
                      {config.unit && <span className="text-sm font-normal text-gray-500 ml-1">{config.unit}</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      ± {formatValue(indexData.std_dev)}
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Min:</span>
                      <span className="font-medium">{formatValue(indexData.min_value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Max:</span>
                      <span className="font-medium">{formatValue(indexData.max_value)}</span>
                    </div>
                  </div>

                  {/* View on Map Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => handleCalculateIndex(type)}
                    disabled={!isSupported}
                  >
                    View on Map
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 mb-3">
                    {isSupported ? 'Not calculated yet' : 'Unsupported for selected satellite'}
                  </p>
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full"
                    onClick={() => handleCalculateIndex(type)}
                    disabled={isCalculating || !isSupported}
                  >
                    {isCalculating ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      'Calculate'
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

