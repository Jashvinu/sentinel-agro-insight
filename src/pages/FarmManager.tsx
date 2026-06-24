import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { getAllFarms, deleteFarm, getTempFarms } from '@/services/farmService';
import type { Farm } from '@/services/supabase';
import { useToast } from '@/hooks/useToast';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
const ACTIVE_FARM_KEY = 'activeFarmId';

// ─── Static map thumbnail ──────────────────────────────────────────────────────

function buildThumbnailUrl(geometry: Farm['geometry']): string {
  if (!GOOGLE_MAPS_API_KEY) return '';

  let ring: number[][] = [];
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    ring = geometry.coordinates[0][0];
  }
  if (ring.length === 0) return '';

  // Sample at most 20 vertices to keep URL short
  const step = Math.max(1, Math.floor(ring.length / 20));
  const sampled = ring.filter((_, i) => i % step === 0);

  const lats = sampled.map(([, lat]) => lat);
  const lngs = sampled.map(([lng]) => lng);
  const centerLat = ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(5);
  const centerLng = ((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(5);

  const pathPoints = sampled
    .map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join('|');

  const base = new URLSearchParams({
    center: `${centerLat},${centerLng}`,
    zoom: '15',
    size: '600x240',
    maptype: 'satellite',
    key: GOOGLE_MAPS_API_KEY,
  });

  return (
    `https://maps.googleapis.com/maps/api/staticmap?${base.toString()}` +
    `&path=color:0x10b981ff|weight:2|fillcolor:0x10b98155|${pathPoints}`
  );
}

function formatArea(ha: number | null | undefined): string {
  if (!ha) return '—';
  if (ha >= 1) return `${ha.toFixed(2)} ha`;
  return `${(ha * 10000).toFixed(0)} m²`;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Farm card ─────────────────────────────────────────────────────────────────

interface FarmCardProps {
  farm: Farm;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const FarmCard: React.FC<FarmCardProps> = ({ farm, isActive, isDeleting, onSelect, onDelete }) => {
  const isTemp = farm.id.startsWith('temp_');
  const thumbUrl = buildThumbnailUrl(farm.geometry);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className={`rounded-2xl overflow-hidden border transition-all ${
        isActive
          ? 'border-emerald-500/50 bg-slate-800/70'
          : 'border-white/8 bg-slate-900/80'
      }`}
    >
      {/* Satellite thumbnail */}
      <div className="relative h-44 bg-slate-800">
        {thumbUrl && !imgFailed ? (
          <img
            src={thumbUrl}
            alt={farm.name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-8 h-8 text-slate-600" />
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {isActive && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500 text-white shadow">
              Active
            </span>
          )}
          {isTemp && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/90 text-white shadow">
              Local
            </span>
          )}
        </div>

        {/* Name overlay at bottom-left */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h3 className="font-semibold text-white text-base leading-tight truncate drop-shadow">
            {farm.name}
          </h3>
          <p className="text-xs text-white/70 mt-0.5 drop-shadow">
            {formatArea(farm.area_hectares)}
            {!isTemp && farm.created_at ? ` · ${formatDate(farm.created_at)}` : ' · Not synced'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex items-center gap-2">
        <button
          onClick={onSelect}
          className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-medium text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.97]"
        >
          Analyze this farm
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete farm"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition disabled:opacity-40"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────

const FarmManager: React.FC = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_FARM_KEY),
  );
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadFarms = useCallback(async () => {
    setLoading(true);
    try {
      const [remote, temp] = await Promise.all([
        getAllFarms(),
        Promise.resolve(getTempFarms()),
      ]);
      const remoteIds = new Set(remote.map(f => f.id));
      setFarms([...remote, ...temp.filter(f => !remoteIds.has(f.id))]);
    } catch {
      toast({ title: 'Failed to load farms', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadFarms(); }, [loadFarms]);

  const handleSelect = useCallback((farm: Farm) => {
    localStorage.setItem(ACTIVE_FARM_KEY, farm.id);
    setActiveFarmId(farm.id);
    navigate('/');
  }, [navigate]);

  const handleDelete = useCallback(async (farm: Farm) => {
    setDeletingId(farm.id);
    try {
      await deleteFarm(farm.id);
      setFarms(prev => prev.filter(f => f.id !== farm.id));
      if (activeFarmId === farm.id) {
        localStorage.removeItem(ACTIVE_FARM_KEY);
        setActiveFarmId(null);
      }
      toast({ title: `"${farm.name}" deleted` });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }, [activeFarmId, toast]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-white/8 px-4 py-4"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight">My Farms</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {loading ? 'Loading…' : `${farms.length} farm${farms.length !== 1 ? 's' : ''} saved`}
            </p>
          </div>
          <button
            onClick={() => navigate('/plot-designer')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Farm
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <p className="text-sm text-slate-400">Loading farms…</p>
          </div>
        ) : farms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-5 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
              <MapPin className="w-9 h-9 text-slate-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-200 text-lg">No farms yet</p>
              <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
                Tap corners on the map to outline your first plot, then save it.
              </p>
            </div>
            <button
              onClick={() => navigate('/plot-designer')}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Map my first farm
            </button>
          </div>
        ) : (
          farms.map(farm => (
            <FarmCard
              key={farm.id}
              farm={farm}
              isActive={farm.id === activeFarmId}
              isDeleting={deletingId === farm.id}
              onSelect={() => handleSelect(farm)}
              onDelete={() => handleDelete(farm)}
            />
          ))
        )}
      </main>
    </div>
  );
};

export default FarmManager;
