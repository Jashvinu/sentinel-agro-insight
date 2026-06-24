/**
 * PlotDesigner — tap-to-vertex polygon builder
 *
 * Flow:
 *   1. Places search + locate button navigate the satellite map.
 *   2. User taps map corners; each tap drops a draggable marker.
 *   3. At 3+ points "Close polygon" appears — tap it to lock in an editable polygon.
 *   4. Drag any vertex handle to refine.
 *   5. "Save farm" sheet offers cloud save or local-only save.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Check,
  Cloud,
  HardDrive,
  Layers,
  Loader2,
  Locate,
  Save,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { polygonsToFarmInsert, saveFarm, saveTempFarm } from '@/services/farmService';

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
const DEFAULT_CENTER = { lat: 12.39115, lng: 77.7736 };
const ACTIVE_FARM_KEY = 'activeFarmId';

type LatLng = { lat: number; lng: number };
type Phase = 'placing' | 'done';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeAreaSqM(ring: LatLng[]): number {
  const earth = 6378137;
  const rad = Math.PI / 180;
  const pts = ring.map(({ lat, lng }) => ({
    x: earth * lng * rad,
    y: earth * Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2)),
  }));
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function formatArea(sqM: number): string {
  if (!sqM || !Number.isFinite(sqM) || sqM <= 0) return '—';
  if (sqM >= 10000) return `${(sqM / 10000).toFixed(2)} ha`;
  if (sqM >= 4046.856) return `${(sqM / 4046.856).toFixed(2)} ac`;
  return `${Math.round(sqM)} m²`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const PlotDesigner: React.FC = () => {

  const mapEl = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  // Always-current mirror of React vertices state (avoids stale closures in map callbacks)
  const verticesRef = useRef<LatLng[]>([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [phase, setPhase] = useState<Phase>('placing');
  const [polyInfo, setPolyInfo] = useState<{ vertexCount: number; areaSqM: number } | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'hybrid'>('satellite');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [farmName, setFarmName] = useState('My Farm');
  const [saving, setSaving] = useState(false);
  const [savingTo, setSavingTo] = useState<'cloud' | 'local' | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  // ─── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || !GOOGLE_MAPS_API_KEY) return;
    let cancelled = false;

    (async () => {
      try {
        setOptions({ key: GOOGLE_MAPS_API_KEY, v: 'weekly' });
        await Promise.all([importLibrary('maps'), importLibrary('places')]);
        if (cancelled || !mapEl.current) return;

        const map = new google.maps.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom: 17,
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          tilt: 0,
          clickableIcons: false,
        });
        mapRef.current = map;
        setMapLoaded(true);
        focusCurrentLocation(map);
      } catch (err) {
        toast({
          title: 'Map load failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ─── Places autocomplete ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !searchInputRef.current || !mapRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
      fields: ['geometry', 'name'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;
      const map = mapRef.current!;
      if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else {
        map.setCenter(place.geometry.location);
        map.setZoom(18);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [mapLoaded]);

  // ─── Map click → add vertex (only while placing) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || phase !== 'placing') {
      if (clickListenerRef.current) {
        google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
      return;
    }

    clickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) addVertex({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });

    return () => {
      if (clickListenerRef.current) {
        google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [phase, mapLoaded]);

  // ─── Geolocation ─────────────────────────────────────────────────────────────
  const focusCurrentLocation = useCallback((maybeMap?: google.maps.Map) => {
    const map = maybeMap ?? mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(Math.max(map.getZoom() ?? 17, 18));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // ─── Polyline helper ──────────────────────────────────────────────────────────
  const refreshPolyline = useCallback((pts: LatLng[]) => {
    const map = mapRef.current;
    if (!map || pts.length < 2) {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      return;
    }
    // Close the preview ring when 3+ points
    const path = pts.length >= 3 ? [...pts, pts[0]] : pts;
    if (polylineRef.current) {
      polylineRef.current.setPath(path);
    } else {
      polylineRef.current = new google.maps.Polyline({
        map,
        path,
        strokeColor: '#10b981',
        strokeOpacity: 0.85,
        strokeWeight: 2.5,
        clickable: false,
        zIndex: 8,
      });
    }
  }, []);

  // ─── Add vertex ───────────────────────────────────────────────────────────────
  const addVertex = useCallback((pt: LatLng) => {
    const map = mapRef.current;
    if (!map) return;

    const marker = new google.maps.Marker({
      position: pt,
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      draggable: true,
      zIndex: 10,
    });

    markersRef.current.push(marker);
    verticesRef.current = [...verticesRef.current, pt];
    setVertices([...verticesRef.current]);
    refreshPolyline(verticesRef.current);

    marker.addListener('drag', () => {
      const idx = markersRef.current.indexOf(marker);
      if (idx === -1) return;
      const pos = marker.getPosition();
      if (!pos) return;
      verticesRef.current[idx] = { lat: pos.lat(), lng: pos.lng() };
      refreshPolyline(verticesRef.current);
      setVertices([...verticesRef.current]);
    });
  }, [refreshPolyline]);

  // ─── Undo ─────────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (verticesRef.current.length === 0) return;
    const last = markersRef.current.pop();
    last?.setMap(null);
    verticesRef.current = verticesRef.current.slice(0, -1);
    setVertices([...verticesRef.current]);
    refreshPolyline(verticesRef.current);
  }, [refreshPolyline]);

  // ─── Close polygon ────────────────────────────────────────────────────────────
  const handleClosePolygon = useCallback(() => {
    const pts = verticesRef.current;
    if (pts.length < 3) return;
    const map = mapRef.current;
    if (!map) return;

    // Tear down markers + preview line
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    const polygon = new google.maps.Polygon({
      map,
      paths: pts,
      editable: true,
      draggable: false,
      strokeColor: '#10b981',
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: '#10b981',
      fillOpacity: 0.2,
      zIndex: 9,
    });
    polygonRef.current = polygon;

    const recompute = () => {
      const ring: LatLng[] = [];
      polygon.getPath().forEach(ll => ring.push({ lat: ll.lat(), lng: ll.lng() }));
      if (ring.length >= 3) {
        setPolyInfo({ vertexCount: ring.length, areaSqM: computeAreaSqM(ring) });
      }
    };
    ['set_at', 'insert_at', 'remove_at'].forEach(evt =>
      polygon.getPath().addListener(evt, recompute),
    );
    recompute();
    setPhase('done');
  }, []);

  // ─── Clear all ────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    verticesRef.current = [];
    setVertices([]);
    setPolyInfo(null);
    setPhase('placing');
  }, []);

  const handleToggleMapType = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = mapType === 'satellite' ? 'hybrid' : 'satellite';
    map.setMapTypeId(next);
    setMapType(next);
  }, [mapType]);

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const getRing = useCallback((): number[][] => {
    const poly = polygonRef.current;
    if (!poly) return [];
    const ring: number[][] = [];
    poly.getPath().forEach(ll => ring.push([ll.lng(), ll.lat()]));
    if (ring.length > 0) ring.push([ring[0][0], ring[0][1]]);
    return ring;
  }, []);

  const handleSave = useCallback(
    async (to: 'cloud' | 'local') => {
      if (!farmName.trim()) {
        toast({ title: 'Name required', variant: 'destructive' });
        return;
      }
      const ring = getRing();
      if (ring.length < 4) {
        toast({ title: 'No polygon drawn', variant: 'destructive' });
        return;
      }

      setSaving(true);
      setSavingTo(to);
      try {
        const farmInsert = polygonsToFarmInsert(
          [{ type: 'Polygon', coordinates: [ring] }],
          farmName.trim(),
        );

        let savedId: string;
        if (to === 'cloud') {
          const saved = await saveFarm(farmInsert);
          if (!saved) throw new Error('Save returned null');
          savedId = saved.id;
          toast({ title: 'Saved to cloud', description: `"${saved.name}" is ready.` });
        } else {
          const saved = saveTempFarm(farmInsert);
          savedId = saved.id;
          toast({ title: 'Saved locally', description: `"${saved.name}" saved on this device.` });
        }

        localStorage.setItem(ACTIVE_FARM_KEY, savedId);
        navigate('/');
      } catch (err) {
        toast({
          title: 'Save failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
        setSavingTo(null);
        setShowSaveDialog(false);
      }
    },
    [farmName, getRing, navigate, toast],
  );

  // ─── Instruction text ─────────────────────────────────────────────────────────
  const hint =
    vertices.length === 0
      ? 'Tap map corners to outline your plot'
      : vertices.length < 3
      ? `${vertices.length} point${vertices.length > 1 ? 's' : ''} — add ${3 - vertices.length} more to close`
      : `${vertices.length} corners — tap "Close" or keep adding`;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Full-bleed map */}
      <div ref={mapEl} className="absolute inset-0" />

      {/* ─── Top bar ─── */}
      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 pt-3 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="shrink-0 w-10 h-10 grid place-items-center rounded-full bg-black/60 backdrop-blur border border-white/15 text-white active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Places search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search location…"
            disabled={!mapLoaded}
            className="w-full h-10 pl-9 pr-3 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white text-sm placeholder:text-white/40 outline-none focus:border-emerald-500/60 disabled:opacity-50"
          />
        </div>

        {/* Locate */}
        <button
          onClick={() => focusCurrentLocation()}
          disabled={!mapLoaded}
          className="shrink-0 w-10 h-10 grid place-items-center rounded-full bg-black/60 backdrop-blur border border-white/15 text-white active:scale-95 transition disabled:opacity-50"
          aria-label="My location"
        >
          <Locate className="w-5 h-5" />
        </button>

        {/* Map type toggle */}
        <button
          onClick={handleToggleMapType}
          disabled={!mapLoaded}
          className="shrink-0 w-10 h-10 grid place-items-center rounded-full bg-black/60 backdrop-blur border border-white/15 text-white active:scale-95 transition disabled:opacity-50"
          aria-label="Toggle map type"
        >
          <Layers className="w-5 h-5" />
        </button>
      </header>

      {/* ─── Hint pill ─── */}
      {phase === 'placing' && mapLoaded && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20"
          style={{ top: 'calc(env(safe-area-inset-top) + 68px)' }}
        >
          <div className="px-4 py-2 rounded-full bg-black/70 backdrop-blur text-white text-xs font-medium shadow-lg whitespace-nowrap">
            {hint}
          </div>
        </div>
      )}

      {/* ─── Loading overlay ─── */}
      {!mapLoaded && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/50 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-white" />
            <p className="text-sm text-white/80">Loading map…</p>
          </div>
        </div>
      )}

      {/* ─── Bottom action sheet ─── */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 px-4 pt-2 pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {phase === 'done' ? (
          // Polygon ready
          <div className="pointer-events-auto mx-auto max-w-md rounded-3xl bg-white/96 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                  Your plot
                </div>
                <div className="text-3xl font-bold text-slate-900 leading-tight mt-0.5">
                  {formatArea(polyInfo?.areaSqM ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {polyInfo?.vertexCount ?? 0} corners · drag handles to refine
                </div>
              </div>
              <button
                onClick={handleClear}
                className="w-11 h-11 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 active:scale-95 transition"
                aria-label="Clear polygon"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition"
            >
              <Save className="w-4 h-4" />
              Save farm
            </button>
          </div>
        ) : (
          // Placing vertices
          <div className="pointer-events-auto mx-auto max-w-md flex gap-2">
            {vertices.length === 0 ? (
              <div className="flex-1 py-3.5 rounded-2xl bg-black/60 backdrop-blur border border-white/10 text-white/50 text-sm text-center">
                Tap on the map to place corners
              </div>
            ) : (
              <>
                <button
                  onClick={handleUndo}
                  className="flex-1 py-3.5 rounded-2xl bg-black/70 backdrop-blur border border-white/15 text-white font-medium text-sm flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>

                {vertices.length >= 3 && (
                  <button
                    onClick={handleClosePolygon}
                    className="flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <Check className="w-4 h-4" />
                    Close polygon
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Save dialog ─── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Save your farm</DialogTitle>
            <DialogDescription>
              Give it a name, then choose where to save it.
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <Input
              autoFocus
              placeholder="e.g., North field, Mango block A"
              value={farmName}
              onChange={e => setFarmName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && farmName.trim() && !saving) handleSave('cloud');
              }}
              className="h-12 text-base"
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {/* Cloud save */}
            <button
              onClick={() => handleSave('cloud')}
              disabled={!farmName.trim() || saving}
              className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition"
            >
              {saving && savingTo === 'cloud' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              Save to cloud
            </button>

            {/* Local save */}
            <button
              onClick={() => handleSave('local')}
              disabled={!farmName.trim() || saving}
              className="w-full h-12 rounded-2xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-medium flex items-center justify-center gap-2 transition"
            >
              {saving && savingTo === 'local' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <HardDrive className="w-4 h-4 text-slate-500" />
              )}
              Save locally only
            </button>

            <button
              onClick={() => setShowSaveDialog(false)}
              disabled={saving}
              className="w-full h-10 rounded-2xl text-slate-400 hover:text-slate-600 text-sm transition"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlotDesigner;
