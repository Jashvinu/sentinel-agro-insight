import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  Camera,
  ClipboardCheck,
  Download,
  Droplets,
  FilePlus2,
  FlaskConical,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  Plus,
  QrCode,
  RefreshCw,
  Satellite,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';

import { Navigation } from '@/components/layout/navigation/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/useToast';
import { MOCK_TRACE_FARMS, type MockTraceFarm } from '@/services/traceabilityMockData';
import {
  createTraceLot,
  getOfflineTraceQueue,
  listTraceLots,
} from '@/services/traceabilityService';
import type { TraceLot } from '@/services/traceabilityTypes';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function readString(record: AnyRecord, key: string, fallback = 'Not recorded'): string {
  const value = record[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function readNumber(record: AnyRecord, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(record: AnyRecord, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function formatDate(value?: string): string {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function lotFarmId(lot: TraceLot): string {
  return readString(asRecord(lot.metadata), 'farm_id', MOCK_TRACE_FARMS[0].id);
}

const STATUS_TONE: Record<string, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  ready: 'border-sky-200 bg-sky-50 text-sky-800',
  review_needed: 'border-amber-200 bg-amber-50 text-amber-800',
  incomplete: 'border-rose-200 bg-rose-50 text-rose-800',
  not_assessed: 'border-slate-200 bg-slate-50 text-slate-700',
};

const ORGANIC_TONE: Record<string, string> = {
  'Full organic': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Partial organic': 'border-amber-200 bg-amber-50 text-amber-800',
  'Conventional transition': 'border-slate-200 bg-slate-50 text-slate-700',
};

function MetricTile({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'slate',
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  sublabel: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
  }[tone];

  return (
    <Card className="rounded-lg border-border/80">
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className={`h-10 w-10 rounded-md p-2 ${toneClass}`} />
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{sublabel}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FarmCard({
  farm,
  selected,
  lotCount,
  onSelect,
}: {
  farm: MockTraceFarm;
  selected: boolean;
  lotCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-3 text-left transition ${
        selected
          ? 'border-emerald-500 bg-emerald-50/80 shadow-sm'
          : 'border-border bg-background hover:border-emerald-300 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{farm.name}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{farm.region}</span>
          </div>
        </div>
        <Badge variant="outline" className={ORGANIC_TONE[farm.organicStatus]}>
          {farm.organicStatus}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="font-semibold">{farm.healthPercent}%</div>
          <div className="text-muted-foreground">Health</div>
        </div>
        <div>
          <div className="font-semibold">{lotCount}</div>
          <div className="text-muted-foreground">Lots</div>
        </div>
        <div>
          <div className="font-semibold">{farm.problemAreas}</div>
          <div className="text-muted-foreground">Warnings</div>
        </div>
      </div>
    </button>
  );
}

function farmMarkerTone(farm: MockTraceFarm, selected: boolean) {
  if (selected) return { stroke: '#047857', fill: '#10b981' };
  if (farm.criticalAreas >= 7) return { stroke: '#be123c', fill: '#fb7185' };
  if (farm.criticalAreas >= 3) return { stroke: '#b45309', fill: '#f59e0b' };
  return { stroke: '#047857', fill: '#34d399' };
}

function AppleFarmMap({
  farms,
  selectedFarmId,
  lotsByFarm,
  onSelect,
}: {
  farms: MockTraceFarm[];
  selectedFarmId: string;
  lotsByFarm: Record<string, TraceLot[]>;
  onSelect: (farmId: string) => void;
}) {
  return (
    <div className="relative h-[390px] overflow-hidden rounded-lg border bg-[#eff4e8] sm:h-[430px]">
      <MapContainer
        center={[40.809, -77.88]}
        zoom={10}
        minZoom={8}
        maxZoom={16}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {farms.map((farm) => {
          const selected = farm.id === selectedFarmId;
          const tone = farmMarkerTone(farm, selected);
          const farmLots = lotsByFarm[farm.id] ?? [];
          return (
            <CircleMarker
              key={farm.id}
              center={[farm.lat, farm.lng]}
              radius={selected ? 13 : 9 + Math.min(farmLots.length, 3)}
              pathOptions={{
                color: tone.stroke,
                weight: selected ? 4 : 2,
                fillColor: tone.fill,
                fillOpacity: selected ? 0.86 : 0.72,
              }}
              eventHandlers={{ click: () => onSelect(farm.id) }}
            >
              <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.95}>
                <span className="text-xs font-semibold">{farm.name}</span>
              </LeafletTooltip>
              <Popup>
                <div className="min-w-[220px] space-y-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{farm.name}</div>
                    <div className="text-xs text-slate-600">{farm.region} / {farm.county}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{farm.healthPercent}%</div>
                      <div className="text-slate-500">Health</div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{farmLots.length}</div>
                      <div className="text-slate-500">Lots</div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{farm.problemAreas}</div>
                      <div className="text-slate-500">Warnings</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600">{farm.orchardBlock}</div>
                  <button
                    type="button"
                    className="w-full rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => onSelect(farm.id)}
                  >
                    Open orchard data
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute left-3 top-3 max-w-[280px] rounded-lg border border-white/80 bg-white/95 p-3 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">State College, PA</div>
        <div className="text-sm font-bold text-slate-950">Apple traceability network</div>
        <div className="mt-1 text-xs leading-snug text-slate-600">Dots expand into orchard health, lots, evidence gaps, and buyer packet readiness.</div>
      </div>
    </div>
  );
}

function LotStatusRow({ lot, selected, onSelect }: { lot: TraceLot; selected: boolean; onSelect: () => void }) {
  const metadata = asRecord(lot.metadata);
  const sellerNode = asRecord(metadata.seller_node);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full gap-3 rounded-lg border p-3 text-left transition lg:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_88px] lg:items-center ${
        selected ? 'border-emerald-500 bg-emerald-50/70' : 'border-border bg-background hover:border-emerald-300'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{lot.lot_code}</span>
          <Badge className={STATUS_TONE[lot.compliance_status] ?? STATUS_TONE.not_assessed} variant="outline">
            {lot.compliance_status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="mt-1 text-xs capitalize text-muted-foreground">
          {lot.crop}{lot.variety ? ` / ${lot.variety}` : ''} / {readString(metadata, 'farm_name')}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Seller Grade</div>
        <div className="text-sm font-medium">{readString(sellerNode, 'grade')}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Quantity</div>
        <div className="text-sm font-semibold">{lot.current_quantity.toLocaleString()} {lot.quantity_unit}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Evidence</div>
        <div className="flex items-center gap-2">
          <Progress value={lot.evidence_score} className="h-2 max-w-[88px]" />
          <span className="text-sm font-semibold">{Math.round(lot.evidence_score)}%</span>
        </div>
      </div>
      <div className="text-left lg:text-right">
        <div className="text-xs text-muted-foreground">Risk</div>
        <div className={`text-sm font-semibold ${lot.risk_score > 35 ? 'text-rose-600' : lot.risk_score > 20 ? 'text-amber-600' : 'text-emerald-700'}`}>
          {Math.round(lot.risk_score)}%
        </div>
      </div>
    </button>
  );
}

function EvidenceMeter({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? 'bg-emerald-500' : value >= 65 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const Traceability: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('traceability');
  const [lots, setLots] = useState<TraceLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState(MOCK_TRACE_FARMS[0].id);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    crop: '',
    variety: '',
    season: '',
    initial_quantity: '0',
    quantity_unit: 'lb',
    production_area_hectares: '',
  });

  const { toast } = useToast();
  const navigate = useNavigate();
  const offlineCount = getOfflineTraceQueue().length;

  const loadLots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTraceLots();
      setLots(data);
      setSelectedLotId((current) => current ?? data[0]?.id ?? null);
    } catch (error) {
      toast({
        title: 'Traceability unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const lotsByFarm = useMemo(() => {
    return MOCK_TRACE_FARMS.reduce<Record<string, TraceLot[]>>((acc, farm) => {
      acc[farm.id] = lots.filter((lot) => lotFarmId(lot) === farm.id);
      return acc;
    }, {});
  }, [lots]);

  const selectedFarm = MOCK_TRACE_FARMS.find((farm) => farm.id === selectedFarmId) ?? MOCK_TRACE_FARMS[0];
  const farmLots = useMemo(() => lotsByFarm[selectedFarm.id] ?? [], [lotsByFarm, selectedFarm.id]);
  const visibleLots = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return farmLots;
    return farmLots.filter((lot) => {
      const metadata = asRecord(lot.metadata);
      return [
        lot.lot_code,
        lot.crop,
        lot.variety ?? '',
        readString(metadata, 'seed_type'),
        readString(metadata, 'farm_location'),
      ].some((value) => value.toLowerCase().includes(lowered));
    });
  }, [farmLots, query]);

  useEffect(() => {
    if (!farmLots.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(farmLots[0]?.id ?? null);
    }
  }, [farmLots, selectedLotId]);

  const selectedLot = visibleLots.find((lot) => lot.id === selectedLotId) ?? visibleLots[0] ?? farmLots[0] ?? lots[0];
  const metadata = asRecord(selectedLot?.metadata);
  const sellerNode = asRecord(metadata.seller_node);
  const diagnosticSummary = asRecord(metadata.diagnostic_summary);
  const cropModel = asRecord(metadata.crop_model);
  const diseaseModel = asRecord(metadata.disease_model);
  const gradeQualityYield = asRecord(metadata.grade_quality_yield);
  const evidenceCoverage = asRecord(metadata.evidence_coverage);

  const portfolioStats = useMemo(() => {
    const ready = lots.filter((lot) => lot.compliance_status === 'ready' || lot.compliance_status === 'verified').length;
    const review = lots.filter((lot) => lot.compliance_status === 'review_needed' || lot.compliance_status === 'incomplete').length;
    const avgEvidence = lots.length ? Math.round(lots.reduce((sum, lot) => sum + lot.evidence_score, 0) / lots.length) : 0;
    const totalQuantity = lots.reduce((sum, lot) => sum + Number(lot.current_quantity ?? 0), 0);
    return { ready, review, avgEvidence, totalQuantity };
  }, [lots]);

  const weeklyPlan = Array.isArray(cropModel.weekly_plan) ? cropModel.weekly_plan.map(asRecord) : [];

  const handleCreateLot = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const lot = await createTraceLot({
        crop: form.crop,
        variety: form.variety || undefined,
        season: form.season || undefined,
        initial_quantity: Number(form.initial_quantity),
        quantity_unit: form.quantity_unit || 'lb',
        production_area_hectares: form.production_area_hectares ? Number(form.production_area_hectares) : undefined,
        metadata: { farm_id: selectedFarm.id, farm_name: selectedFarm.name },
      });
      toast({ title: 'Lot created', description: `${lot.lot_code} is ready for event capture.` });
      setForm({ crop: '', variety: '', season: '', initial_quantity: '0', quantity_unit: 'lb', production_area_hectares: '' });
      navigate(`/traceability/lots/${lot.id}`);
    } catch (error) {
      toast({
        title: 'Lot not saved',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f4] pb-24 text-slate-950 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="mx-auto max-w-[1500px] space-y-5 px-3 py-4 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Pennsylvania Apple Traceability
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">Mock orchard network</Badge>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">State College Apple Traceability Dashboard</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Map-based orchard origins, rootstock records, IPM proof, scout diagnostics, apple disease history, grade, quality, yield, and seller-node records in one buyer operating view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/traceability/events/new">
                <Button className="gap-2 bg-emerald-700 hover:bg-emerald-800">
                  <FilePlus2 className="h-4 w-4" />
                  Capture Event
                </Button>
              </Link>
              <Button variant="outline" className="gap-2 bg-white" onClick={loadLots} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {selectedLot && (
                <Link to={`/traceability/lots/${selectedLot.id}`}>
                  <Button variant="outline" className="gap-2 bg-white">
                    <QrCode className="h-4 w-4" />
                    Lot Passport
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile icon={MapPin} label="Orchards" value={MOCK_TRACE_FARMS.length} sublabel="around State College" tone="slate" />
          <MetricTile icon={Boxes} label="Apple Lots" value={lots.length} sublabel={`${portfolioStats.totalQuantity.toLocaleString()} lb forecast`} tone="sky" />
          <MetricTile icon={ClipboardCheck} label="Buyer Ready" value={portfolioStats.ready} sublabel="ready or verified apple lots" tone="emerald" />
          <MetricTile icon={AlertTriangle} label="Needs Review" value={portfolioStats.review} sublabel="blocked before buyer report" tone="amber" />
          <MetricTile icon={ShieldCheck} label="Evidence Avg" value={`${portfolioStats.avgEvidence}%`} sublabel={`${offlineCount} offline queue items`} tone="rose" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="order-2 space-y-3 xl:order-1">
            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4 text-emerald-700" />
                  Orchard Portfolio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {MOCK_TRACE_FARMS.map((farm) => (
                  <FarmCard
                    key={farm.id}
                    farm={farm}
                    lotCount={(lotsByFarm[farm.id] ?? []).length}
                    selected={farm.id === selectedFarm.id}
                    onSelect={() => setSelectedFarmId(farm.id)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus className="h-4 w-4 text-emerald-700" />
                  New Apple Lot Draft
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <form className="space-y-3" onSubmit={handleCreateLot}>
                  <div className="space-y-1.5">
                    <Label htmlFor="crop">Crop</Label>
                    <Input id="crop" value={form.crop} onChange={(event) => setForm({ ...form, crop: event.target.value })} placeholder="apples" required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="variety">Variety</Label>
                      <Input id="variety" value={form.variety} onChange={(event) => setForm({ ...form, variety: event.target.value })} placeholder="Honeycrisp" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="season">Season</Label>
                      <Input id="season" value={form.season} onChange={(event) => setForm({ ...form, season: event.target.value })} placeholder="2026 apple season" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" type="number" min="0" step="0.01" value={form.initial_quantity} onChange={(event) => setForm({ ...form, initial_quantity: event.target.value })} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit">Unit</Label>
                      <Input id="unit" value={form.quantity_unit} onChange={(event) => setForm({ ...form, quantity_unit: event.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="area">Area ha</Label>
                    <Input id="area" type="number" min="0" step="0.01" value={form.production_area_hectares} onChange={(event) => setForm({ ...form, production_area_hectares: event.target.value })} />
                  </div>
                  <Button className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800" disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create Lot
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="order-1 space-y-5 xl:order-2">
            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">{selectedFarm.name}</CardTitle>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>{selectedFarm.region}</span>
                    <span>{selectedFarm.county}</span>
                    <span>{selectedFarm.areaHectares} ha</span>
                    <span>{selectedFarm.farmerCount} grower accounts</span>
                    <span>{selectedFarm.crops.join(' + ')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={ORGANIC_TONE[selectedFarm.organicStatus]}>{selectedFarm.organicStatus}</Badge>
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">{selectedFarm.sensorCoverage}% sensor coverage</Badge>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{selectedFarm.labStatus}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 pt-0 xl:grid-cols-[1.35fr_0.65fr]">
                <AppleFarmMap
                  farms={MOCK_TRACE_FARMS}
                  selectedFarmId={selectedFarm.id}
                  lotsByFarm={lotsByFarm}
                  onSelect={setSelectedFarmId}
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-lg border bg-[#fbfcf7] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Orchard Health</div>
                      <Satellite className="h-4 w-4 text-sky-700" />
                    </div>
                    <div className="mt-3 flex items-end gap-3">
                      <div className="text-4xl font-bold text-emerald-700">{readString(diagnosticSummary, 'farm_health', `${selectedFarm.healthPercent}%`)}</div>
                      <div className="pb-1 text-xs text-slate-600">{readNumber(diagnosticSummary, 'healthy_cells', selectedFarm.healthyCells)} of {readNumber(diagnosticSummary, 'total_cells', selectedFarm.totalCells)} cells healthy</div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-white p-2">
                        <div className="font-semibold">{readNumber(diagnosticSummary, 'problem_areas', selectedFarm.problemAreas)}</div>
                        <div className="text-slate-500">Warnings</div>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <div className="font-semibold">{readNumber(diagnosticSummary, 'critical_areas', selectedFarm.criticalAreas)}</div>
                        <div className="text-slate-500">Critical</div>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <div className="font-semibold">{readNumber(diagnosticSummary, 'satellite_images', selectedFarm.satelliteImages)}</div>
                        <div className="text-slate-500">Map reads</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-[#fbfcf7] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Seller Node</div>
                      <QrCode className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div><span className="text-slate-500">Yield:</span> {readString(sellerNode, 'yield')}</div>
                      <div><span className="text-slate-500">Grade:</span> {readString(sellerNode, 'grade')}</div>
                      <div><span className="text-slate-500">Harvest:</span> {readString(sellerNode, 'harvest_date')}</div>
                      <div><span className="text-slate-500">Seed:</span> {readString(sellerNode, 'seed_type')}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="h-4 w-4 text-emerald-700" />
                  Lots and Buyer Readiness
                </CardTitle>
                <div className="relative w-full lg:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" placeholder="Search lot, variety, rootstock, location" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {loading ? (
                  <div className="flex items-center gap-3 rounded-lg border p-5 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading traceability lots...
                  </div>
                ) : visibleLots.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No lots match this farm or search.</div>
                ) : (
                  visibleLots.map((lot) => (
                    <LotStatusRow key={lot.id} lot={lot} selected={lot.id === selectedLot?.id} onSelect={() => setSelectedLotId(lot.id)} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {selectedLot && (
          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Leaf className="h-4 w-4 text-emerald-700" />
                  IPM Production and Advisory Loop
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Leaf className="h-3.5 w-3.5" /> How Grown</div>
                    <div className="mt-2 text-sm">{readString(metadata, 'grown_method')}</div>
                  </div>
                  <div className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><FlaskConical className="h-3.5 w-3.5" /> IPM / Organic Proof</div>
                    <div className="mt-2 text-sm">{readString(metadata, 'organic_status')} · {readString(metadata, 'inorganic_materials')}</div>
                  </div>
                  <div className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Camera className="h-3.5 w-3.5" /> Farmer Photo Task</div>
                    <div className="mt-2 text-sm">{readString(cropModel, 'farmer_photo_task')}</div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {weeklyPlan.map((week, index) => (
                    <div key={`${readString(week, 'week')}-${index}`} className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[96px_1fr_1fr_100px] md:items-center">
                      <div className="text-sm font-semibold">Week {readString(week, 'week')}</div>
                      <div>
                        <div className="text-sm font-medium">{readString(week, 'stage')}</div>
                        <div className="text-xs text-slate-500">{readString(week, 'ideal')}</div>
                      </div>
                      <div className="text-xs text-slate-600">{readString(week, 'signal')}</div>
                      <Badge variant="outline" className={readString(week, 'status') === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700'}>
                        {readString(week, 'status')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border/80 bg-white">
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-sky-700" />
                  Disease, Quality, and Evidence Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="rounded-lg border bg-[#fbfcf7] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Disease Model</div>
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{readString(diseaseModel, 'risk_level')}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {readStringArray(diseaseModel, 'likely_diseases').map((disease) => (
                      <Badge key={disease} variant="outline" className="border-slate-200 bg-white text-slate-700">{disease}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-slate-500">Signals:</span> {readStringArray(diseaseModel, 'signals_used').join(', ') || 'Not recorded'}</div>
                    <div><span className="text-slate-500">Collection:</span> {readString(diseaseModel, 'collection_plan')}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-emerald-700" /> Grade / Quality / Yield</div>
                    <div className="mt-2 space-y-1.5 text-sm">
                      <div>{readString(gradeQualityYield, 'harvest_map')}</div>
                      <div>{readString(gradeQualityYield, 'cross_verification')}</div>
                      <div className="font-medium">{readString(gradeQualityYield, 'grade_split')} · {readString(gradeQualityYield, 'yield_estimate')}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Droplets className="h-4 w-4 text-sky-700" /> Suggestion Follow-Up</div>
                    <div className="mt-2 space-y-1.5 text-sm">
                      <div>{readString(cropModel, 'suggestion_loop')}</div>
                      <div>{readString(cropModel, 'progress_tracking')}</div>
                      <div className="text-slate-500">{readString(diseaseModel, 'advice_channel')}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['Farm Polygon', 'farm_polygon'],
                    ['Rootstock / Variety', 'seed_declaration'],
                    ['IPM / Organic Inputs', 'organic_inputs'],
                    ['Scout Photos', 'farmer_photos'],
                    ['Lab Tests', 'lab_tests'],
                    ['Grade / Yield', 'grade_yield'],
                    ['Disease History', 'disease_history'],
                    ['QR Passport', 'qr_passport'],
                  ].map(([label, key]) => (
                    <EvidenceMeter key={key} label={label} value={readNumber(evidenceCoverage, key)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="rounded-lg border-border/80 bg-white">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-emerald-700" />
                Buyer Node Data Points
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['Rootstock / Variety', readString(metadata, 'seed_type'), Leaf],
                ['Where Grown', readString(metadata, 'farm_location'), MapPin],
                ['How Grown', readString(metadata, 'grown_method'), Activity],
                ['How IPM / Organic', readString(sellerNode, 'how_organic'), FlaskConical],
                ['Yield / Grade', `${readString(sellerNode, 'yield')} · ${readString(sellerNode, 'grade')}`, TrendingUp],
                ['Disease History', readString(sellerNode, 'disease_history'), AlertTriangle],
              ].map(([label, value, Icon]) => {
                const ItemIcon = Icon as typeof Activity;
                return (
                  <div key={String(label)} className="rounded-lg border bg-[#fbfcf7] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <ItemIcon className="h-3.5 w-3.5" />
                      {String(label)}
                    </div>
                    <div className="mt-2 text-sm leading-snug">{String(value)}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/80 bg-white">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-4 w-4 text-emerald-700" />
                Buyer Packet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {[
                ['Audit PDF', selectedLot?.evidence_score ?? 0],
                ['CTE/KDE Sheet', selectedLot?.evidence_score ?? 0],
                ['QR Passport', readNumber(evidenceCoverage, 'qr_passport')],
                ['Farm Map Packet', readNumber(evidenceCoverage, 'farm_polygon')],
                ['Evidence Bundle', Math.round(((selectedLot?.evidence_score ?? 0) + readNumber(evidenceCoverage, 'lab_tests')) / 2)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-md border bg-background p-2.5">
                  <div className="text-sm font-medium">{String(label)}</div>
                  <div className="flex items-center gap-2">
                    <Progress value={Number(value)} className="h-2 w-20" />
                    <span className="w-9 text-right text-xs font-semibold">{Number(value)}%</span>
                  </div>
                </div>
              ))}
              {selectedLot && (
                <Link to={`/traceability/lots/${selectedLot.id}`} className="block pt-2">
                  <Button variant="outline" className="w-full justify-between bg-white">
                    Open lot room
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </section>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          Mock dashboard data adapts the Traceability PDF data points into a State College, Pennsylvania apple pilot. Buyer-facing claims remain conservative until residue panels, organic certificates, maturity tests, packhouse sheets, and scout photos are uploaded.
        </div>
      </main>
    </div>
  );
};

export default Traceability;
