/**
 * DiagnosticMap Component
 * Renders a Leaflet map with colored grid cells showing problem areas
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import {
  GridCell,
  getCellColor,
  getCellOpacity,
  isUrgentCell,
} from '@/services/diagnosticService';
import { type ScoutZone } from '@/services/diseaseService';
import ScoutZoneMap from './ScoutZoneMap';
import 'leaflet/dist/leaflet.css';
import { Map, Satellite } from 'lucide-react';

interface DiagnosticMapProps {
  cells: GridCell[];
  farmGeometry: Geometry | null;
  onCellClick?: (cell: GridCell) => void;
  selectedCellId?: string | null;
  zones?: ScoutZone[];
  onZoneSelect?: (zone: ScoutZone) => void;
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

export const DiagnosticMap: React.FC<DiagnosticMapProps> = ({
  cells,
  farmGeometry,
  onCellClick,
  selectedCellId,
  zones,
  onZoneSelect,
}) => {
  const [baseMapType, setBaseMapType] = useState<'satellite' | 'street'>('satellite');
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

        {/* Farm boundary outline */}
        {farmGeometry && (
          <GeoJSON
            key={JSON.stringify(farmGeometry)}
            data={{ type: 'Feature', geometry: farmGeometry, properties: {} }}
            style={farmStyle}
          />
        )}

        {/* Problem cells: keep the satellite image visible and mark only warning spots. */}
        {cells
          .filter((cell) => getCellColor(cell) && getCellOpacity(cell) > 0)
          .sort((a, b) => {
            const aUrgent = isUrgentCell(a) ? 1 : 0;
            const bUrgent = isUrgentCell(b) ? 1 : 0;
            if (aUrgent !== bUrgent) return aUrgent - bUrgent;
            return a.problems.length - b.problems.length;
          })
          .map((cell) => {
            const color = getCellColor(cell);
            const isSelected = cell.id === selectedCellId;
            const isOverlap = cell.problems.length > 1;
            const urgent = isUrgentCell(cell);
            const strokeColor = isSelected ? '#ffffff' : urgent ? '#ef4444' : isOverlap ? '#8b5cf6' : color!;

            return (
              <Rectangle
                key={cell.id}
                bounds={cell.bounds as [[number, number], [number, number]]}
                pathOptions={{
                  color: strokeColor,
                  weight: isSelected ? 3 : urgent ? 3 : 2,
                  fillColor: color!,
                  fillOpacity: isSelected ? 0.16 : 0.04,
                  opacity: 0.95,
                }}
                eventHandlers={{ click: () => onCellClick?.(cell) }}
              />
            );
          })}

        {/* Scout zone overlays */}
        {zones && zones.length > 0 && (
          <ScoutZoneMap zones={zones} onZoneSelect={onZoneSelect ?? (() => {})} />
        )}

        {/* Fit bounds to farm */}
        <FitBounds geometry={farmGeometry} />
      </MapContainer>
    </div>
  );
};

export default DiagnosticMap;
