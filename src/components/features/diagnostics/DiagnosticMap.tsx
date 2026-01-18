/**
 * DiagnosticMap Component
 * Renders a Leaflet map with colored grid cells showing problem areas
 */

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  GridCell,
  getCellColor,
  getCellOpacity,
} from '@/services/diagnosticService';
import 'leaflet/dist/leaflet.css';

interface DiagnosticMapProps {
  cells: GridCell[];
  farmGeometry: any;
  onCellClick?: (cell: GridCell) => void;
  selectedCellId?: string | null;
}

// Component to fit map bounds to farm
function FitBounds({ geometry }: { geometry: any }) {
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
}) => {
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
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      className="rounded-lg"
    >
      {/* Base layer - Satellite */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="&copy; Esri"
      />

      {/* Farm boundary outline */}
      {farmGeometry && (
        <GeoJSON
          key={JSON.stringify(farmGeometry)}
          data={{ type: 'Feature', geometry: farmGeometry, properties: {} }}
          style={farmStyle}
        />
      )}

      {/* Grid cells with problems */}
      {cells.map((cell) => {
        const color = getCellColor(cell);
        const opacity = getCellOpacity(cell);
        const isSelected = cell.id === selectedCellId;

        if (!color || opacity === 0) return null;

        return (
          <Rectangle
            key={cell.id}
            bounds={cell.bounds as [[number, number], [number, number]]}
            pathOptions={{
              color: isSelected ? '#ffffff' : color,
              weight: isSelected ? 3 : 1,
              fillColor: color,
              fillOpacity: opacity,
            }}
            eventHandlers={{
              click: () => onCellClick?.(cell),
            }}
          />
        );
      })}

      {/* Fit bounds to farm */}
      <FitBounds geometry={farmGeometry} />
    </MapContainer>
  );
};

export default DiagnosticMap;
