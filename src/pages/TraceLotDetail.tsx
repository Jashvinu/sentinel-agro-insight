import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  ExternalLink,
  FileText,
  Fingerprint,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import { Navigation } from '@/components/layout/navigation/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/useToast';
import {
  assessTraceLot,
  calculateClientRiskPreview,
  createHashBatch,
  createQrToken,
  generateTraceReport,
  getTraceLot,
} from '@/services/traceabilityService';
import { TRACE_EVENT_LABELS } from '@/services/traceabilityTypes';
import type { QrToken, TraceEvent, TraceLot, TraceReport } from '@/services/traceabilityTypes';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string, fallback = 'Not recorded'): string {
  const value = record[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatDateTime(value?: string): string {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusClass(status: string): string {
  if (status === 'verified') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'ready') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (status === 'review_needed') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'incomplete') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function EventRow({ event }: { event: TraceEvent }) {
  return (
    <div className="grid gap-3 border-b py-3 last:border-b-0 sm:grid-cols-[160px_1fr_120px]">
      <div>
        <div className="text-sm font-semibold">{TRACE_EVENT_LABELS[event.event_type]}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(event.event_time)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-muted-foreground">{event.event_hash}</div>
        {event.notes && <div className="mt-1 text-sm text-muted-foreground">{event.notes}</div>}
      </div>
      <div className="flex items-start justify-end">
        <Badge variant="outline" className={event.hash_status === 'batched' ? 'border-emerald-200 text-emerald-700' : ''}>
          {event.hash_status}
        </Badge>
      </div>
    </div>
  );
}

const TraceLotDetail: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('traceability');
  const [lot, setLot] = useState<TraceLot | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [reports, setReports] = useState<TraceReport[]>([]);
  const [token, setToken] = useState<QrToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const { lotId } = useParams();
  const { toast } = useToast();

  const riskPreview = useMemo(() => (lot ? calculateClientRiskPreview(lot, events) : null), [events, lot]);
  const metadata = asRecord(lot?.metadata);
  const sellerNode = asRecord(metadata.seller_node);
  const diagnosticSummary = asRecord(metadata.diagnostic_summary);
  const gradeQualityYield = asRecord(metadata.grade_quality_yield);
  const diagnosticImageUrl = readString(metadata, 'diagnostic_image_url', '');

  const loadLot = useCallback(async () => {
    if (!lotId) return;
    setLoading(true);
    try {
      const data = await getTraceLot(lotId);
      setLot(data.lot);
      setEvents(data.events);
      setReports(data.reports);
      setToken(data.token ?? null);
    } catch (error) {
      toast({
        title: 'Lot unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [lotId, toast]);

  useEffect(() => {
    loadLot();
  }, [loadLot]);

  const runAction = async (name: string, action: () => Promise<unknown>) => {
    setWorking(name);
    try {
      await action();
      toast({ title: 'Updated', description: `${name} completed.` });
      await loadLot();
    } catch (error) {
      toast({
        title: `${name} failed`,
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/traceability">
              <Button variant="outline" size="sm" className="h-10 w-10 p-0" aria-label="Back to traceability">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">{lot?.lot_code ?? 'Traceability Lot'}</h1>
              {lot && (
                <p className="truncate text-sm capitalize text-muted-foreground">
                  {lot.crop}{lot.variety ? ` / ${lot.variety}` : ''}{lot.season ? ` / ${lot.season}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/traceability/events/new?lot_id=${lotId ?? ''}`}>
              <Button className="gap-2">
                <CalendarClock className="h-4 w-4" />
                Add Event
              </Button>
            </Link>
            <Button variant="outline" className="gap-2" onClick={loadLot} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="rounded-lg">
            <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading lot...
            </CardContent>
          </Card>
        ) : lot ? (
          <>
            <div className="grid gap-3 lg:grid-cols-4">
              <Card className="rounded-lg lg:col-span-2">
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BadgeCheck className="h-4 w-4 text-emerald-700" />
                    Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0">
                  <Badge variant="outline" className={statusClass(lot.compliance_status)}>
                    {lot.compliance_status.replace(/_/g, ' ')}
                  </Badge>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Evidence</div>
                      <div className="text-xl font-bold">{Math.round(lot.evidence_score)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Risk</div>
                      <div className="text-xl font-bold">{Math.round(lot.risk_score)}%</div>
                    </div>
                  </div>
                  <Progress value={lot.evidence_score} className="h-2" />
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Fingerprint className="h-4 w-4 text-sky-700" />
                    Hash Ledger
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                  <div className="text-sm text-muted-foreground">
                    {events.filter((event) => event.hash_status === 'batched').length} of {events.length} batched
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={Boolean(working)}
                    onClick={() => runAction('Hash batch', () => createHashBatch({ organization_id: lot.organization_id }))}
                  >
                    {working === 'Hash batch' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Batch Today
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <QrCode className="h-4 w-4 text-slate-700" />
                    Passport
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                  {token ? (
                    <Link to={`/qr/${token.public_slug}`} target="_blank">
                      <Button variant="outline" size="sm" className="w-full gap-2">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={Boolean(working)}
                      onClick={() => runAction('QR passport', () => createQrToken(lot.id))}
                    >
                      {working === 'QR passport' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create QR
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <Card className="rounded-lg">
                <CardHeader className="flex flex-row items-center justify-between p-4">
                  <CardTitle className="text-base">Events</CardTitle>
                  <Badge variant="outline">{events.length}</Badge>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {events.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No events recorded.
                    </div>
                  ) : (
                    <div>{events.map((event) => <EventRow key={event.id} event={event} />)}</div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                {diagnosticImageUrl && (
                  <Card className="overflow-hidden rounded-lg">
                    <CardHeader className="p-4">
                      <CardTitle className="text-base">Diagnostic Image</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <img
                        src={diagnosticImageUrl}
                        alt="Diagnostic map source"
                        className="aspect-[15/8] w-full rounded-md border object-cover"
                      />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md bg-muted/40 p-2">
                          <div className="text-xs text-muted-foreground">Farm Health</div>
                          <div className="font-semibold">{readString(diagnosticSummary, 'farm_health')}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <div className="text-xs text-muted-foreground">Issues</div>
                          <div className="font-semibold">{readString(sellerNode, 'disease_history')}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="rounded-lg">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">Seller Node</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0 text-sm">
                    {[
                      ['Yield', 'yield'],
                      ['Grade', 'grade'],
                      ['How Organic', 'how_organic'],
                      ['Harvest Date', 'harvest_date'],
                      ['Farm Location', 'farm_location'],
                      ['Seed Type', 'seed_type'],
                      ['Disease History', 'disease_history'],
                    ].map(([label, key]) => (
                      <div key={key} className="rounded-md border p-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div>{readString(sellerNode, key)}</div>
                      </div>
                    ))}
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Harvest Map</div>
                      <div>{readString(gradeQualityYield, 'harvest_map')}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-lg">
                  <CardHeader className="p-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldAlert className="h-4 w-4 text-amber-700" />
                      Risk Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0">
                    {riskPreview?.flags.length ? (
                      riskPreview.flags.map((flag) => (
                        <div key={flag} className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                          {flag}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">No client-side flags.</div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={Boolean(working)}
                      onClick={() => runAction('Risk assessment', () => assessTraceLot(lot.id))}
                    >
                      {working === 'Risk assessment' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Recalculate
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-lg">
                  <CardHeader className="p-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-slate-700" />
                      Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0">
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={Boolean(working)}
                      onClick={() => runAction('Buyer audit report', () => generateTraceReport(lot.id, 'buyer_audit'))}
                    >
                      {working === 'Buyer audit report' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generate Audit
                    </Button>
                    {reports.map((report) => (
                      <Link key={report.id} to={`/traceability/reports/${report.id}`} className="block">
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span className="truncate">{report.title}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <Card className="rounded-lg border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">Lot not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TraceLotDetail;
