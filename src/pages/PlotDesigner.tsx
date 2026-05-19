/**
 * PlotDesigner — mobile-app style
 *
 * Full-bleed map with a glass top bar and a bottom action sheet. The user:
 *   1. Sees their current location on a satellite map.
 *   2. Taps the big Pencil FAB and draws around their plot.
 *   3. On release, the stroke is simplified with Ramer–Douglas–Peucker into a
 *      clean straight-edged editable polygon that follows their drawing.
 *   4. Drags vertices to refine, names the farm, and continues to diagnostics.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pencil,
  Locate,
  Trash2,
  Save,
  Layers,
  Loader2,
  ChevronRight,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { simplifyStrokeToPolygon, type LatLng } from '@/utils/polygonSimplify';
import { saveFarm, polygonsToFarmInsert } from '@/services/farmService';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';
const DEFAULT_CENTER: LatLng = { lat: 12.39115, lng: 77.7736 };
const ACTIVE_FARM_KEY = 'activeFarmId';

const SIMPLIFY_PRESETS = [
  { label: 'Faithful', value: 0.006 },
  { label: 'Balanced', value: 0.015 },
  { label: 'Coarse', value: 0.035 },
] as const;

type Status = { tone: 'idle' | 'ok' | 'warn' | 'bad'; text: string };

const PlotDesigner: React.FC = () => {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const drawShieldRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const roughPointsRef = useRef<LatLng[]>([]);
  const isDrawingRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [polyInfo, setPolyInfo] = useState<{ vertices: number; areaSqM: number } | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'hybrid' | 'roadmap'>('satellite');
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: 'Loading map…' });
  const [simplifyIdx, setSimplifyIdx] = useState<number>(2); // "Coarse" default
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [farmName, setFarmName] = useState('My Farm');
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  // ─── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current) return;
    if (!GOOGLE_MAPS_API_KEY) {
      setStatus({ tone: 'bad', text: 'Add VITE_GOOGLE_MAPS_API_KEY to .env.' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setOptions({ key: GOOGLE_MAPS_API_KEY, v: 'weekly' });
        const mapsLibrary = (await importLibrary('maps')) as google.maps.MapsLibrary;
        if (cancelled || !mapEl.current) return;

        const map = new mapsLibrary.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom: 17,
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          zoomControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          tilt: 0,
          clickableIcons: false,
        });
        mapRef.current = map;
        setMapLoaded(true);
        setStatus({ tone: 'idle', text: 'Centering on your location…' });
        focusCurrentLocation(map);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus({ tone: 'bad', text: `Map load failed: ${msg}` });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Geolocation ───────────────────────────────────────────────────────────
  const focusCurrentLocation = useCallback((maybeMap?: google.maps.Map) => {
    const map = maybeMap ?? mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) {
      setStatus({ tone: 'warn', text: 'Geolocation unavailable. Pan to your plot.' });
      return;
    }
    setStatus({ tone: 'idle', text: 'Reading location…' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(Math.max(map.getZoom() || 17, 18));
        setStatus({ tone: 'ok', text: 'Tap Pencil and trace your plot.' });
      },
      () => {
        setStatus({ tone: 'warn', text: 'Location denied. Pan to your plot.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  // ─── Simplify stroke into editable polygon ─────────────────────────────────
  const renderPolygonFromStroke = useCallback((stroke: LatLng[], tolerancePct: number) => {
    const map = mapRef.current;
    if (!map || stroke.length < 3) return;

    const result = simplifyStrokeToPolygon(stroke, { tolerancePct });
    if (result.ring.length < 4) {
      setStatus({ tone: 'bad', text: 'Sketch too small. Try a bigger loop.' });
      return;
    }

    const path: google.maps.LatLngLiteral[] = result.ring
      .slice(0, -1)
      .map((p) => ({ lat: p.lat, lng: p.lng }));

    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    polygonRef.current?.setMap(null);

    const polygon = new google.maps.Polygon({
      map,
      paths: path,
      editable: true,
      draggable: true,
      strokeColor: '#10b981',
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: '#10b981',
      fillOpacity: 0.22,
      zIndex: 9,
    });
    polygonRef.current = polygon;

    const updateInfo = () => {
      const p = polygon.getPath();
      const ring: LatLng[] = [];
      p.forEach((latLng) => ring.push({ lat: latLng.lat(), lng: latLng.lng() }));
      if (ring.length >= 3) {
        setPolyInfo({ vertices: ring.length, areaSqM: computeAreaSqM(ring) });
      }
    };
    const path1 = polygon.getPath();
    ['set_at', 'insert_at', 'remove_at'].forEach((evt) => path1.addListener(evt, updateInfo));

    setPolyInfo({ vertices: result.vertexCount, areaSqM: result.areaSqM });
    setHasPolygon(true);
    setStatus({ tone: 'ok', text: 'Drag any handle to refine. Tap Save when ready.' });
  }, []);

  // ─── Pencil drawing on the overlay shield ──────────────────────────────────
  useEffect(() => {
    const shield = drawShieldRef.current;
    if (!shield) return;

    const clientToLatLng = (clientX: number, clientY: number): LatLng | null => {
      const map = mapRef.current;
      const el = mapEl.current;
      if (!map || !el) return null;
      const projection = map.getProjection();
      if (!projection) return null;
      const bounds = el.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      const centerPt = projection.fromLatLngToPoint(map.getCenter() as google.maps.LatLng);
      if (!centerPt) return null;
      const scale = 2 ** (map.getZoom() ?? 17);
      const worldPt = new google.maps.Point(
        centerPt.x + (x - bounds.width / 2) / scale,
        centerPt.y + (y - bounds.height / 2) / scale,
      );
      const latLng = projection.fromPointToLatLng(worldPt);
      return latLng ? { lat: latLng.lat(), lng: latLng.lng() } : null;
    };

    const addPoint = (event: PointerEvent, force = false) => {
      const rect = mapEl.current?.getBoundingClientRect();
      if (!rect) return;
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!force && lastPointerRef.current) {
        const dist = Math.hypot(
          pointer.x - lastPointerRef.current.x,
          pointer.y - lastPointerRef.current.y,
        );
        if (dist < 4) return;
      }
      lastPointerRef.current = pointer;
      const latLng = clientToLatLng(event.clientX, event.clientY);
      if (!latLng) return;
      roughPointsRef.current.push(latLng);
      if (polylineRef.current) {
        const pts = roughPointsRef.current;
        polylineRef.current.setPath(pts.length > 2 ? [...pts, pts[0]] : pts);
      }
    };

    const onDown = (event: PointerEvent) => {
      if (!drawMode) return;
      event.preventDefault();
      shield.setPointerCapture(event.pointerId);
      isDrawingRef.current = true;
      roughPointsRef.current = [];
      lastPointerRef.current = null;
      polylineRef.current?.setMap(null);
      polylineRef.current = new google.maps.Polyline({
        map: mapRef.current!,
        path: [],
        strokeColor: '#ef4444',
        strokeOpacity: 0.95,
        strokeWeight: 4,
        clickable: false,
        zIndex: 8,
      });
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      setHasPolygon(false);
      setPolyInfo(null);
      addPoint(event, true);
      setStatus({ tone: 'idle', text: 'Drawing…' });
    };

    const onMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();
      addPoint(event);
    };

    const onUp = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();
      isDrawingRef.current = false;
      try {
        shield.releasePointerCapture(event.pointerId);
      } catch {
        // some browsers release automatically
      }
      const stroke = roughPointsRef.current;
      if (stroke.length < 3) {
        polylineRef.current?.setMap(null);
        polylineRef.current = null;
        setStatus({ tone: 'bad', text: 'Sketch too small. Try a bigger loop.' });
        return;
      }
      renderPolygonFromStroke(stroke, SIMPLIFY_PRESETS[simplifyIdx].value);
      setDrawMode(false);
    };

    shield.addEventListener('pointerdown', onDown);
    shield.addEventListener('pointermove', onMove);
    shield.addEventListener('pointerup', onUp);
    shield.addEventListener('pointercancel', onUp);

    return () => {
      shield.removeEventListener('pointerdown', onDown);
      shield.removeEventListener('pointermove', onMove);
      shield.removeEventListener('pointerup', onUp);
      shield.removeEventListener('pointercancel', onUp);
    };
  }, [drawMode, simplifyIdx, renderPolygonFromStroke]);

  const handleResimplify = useCallback(
    (nextIdx: number) => {
      setSimplifyIdx(nextIdx);
      const stroke = roughPointsRef.current;
      if (stroke.length >= 3) {
        renderPolygonFromStroke(stroke, SIMPLIFY_PRESETS[nextIdx].value);
      }
    },
    [renderPolygonFromStroke],
  );

  const handleClear = useCallback(() => {
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    roughPointsRef.current = [];
    setHasPolygon(false);
    setPolyInfo(null);
    setStatus({ tone: 'idle', text: 'Tap Pencil and trace your plot.' });
  }, []);

  const handleToggleMapType = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: 'satellite' | 'hybrid' | 'roadmap' =
      mapType === 'satellite' ? 'hybrid' : mapType === 'hybrid' ? 'roadmap' : 'satellite';
    map.setMapTypeId(next);
    setMapType(next);
  }, [mapType]);

  const handleSave = useCallback(async () => {
    const polygon = polygonRef.current;
    if (!polygon) {
      toast({ title: 'No plot drawn', description: 'Trace your plot first.', variant: 'destructive' });
      return;
    }
    if (!farmName.trim()) {
      toast({ title: 'Name required', description: 'Give your farm a name.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const path = polygon.getPath();
      const ring: number[][] = [];
      path.forEach((latLng) => ring.push([latLng.lng(), latLng.lat()]));
      if (ring.length > 0) ring.push([ring[0][0], ring[0][1]]);

      const farmInsert = polygonsToFarmInsert(
        [{ type: 'Polygon', coordinates: [ring] }],
        farmName.trim(),
      );
      const saved = await saveFarm(farmInsert);
      if (!saved) throw new Error('Save returned null');

      localStorage.setItem(ACTIVE_FARM_KEY, saved.id);
      toast({ title: 'Saved', description: `"${saved.name}" is ready.` });
      navigate('/field-diagnostics');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
      setShowSaveDialog(false);
    }
  }, [farmName, navigate, toast]);

  const statusBadgeClass = {
    idle: 'bg-white/90 text-slate-900',
    ok: 'bg-emerald-500/95 text-white',
    warn: 'bg-amber-500/95 text-white',
    bad: 'bg-rose-500/95 text-white',
  }[status.tone];

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{
        // Honor iOS safe areas (notch / home indicator)
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ─── Full-bleed map ─── */}
      <div ref={mapEl} className="absolute inset-0" />

      {/* Pencil capture shield */}
      <div
        ref={drawShieldRef}
        className="absolute inset-0"
        style={{
          touchAction: 'none',
          cursor: drawMode ? 'crosshair' : 'default',
          pointerEvents: drawMode ? 'auto' : 'none',
          background: drawMode ? 'rgba(0,0,0,0.001)' : 'transparent',
          zIndex: 5,
        }}
      />

      {/* ─── Top app bar (glass) ─── */}
      <header
        className="absolute top-0 left-0 right-0 z-20 px-4 pt-3 pb-2 flex items-center gap-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 text-white">
          <div className="text-[10px] uppercase tracking-wider text-white/60 leading-none">Step 1 of 2</div>
          <div className="text-sm font-semibold leading-tight truncate">Design your plot</div>
        </div>

        {/* Icon button row */}
        <button
          onClick={() => focusCurrentLocation()}
          disabled={!mapLoaded}
          aria-label="My location"
          className="w-11 h-11 grid place-items-center rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-white active:scale-95 transition disabled:opacity-50"
        >
          <Locate className="w-5 h-5" />
        </button>
        <button
          onClick={handleToggleMapType}
          disabled={!mapLoaded}
          aria-label="Toggle map type"
          className="w-11 h-11 grid place-items-center rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-white active:scale-95 transition disabled:opacity-50"
        >
          <Layers className="w-5 h-5" />
        </button>
      </header>

      {/* ─── Floating status pill ─── */}
      {!hasPolygon && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 px-4"
          style={{ top: 'calc(env(safe-area-inset-top) + 72px)' }}
        >
          <div
            className={`px-3.5 py-2 rounded-full text-xs font-medium shadow-lg backdrop-blur-md max-w-[88vw] text-center whitespace-nowrap overflow-hidden text-ellipsis ${statusBadgeClass}`}
          >
            {status.text}
          </div>
        </div>
      )}

      {/* ─── Map type indicator (small, top-left under bar) — optional ─── */}

      {/* ─── Loading overlay ─── */}
      {!mapLoaded && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/40 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-white" />
            <p className="text-sm text-white/90">Loading map…</p>
          </div>
        </div>
      )}

      {/* ─── Bottom action sheet ─── */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 px-4 pt-3 pb-4 pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        {hasPolygon ? (
          // Polygon ready — show info card + Save CTA
          <div className="pointer-events-auto mx-auto max-w-md rounded-3xl bg-white/95 backdrop-blur-md border border-white/30 shadow-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 leading-none">Your plot</div>
                  <div className="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
                    {formatArea(polyInfo?.areaSqM ?? 0)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {polyInfo?.vertices ?? 0} corner{polyInfo?.vertices === 1 ? '' : 's'} · drag handles to refine
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  aria-label="Clear polygon"
                  className="w-11 h-11 grid place-items-center rounded-full bg-slate-100 text-slate-600 active:scale-95 transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Detail level chips */}
              {roughPointsRef.current.length >= 3 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Detail</div>
                  <div className="flex gap-1.5">
                    {SIMPLIFY_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.label}
                        onClick={() => handleResimplify(idx)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${
                          simplifyIdx === idx
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSaveDialog(true)}
              className="w-full py-4 bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 active:bg-emerald-600 transition"
            >
              Save & analyze
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          // Default — single big Pencil FAB
          <div className="pointer-events-auto flex justify-center">
            <button
              onClick={() => setDrawMode((v) => !v)}
              disabled={!mapLoaded}
              className={`flex items-center gap-3 px-6 py-4 rounded-full font-semibold shadow-2xl active:scale-95 transition disabled:opacity-50 ${
                drawMode
                  ? 'bg-rose-500 text-white'
                  : 'bg-emerald-500 text-white'
              }`}
              style={{ minWidth: 200 }}
            >
              {drawMode ? <X className="w-6 h-6" /> : <Pencil className="w-6 h-6" />}
              <span className="text-base">{drawMode ? 'Cancel drawing' : 'Draw plot'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Save dialog ─── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Name your farm</DialogTitle>
            <DialogDescription>
              We'll save it and open Field Diagnostics with your boundary.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="e.g., North field, Mango block A"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && farmName.trim() && !saving) handleSave();
              }}
              className="h-12 text-base"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSaveDialog(false)}
              disabled={saving}
              className="h-12 rounded-2xl flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!farmName.trim() || saving}
              className="h-12 rounded-2xl flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function computeAreaSqM(ring: LatLng[]): number {
  const earth = 6378137;
  const meters = ring.map(({ lat, lng }) => ({
    x: earth * ((lng * Math.PI) / 180),
    y: earth * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)),
  }));
  let sum = 0;
  for (let i = 0; i < meters.length; i += 1) {
    const a = meters[i];
    const b = meters[(i + 1) % meters.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function formatArea(sqMeters: number): string {
  if (!Number.isFinite(sqMeters) || sqMeters <= 0) return '—';
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
  if (sqMeters >= 4046.856) return `${(sqMeters / 4046.856).toFixed(2)} ac`;
  return `${Math.round(sqMeters)} m²`;
}

export default PlotDesigner;
