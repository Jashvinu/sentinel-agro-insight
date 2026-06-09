import { Camera, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ScoutZone, diseaseDisplayName, riskColor } from '@/services/diseaseService';

interface ScoutZoneSidebarProps {
  zones: ScoutZone[];
  onSelect: (zone: ScoutZone) => void;
}

function StatusBadge({ status }: { status: ScoutZone['status'] }) {
  switch (status) {
    case 'confirmed': return <span className="flex items-center gap-1 text-xs text-red-600"><CheckCircle className="w-3 h-3" />Confirmed</span>;
    case 'scouted':   return <span className="flex items-center gap-1 text-xs text-amber-600"><Clock className="w-3 h-3" />Scouted</span>;
    case 'cleared':   return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Cleared</span>;
    default:          return <span className="flex items-center gap-1 text-xs text-orange-500"><AlertTriangle className="w-3 h-3" />Pending</span>;
  }
}

export default function ScoutZoneSidebar({ zones, onSelect }: ScoutZoneSidebarProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          Disease Scout Zones
          <span className="ml-auto text-xs font-normal text-muted-foreground">{zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-3 space-y-2">
        {zones.map((zone) => {
          const color = riskColor(zone.max_risk_score);
          return (
            <div
              key={zone.id}
              className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50/50 transition-colors cursor-pointer"
              onClick={() => onSelect(zone)}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5"
                style={{ backgroundColor: color }}
              >
                {zone.zone_rank}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {zone.disease_candidates.map(diseaseDisplayName).join(', ') || 'Disease risk'}
                  </p>
                  <StatusBadge status={zone.status} />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${zone.max_risk_score * 100}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs font-mono" style={{ color }}>
                    {(zone.max_risk_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              {(zone.status === 'pending' || zone.status === 'scouted') && (
                <button
                  className="flex-shrink-0 flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-1 rounded-full hover:bg-orange-600 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onSelect(zone); }}
                >
                  <Camera className="w-3 h-3" />
                  Scout
                </button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
