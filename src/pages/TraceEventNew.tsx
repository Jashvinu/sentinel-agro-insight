import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Save } from 'lucide-react';

import { Navigation } from '@/components/layout/navigation/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { getAllFarms } from '@/services/farmService';
import { createTraceEvent, listTraceLots } from '@/services/traceabilityService';
import {
  EVIDENCE_TYPES,
  TRACE_EVENT_LABELS,
  TRACE_EVENT_TYPES,
  type EvidenceType,
  type TraceEventType,
  type TraceLot,
} from '@/services/traceabilityTypes';
import type { Farm } from '@/services/supabase';

const TraceEventNew: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('traceability');
  const [searchParams] = useSearchParams();
  const initialLotId = searchParams.get('lot_id') ?? '';
  const [lots, setLots] = useState<TraceLot[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    lot_id: initialLotId,
    farm_id: '',
    event_type: 'harvested' as TraceEventType,
    event_time: new Date().toISOString().slice(0, 16),
    quantity_in: '',
    quantity_out: '',
    quantity_unit: 'kg',
    confidence_score: '75',
    notes: '',
    evidence_type: 'field_agent_verification' as EvidenceType,
    evidence_title: '',
    evidence_uri: '',
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  const selectedLot = useMemo(() => lots.find((lot) => lot.id === form.lot_id), [form.lot_id, lots]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [lotData, farmData] = await Promise.all([listTraceLots(), getAllFarms()]);
        if (!cancelled) {
          setLots(lotData);
          setFarms(farmData);
          if (!initialLotId && lotData[0]) {
            setForm((current) => ({ ...current, lot_id: lotData[0].id }));
          }
          if (farmData[0]) {
            setForm((current) => ({ ...current, farm_id: farmData[0].id }));
          }
        }
      } catch (error) {
        toast({
          title: 'Traceability data unavailable',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [initialLotId, toast]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const evidence = form.evidence_title
        ? [{
            evidence_type: form.evidence_type,
            title: form.evidence_title,
            uri: form.evidence_uri || undefined,
            confidence_score: Number(form.confidence_score),
          }]
        : undefined;

      const traceEvent = await createTraceEvent({
        lot_id: form.lot_id || undefined,
        farm_id: form.farm_id || undefined,
        event_type: form.event_type,
        event_time: new Date(form.event_time).toISOString(),
        quantity_in: form.quantity_in ? Number(form.quantity_in) : undefined,
        quantity_out: form.quantity_out ? Number(form.quantity_out) : undefined,
        quantity_unit: form.quantity_unit || selectedLot?.quantity_unit || 'kg',
        confidence_score: Number(form.confidence_score),
        notes: form.notes || undefined,
        evidence,
        kde_payload: {
          crop: selectedLot?.crop,
          variety: selectedLot?.variety,
          lot_code: selectedLot?.lot_code,
        },
      });

      toast({ title: 'Event saved', description: TRACE_EVENT_LABELS[traceEvent.event_type] });
      navigate(traceEvent.lot_id ? `/traceability/lots/${traceEvent.lot_id}` : '/traceability');
    } catch (error) {
      toast({
        title: 'Event not saved',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <Link to={form.lot_id ? `/traceability/lots/${form.lot_id}` : '/traceability'}>
            <Button variant="outline" size="sm" className="h-10 w-10 p-0" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Capture Trace Event</h1>
            <p className="text-sm text-muted-foreground">{selectedLot?.lot_code ?? 'No lot selected'}</p>
          </div>
        </div>

        <Card className="rounded-lg">
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Event
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSave}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="lot">Lot</Label>
                    <select
                      id="lot"
                      value={form.lot_id}
                      onChange={(event) => setForm({ ...form, lot_id: event.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">No lot</option>
                      {lots.map((lot) => (
                        <option key={lot.id} value={lot.id}>{lot.lot_code} / {lot.crop}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="farm">Farm</Label>
                    <select
                      id="farm"
                      value={form.farm_id}
                      onChange={(event) => setForm({ ...form, farm_id: event.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">No farm</option>
                      {farms.map((farm) => (
                        <option key={farm.id} value={farm.id}>{farm.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event_type">Event Type</Label>
                    <select
                      id="event_type"
                      value={form.event_type}
                      onChange={(event) => setForm({ ...form, event_type: event.target.value as TraceEventType })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {TRACE_EVENT_TYPES.map((eventType) => (
                        <option key={eventType} value={eventType}>{TRACE_EVENT_LABELS[eventType]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event_time">Event Time</Label>
                    <Input
                      id="event_time"
                      type="datetime-local"
                      value={form.event_time}
                      onChange={(event) => setForm({ ...form, event_time: event.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity_in">Quantity In</Label>
                    <Input id="quantity_in" type="number" min="0" step="0.01" value={form.quantity_in} onChange={(event) => setForm({ ...form, quantity_in: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity_out">Quantity Out</Label>
                    <Input id="quantity_out" type="number" min="0" step="0.01" value={form.quantity_out} onChange={(event) => setForm({ ...form, quantity_out: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quantity_unit">Unit</Label>
                    <Input id="quantity_unit" value={form.quantity_unit} onChange={(event) => setForm({ ...form, quantity_unit: event.target.value })} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="confidence">Confidence</Label>
                    <Input id="confidence" type="number" min="0" max="100" value={form.confidence_score} onChange={(event) => setForm({ ...form, confidence_score: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-3 text-sm font-semibold">Evidence</div>
                  <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                    <div className="space-y-1.5">
                      <Label htmlFor="evidence_type">Type</Label>
                      <select
                        id="evidence_type"
                        value={form.evidence_type}
                        onChange={(event) => setForm({ ...form, evidence_type: event.target.value as EvidenceType })}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {EVIDENCE_TYPES.map((evidenceType) => (
                          <option key={evidenceType} value={evidenceType}>{evidenceType.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="evidence_title">Title</Label>
                      <Input id="evidence_title" value={form.evidence_title} onChange={(event) => setForm({ ...form, evidence_title: event.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="evidence_uri">URI</Label>
                    <Input id="evidence_uri" type="url" value={form.evidence_uri} onChange={(event) => setForm({ ...form, evidence_uri: event.target.value })} />
                  </div>
                </div>

                <Button className="w-full gap-2 sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Event
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TraceEventNew;
