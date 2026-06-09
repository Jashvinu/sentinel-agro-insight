import { Phone, Globe, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type KVKWithDistance } from '@/services/kvkService';

interface NearestKVKCardProps {
  kvk: KVKWithDistance;
}

export default function NearestKVKCard({ kvk }: NearestKVKCardProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-green-600" />
          Nearest KVK
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-3 space-y-2">
        <div>
          <p className="text-sm font-medium text-slate-800">{kvk.name}</p>
          <p className="text-xs text-slate-500">{kvk.district}, {kvk.division} · {kvk.distance_km} km away</p>
        </div>
        <p className="text-xs text-slate-600">
          <span className="font-medium">Crops: </span>
          {kvk.crops.map((c) => c.replace(/_/g, ' ')).join(', ')}
        </p>
        <div className="flex gap-2 pt-1">
          {kvk.phone && (
            <a
              href={`tel:${kvk.phone}`}
              className="flex items-center gap-1 text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-full transition-colors"
            >
              <Phone className="w-3 h-3" />
              Call KVK
            </a>
          )}
          {kvk.website && (
            <a
              href={kvk.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-700 border border-green-300 hover:bg-green-50 px-3 py-1.5 rounded-full transition-colors"
            >
              <Globe className="w-3 h-3" />
              Website
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
