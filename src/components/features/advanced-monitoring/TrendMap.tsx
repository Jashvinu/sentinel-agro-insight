import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Layers } from 'lucide-react';
import type { TrendAnalysis } from '@/types/advancedMonitoring';
import { ALGORITHM_CONFIGS } from '@/constants';
import 'leaflet/dist/leaflet.css';

interface TrendMapProps {
    trends: TrendAnalysis[];
    farmPolygon: GeoJSON.Geometry;
    center?: [number, number];
    zoom?: number;
}

/**
 * Get color based on trend direction
 */
function getTrendColor(direction: TrendAnalysis['trendDirection']): string {
    switch (direction) {
        case 'Increasing':
            return '#22c55e'; // green-500
        case 'Decreasing':
            return '#ef4444'; // red-500
        case 'Stable':
            return '#9ca3af'; // gray-400
    }
}

/**
 * Get opacity based on statistical significance (p-value)
 */
function getTrendOpacity(pValue: number): number {
    if (pValue < 0.01) return 0.8; // Highly significant
    if (pValue < 0.05) return 0.6; // Significant
    if (pValue < 0.1) return 0.4; // Marginally significant
    return 0.2; // Not significant
}

/**
 * Legend component
 */
const TrendLegend: React.FC = () => {
    return (
        <div className="absolute bottom-6 right-6 z-[1000] bg-white border border-border rounded-lg shadow-lg p-4">
            <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4" />
                <h4 className="text-sm font-semibold">Trend Direction</h4>
            </div>
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }}></div>
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-xs">Increasing</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }}></div>
                    <TrendingDown className="w-3 h-3" />
                    <span className="text-xs">Decreasing</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#9ca3af' }}></div>
                    <Minus className="w-3 h-3" />
                    <span className="text-xs">Stable</span>
                </div>
            </div>
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                Opacity indicates significance (p-value)
            </div>
        </div>
    );
};

/**
 * Algorithm selector for map layers
 */
const AlgorithmLayerControl: React.FC<{
    trends: TrendAnalysis[];
    selectedAlgorithm: string;
    onChange: (algorithm: string) => void;
}> = ({ trends, selectedAlgorithm, onChange }) => {
    return (
        <div className="absolute top-6 right-6 z-[1000] bg-white border border-border rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4" />
                <h4 className="text-sm font-semibold">Algorithm Layer</h4>
            </div>
            <div className="space-y-1">
                {trends.map((trend) => {
                    const config = ALGORITHM_CONFIGS[trend.algorithm as keyof typeof ALGORITHM_CONFIGS];
                    const isSelected = selectedAlgorithm === trend.algorithm;

                    return (
                        <button
                            key={trend.algorithm}
                            onClick={() => onChange(trend.algorithm)}
                            className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                                isSelected
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-muted'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: config?.color }}
                                    />
                                    <span className="font-medium">{config?.label}</span>
                                </div>
                                <Badge
                                    variant={
                                        trend.trendDirection === 'Increasing'
                                            ? 'default'
                                            : trend.trendDirection === 'Decreasing'
                                            ? 'destructive'
                                            : 'secondary'
                                    }
                                    className="text-xs"
                                >
                                    {trend.trendDirection}
                                </Badge>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/**
 * Map bounds adjuster component
 */
const FitBounds: React.FC<{ geometry: GeoJSON.Geometry }> = ({ geometry }) => {
    const map = useMap();

    React.useEffect(() => {
        if (geometry && geometry.type === 'Polygon') {
            const coordinates = geometry.coordinates[0] as [number, number][];
            const bounds = coordinates.map((coord) => [coord[1], coord[0]] as [number, number]);

            if (bounds.length > 0) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [geometry, map]);

    return null;
};

/**
 * Main trend map component
 */
export const TrendMap: React.FC<TrendMapProps> = ({
    trends,
    farmPolygon,
    center = [0, 0],
    zoom = 13,
}) => {
    const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>(
        trends.length > 0 ? trends[0].algorithm : ''
    );

    // Find selected trend
    const selectedTrend = useMemo(
        () => trends.find((t) => t.algorithm === selectedAlgorithm),
        [trends, selectedAlgorithm]
    );

    // Calculate map center from farm polygon
    const mapCenter = useMemo(() => {
        if (farmPolygon && farmPolygon.type === 'Polygon') {
            const coordinates = farmPolygon.coordinates[0] as [number, number][];
            if (coordinates.length > 0) {
                const lats = coordinates.map((c) => c[1]);
                const lons = coordinates.map((c) => c[0]);
                return [
                    (Math.min(...lats) + Math.max(...lats)) / 2,
                    (Math.min(...lons) + Math.max(...lons)) / 2,
                ] as [number, number];
            }
        }
        return center;
    }, [farmPolygon, center]);

    // Style for farm polygon based on trend
    const farmStyle = useMemo(() => {
        if (!selectedTrend) {
            return {
                fillColor: '#3b82f6',
                fillOpacity: 0.3,
                color: '#3b82f6',
                weight: 2,
            };
        }

        return {
            fillColor: getTrendColor(selectedTrend.trendDirection),
            fillOpacity: getTrendOpacity(selectedTrend.pValue),
            color: getTrendColor(selectedTrend.trendDirection),
            weight: 2,
        };
    }, [selectedTrend]);

    if (!farmPolygon || trends.length === 0) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center text-muted-foreground">
                        <Layers className="w-12 h-12 mx-auto mb-3" />
                        <p>No trend map data available</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Spatial Trend Visualization</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Color-coded trends with statistical significance
                        </p>
                    </div>
                    {selectedTrend && (
                        <div className="text-right">
                            <div className="text-sm font-semibold">
                                {selectedTrend.trendDirection} Trend
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Slope: {selectedTrend.theilsenSlope.toFixed(6)}/day
                            </div>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="relative h-[500px] rounded-lg overflow-hidden border">
                    <MapContainer
                        center={mapCenter}
                        zoom={zoom}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={true}
                    >
                        {/* Base map tile layer */}
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />

                        {/* Farm polygon with trend styling */}
                        <GeoJSON
                            key={`${selectedAlgorithm}-${selectedTrend?.trendDirection}`}
                            data={farmPolygon as any}
                            style={farmStyle}
                        />

                        {/* Fit bounds to farm polygon */}
                        <FitBounds geometry={farmPolygon} />
                    </MapContainer>

                    {/* Algorithm layer control */}
                    <AlgorithmLayerControl
                        trends={trends}
                        selectedAlgorithm={selectedAlgorithm}
                        onChange={setSelectedAlgorithm}
                    />

                    {/* Legend */}
                    <TrendLegend />
                </div>

                {/* Trend details below map */}
                {selectedTrend && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                        <div>
                            <div className="text-xs text-muted-foreground">Trend Direction</div>
                            <div className="text-sm font-semibold">
                                {selectedTrend.trendDirection}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Slope (per day)</div>
                            <div className="text-sm font-mono">
                                {selectedTrend.theilsenSlope.toFixed(6)}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Significance</div>
                            <div className="text-sm font-mono">p = {selectedTrend.pValue.toFixed(4)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Fit Quality (R²)</div>
                            <div className="text-sm font-semibold">
                                {(selectedTrend.rSquared * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
