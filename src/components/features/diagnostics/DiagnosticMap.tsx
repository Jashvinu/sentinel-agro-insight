/**
 * DiagnosticMap Component
 * Renders a Leaflet map with colored grid cells showing problem areas
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, GeoJSON, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import {
  GridCell,
  getCellColor,
  getCellOpacity,
  getCellSeverityScore,
  getIndexColor,
  isUrgentCell,
} from '@/services/diagnosticService';
import 'leaflet/dist/leaflet.css';
import { Map, Satellite } from 'lucide-react';

interface DiagnosticMapProps {
  cells: GridCell[];
  farmGeometry: Geometry | null;
  onCellClick?: (cell: GridCell) => void;
  selectedCellId?: string | null;
  rasterUrls?: Record<string, string>;
  rasterBounds?: [[number, number], [number, number]]; // [[south, west], [north, east]]
  activeIndex?: string;
  onActiveIndexChange?: (index: string) => void;
}

// Component to fit map bounds to farm
function FitBounds({ geometry }: { geometry: Geometry | null }) {
  const map = useMap();

  useEffect(() => {
    if (!geometry) return;

    try {
      const geoJsonLayer = L.geoJSON(geometry);
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch (error) {
      console.error('[DiagnosticMap] Error fitting bounds:', error);
    }
  }, [geometry, map]);

  return null;
}

const RASTER_INDICES = ['ndvi', 'nitrogen', 'phosphorus', 'potassium', 'moisture'] as const;
const RASTER_INDEX_LABELS: Record<string, string> = {
  ndvi: 'Crop Health',
  nitrogen: 'Nitrogen',
  phosphorus: 'Phosphorus',
  potassium: 'Potassium',
  moisture: 'Moisture',
};

export const DiagnosticMap: React.FC<DiagnosticMapProps> = ({
  cells,
  farmGeometry,
  onCellClick,
  selectedCellId,
  rasterUrls,
  rasterBounds,
  activeIndex,
  onActiveIndexChange,
}) => {
  const [baseMapType, setBaseMapType] = useState<'satellite' | 'street'>('satellite');
  const hasRasters = rasterUrls && rasterBounds && Object.keys(rasterUrls).length > 0;
  // Calculate initial center from geometry
  const center = useMemo(() => {
    if (!farmGeometry) return [0, 0] as [number, number];

    try {
      // Get centroid of geometry
      let coords: number[][];
      if (farmGeometry.type === 'Polygon') {
        coords = farmGeometry.coordinates[0];
      } else if (farmGeometry.type === 'MultiPolygon') {
        coords = farmGeometry.coordinates[0][0];
      } else {
        return [0, 0] as [number, number];
      }

      const lats = coords.map(c => c[1]);
      const lngs = coords.map(c => c[0]);
      return [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ] as [number, number];
    } catch {
      return [0, 0] as [number, number];
    }
  }, [farmGeometry]);

  // Style for farm boundary
  const farmStyle = {
    color: '#ffffff',
    weight: 2,
    fillColor: 'transparent',
    fillOpacity: 0,
    dashArray: '5, 5',
  };

  return (
    <div className="relative h-full w-full">
      {/* Raster index selector (shown only when rasters are available) */}
      {hasRasters && (
        <div className="absolute top-3 left-3 z-[1000] flex gap-1">
          {RASTER_INDICES.filter((idx) => rasterUrls![idx]).map((idx) => (
            <button
              key={idx}
              onClick={() => onActiveIndexChange?.(idx)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors shadow-sm ${
                activeIndex === idx
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white/90 backdrop-blur-sm text-gray-700 border-gray-200 hover:bg-white'
              }`}
            >
              {RASTER_INDEX_LABELS[idx]}
            </button>
          ))}
        </div>
      )}

      {/* Base Map Toggle Button */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          onClick={() => setBaseMapType(prev => prev === 'satellite' ? 'street' : 'satellite')}
          className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 hover:bg-white transition-colors text-sm font-medium text-gray-700"
        >
          {baseMapType === 'satellite' ? (
            <>
              <Map className="w-4 h-4" />
              Street Map
            </>
          ) : (
            <>
              <Satellite className="w-4 h-4" />
              Satellite
            </>
          )}
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        className="rounded-lg"
        preferCanvas={true}
      >
        {/* Base layer */}
        {baseMapType === 'satellite' ? (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; Esri"
          />
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        )}

        {/* Layer 1: Pre-rendered raster overlay (when available) */}
        {hasRasters && activeIndex && rasterUrls![activeIndex] && (
          <ImageOverlay
            url={rasterUrls![activeIndex]}
            bounds={rasterBounds!}
            opacity={0.75}
            zIndex={400}
          />
        )}

        {/* Farm boundary outline */}
        {farmGeometry && (
          <GeoJSON
            key={JSON.stringify(farmGeometry)}
            data={{ type: 'Feature', geometry: farmGeometry, properties: {} }}
            style={farmStyle}
          />
        )}

        {/* Layer 2: Grid cell rectangles
            - With rasters: low-opacity diagnostic risk overlay on top of satellite index
            - Without rasters: original colored overlays (fallback) */}
        {hasRasters
          ? cells
              .filter((cell) => cell.problems.length > 0)
              .map((cell) => {
                const isSelected = cell.id === selectedCellId;
                const activeProblem = activeIndex
                  ? cell.problems.find((problem) => problem.index === activeIndex)
                  : undefined;
                const deEmphasized = Boolean(activeIndex && !activeProblem);
                const color = activeProblem
                  ? getIndexColor(activeProblem.index)
                  : getCellColor(cell) || '#f97316';
                const severity = getCellSeverityScore(cell);
                const urgent = isUrgentCell(cell);
                return (
                  <Rectangle
                    key={cell.id}
                    bounds={cell.bounds as [[number, number], [number, number]]}
                    pathOptions={{
                      fillOpacity: isSelected ? 0.48 : deEmphasized ? 0.08 : Math.max(0.16, severity * 0.36),
                      opacity: isSelected ? 0.95 : deEmphasized ? 0.22 : 0.7,
                      color: isSelected ? '#ffffff' : urgent ? '#fb7185' : color,
                      weight: isSelected ? 3 : urgent ? 2 : 1,
                      fillColor: color,
                    }}
                    eventHandlers={{ click: () => onCellClick?.(cell) }}
                  />
                );
              })
          : cells
              .filter((cell) => getCellColor(cell) && getCellOpacity(cell) > 0)
              .sort((a, b) => {
                const aUrgent = isUrgentCell(a) ? 1 : 0;
                const bUrgent = isUrgentCell(b) ? 1 : 0;
                if (aUrgent !== bUrgent) return aUrgent - bUrgent;
                return a.problems.length - b.problems.length;
              })
              .map((cell) => {
                const color = getCellColor(cell);
                const opacity = getCellOpacity(cell);
                const isSelected = cell.id === selectedCellId;
                const isOverlap = cell.problems.length > 1;
                const urgent = isUrgentCell(cell);
                return (
                  <Rectangle
                    key={cell.id}
                    bounds={cell.bounds as [[number, number], [number, number]]}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : urgent ? '#ef4444' : isOverlap ? '#ffffff' : color!,
                      weight: isSelected ? 3 : urgent ? 3 : isOverlap ? 2 : 1,
                      fillColor: color!,
                      fillOpacity: opacity,
                    }}
                    eventHandlers={{ click: () => onCellClick?.(cell) }}
                  />
                );
              })}

        {/* Fit bounds to farm */}
        <FitBounds geometry={farmGeometry} />
      </MapContainer>
    </div>
  );
};

export default DiagnosticMap;
