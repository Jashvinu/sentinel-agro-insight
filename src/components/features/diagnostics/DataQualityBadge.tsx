import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DiagnosticResult } from '@/services/diagnosticService';
import { ShieldCheck, Cloud, Clock, Layers } from 'lucide-react';

interface DataQualityBadgeProps {
  result: DiagnosticResult | null;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

function formatRelativeTime(date: Date): string {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  for (const [unit, secondsPerUnit] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === 'second') {
      return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }
  return formatter.format(0, 'second');
}

export const DataQualityBadge: React.FC<DataQualityBadgeProps> = ({ result }) => {
  if (!result) return null;

  const { imagesAnalyzed, analysisDate, cloudCover } = result;

  const timeAgo = formatRelativeTime(new Date(analysisDate));
  
  // Determine data quality level
  let quality: 'high' | 'medium' | 'low' = 'high';
  let qualityColor = 'text-green-500';
  let badgeColor = 'bg-green-100 text-green-700';
  let tooltip = 'High confidence analysis based on high-quality recent satellite imagery.';

  if (cloudCover && cloudCover > 30) {
    quality = 'low';
    qualityColor = 'text-red-500';
    badgeColor = 'bg-red-100 text-red-700';
    tooltip = 'Low confidence due to high cloud cover in recent images.';
  } else if (imagesAnalyzed < 5 || (cloudCover && cloudCover > 10)) {
    quality = 'medium';
    qualityColor = 'text-amber-500';
    badgeColor = 'bg-amber-100 text-amber-700';
    tooltip = 'Medium confidence analysis based on available satellite imagery.';
  }

  return (
    <div className="absolute bottom-6 left-4 z-[1000] flex flex-col gap-2 pointer-events-none">
      <Card className="px-3 py-2 shadow-md bg-white/95 backdrop-blur-sm border-white/20 pointer-events-auto">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className={`w-4 h-4 ${qualityColor}`} />
          <span className="text-xs font-semibold text-slate-800">Observation Quality</span>
          <Badge className={`px-1.5 py-0 text-[10px] uppercase font-bold ml-auto ${badgeColor} border-none`}>
            {quality}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Number of composite layers analyzed">
            <Layers className="w-3 h-3" />
            <span>{imagesAnalyzed} images</span>
          </div>
          
          <div className="flex items-center gap-1.5" title="Average cloud cover in images">
            <Cloud className="w-3 h-3" />
            <span>{cloudCover !== undefined ? `${cloudCover.toFixed(1)}%` : '<10%'} clouds</span>
          </div>
          
          <div className="flex items-center gap-1.5 col-span-2" title="Analysis generation time">
            <Clock className="w-3 h-3" />
            <span>Analyzed {timeAgo}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
