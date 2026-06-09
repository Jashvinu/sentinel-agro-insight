import { useState } from 'react';
import { Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Camera, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { type ScoutZone, diseaseDisplayName, riskColor } from '@/services/diseaseService';

interface ScoutZoneMapProps {
  zones: ScoutZone[];
  onZoneSelect: (zone: ScoutZone) => void;
}

function makeZoneIcon(zone: ScoutZone, selected: boolean): L.DivIcon {
  const color  = riskColor(zone.max_risk_score);
  const border = selected ? '3px solid #1d4ed8' : `2px solid ${color}`;
  const bg     = selected ? '#1d4ed8' : color;

  return L.divIcon({
    html: `
      <div style="
        background:${bg};
        border:${border};
        color:white;
        border-radius:50%;
        width:32px;height:32px;
        display:flex;align-items:center;justify-content:center;
        font-weight:bold;font-size:14px;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        cursor:pointer;
      ">${zone.zone_rank}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function statusIcon(status: ScoutZone['status']) {
  switch (status) {
    case 'confirmed': return <CheckCircle className="w-4 h-4 text-red-500" />;
    case 'scouted':   return <Clock className="w-4 h-4 text-amber-500" />;
    case 'cleared':   return <CheckCircle className="w-4 h-4 text-green-500" />;
    default:          return <AlertTriangle className="w-4 h-4 text-orange-500" />;
  }
}

function ZoomToZone({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  return (
    <button
      className="text-xs text-blue-600 underline"
      onClick={() => map.flyTo([lat, lng], 16, { duration: 1.2 })}
    >
      zoom in
    </button>
  );
}

export default function ScoutZoneMap({ zones, onZoneSelect }: ScoutZoneMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (zones.length === 0) return null;

  return (
    <>
      {zones.map((zone) => {
        const selected = zone.id === selectedId;
        const color    = riskColor(zone.max_risk_score);

        return (
          <div key={zone.id}>
            {/* Radius circle */}
            <Circle
              center={[zone.centroid_lat, zone.centroid_lng]}
              radius={zone.radius_meters}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: selected ? 2.5 : 1.5,
                dashArray: zone.status === 'pending' ? '6 3' : undefined,
              }}
            />

            {/* Numbered marker */}
            <Marker
              position={[zone.centroid_lat, zone.centroid_lng]}
              icon={makeZoneIcon(zone, selected)}
              eventHandlers={{
                click: () => {
                  setSelectedId(zone.id);
                  onZoneSelect(zone);
                },
              }}
            >
              <Popup minWidth={240} maxWidth={300}>
                <div className="space-y-2 py-1">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" style={{ color }} />
                    <span className="font-semibold text-sm">Scout Zone {zone.zone_rank}</span>
                    <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                      {statusIcon(zone.status)}
                      {zone.status}
                    </span>
                  </div>

                  {/* Risk score */}
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${zone.max_risk_score * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-xs font-mono" style={{ color }}>
                      {(zone.max_risk_score * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Disease candidates */}
                  {zone.disease_candidates.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {zone.disease_candidates.map((d) => (
                        <span
                          key={d}
                          className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"
                        >
                          {diseaseDisplayName(d)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Cells count + date */}
                  <p className="text-xs text-slate-500">
                    {zone.cell_count} satellite cells · scanned {zone.scan_date}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <ZoomToZone lat={zone.centroid_lat} lng={zone.centroid_lng} />
                    {zone.status === 'pending' || zone.status === 'scouted' ? (
                      <button
                        className="ml-auto flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1 rounded-full hover:bg-orange-600 transition-colors"
                        onClick={() => onZoneSelect(zone)}
                      >
                        <Camera className="w-3 h-3" />
                        Take Photo
                      </button>
                    ) : null}
                  </div>
                </div>
              </Popup>
            </Marker>
          </div>
        );
      })}
    </>
  );
}
