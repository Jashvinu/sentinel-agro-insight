import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeCheck, CalendarClock, Fingerprint, Loader2, MapPin, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getPublicPassport } from '@/services/traceabilityService';

interface PassportData {
  lot?: {
    lot_code: string;
    crop: string;
    variety?: string | null;
    season?: string | null;
    current_quantity?: number;
    quantity_unit?: string;
    compliance_status?: string;
    evidence_score?: number;
    risk_score?: number;
    metadata?: Record<string, unknown>;
  };
  events?: Array<{
    id: string;
    event_type: string;
    event_time: string;
    event_hash: string;
    hash_status: string;
  }>;
  hash_batches?: Array<{
    merkle_root: string;
    batch_date: string;
  }>;
  caveats?: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string, fallback = 'Not recorded'): string {
  const value = record[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatDate(value?: string): string {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

const PublicPassport: React.FC = () => {
  const { token } = useParams();
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const passport = await getPublicPassport(token);
        if (!cancelled) setData(passport as PassportData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const lot = data?.lot;
  const metadata = asRecord(lot?.metadata);
  const sellerNode = asRecord(metadata.seller_node);
  const diagnosticImageUrl = readString(metadata, 'diagnostic_image_url', '');

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-slate-950">
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                wrkFarm Passport
              </div>
              <h1 className="mt-1 text-3xl font-bold">{lot?.lot_code ?? 'Product Passport'}</h1>
            </div>
            {lot?.compliance_status && (
              <Badge variant="outline" className="w-fit border-emerald-200 bg-emerald-50 text-emerald-800">
                {lot.compliance_status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </div>

        {loading ? (
          <Card className="rounded-lg bg-white">
            <CardContent className="flex items-center gap-3 p-6 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading passport...
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="rounded-lg bg-white">
            <CardContent className="p-6 text-rose-700">{error}</CardContent>
          </Card>
        ) : lot ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="rounded-lg bg-white">
                <CardContent className="flex items-center gap-3 p-4">
                  <BadgeCheck className="h-9 w-9 rounded-md bg-emerald-100 p-2 text-emerald-700" />
                  <div>
                    <div className="text-sm text-slate-500">Crop</div>
                    <div className="font-semibold capitalize">{lot.crop}{lot.variety ? ` / ${lot.variety}` : ''}</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-lg bg-white">
                <CardContent className="flex items-center gap-3 p-4">
                  <MapPin className="h-9 w-9 rounded-md bg-sky-100 p-2 text-sky-700" />
                  <div>
                    <div className="text-sm text-slate-500">Quantity</div>
                    <div className="font-semibold">{lot.current_quantity} {lot.quantity_unit}</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-lg bg-white">
                <CardContent className="flex items-center gap-3 p-4">
                  <Fingerprint className="h-9 w-9 rounded-md bg-slate-100 p-2 text-slate-700" />
                  <div>
                    <div className="text-sm text-slate-500">Events</div>
                    <div className="font-semibold">{data?.events?.length ?? 0}</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-lg bg-white">
              <CardHeader className="p-4">
                <CardTitle className="text-base">Evidence Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="text-3xl font-bold">{Math.round(lot.evidence_score ?? 0)}%</div>
                <Progress value={lot.evidence_score ?? 0} className="h-2" />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              {diagnosticImageUrl && (
                <Card className="overflow-hidden rounded-lg bg-white">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">Farm Diagnostic Source</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <img
                      src={diagnosticImageUrl}
                      alt="Diagnostic map source"
                      className="aspect-[15/8] w-full rounded-md border object-cover"
                    />
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-lg bg-white">
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
                    <div key={key} className="rounded-md border border-slate-200 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                      <div>{readString(sellerNode, key)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-lg bg-white">
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Journey
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(data?.events ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-slate-500">No public events recorded.</div>
                ) : (
                  <div className="divide-y">
                    {(data?.events ?? []).map((event) => (
                      <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[150px_1fr]">
                        <div>
                          <div className="font-semibold capitalize">{event.event_type.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-slate-500">{formatDate(event.event_time)}</div>
                        </div>
                        <div className="min-w-0 font-mono text-xs text-slate-500">
                          <div className="truncate">{event.event_hash}</div>
                          <div className="mt-1">{event.hash_status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg bg-white">
              <CardContent className="space-y-2 p-4 text-sm text-slate-600">
                {(data?.caveats ?? [
                  'Traceability records are provided by supply-chain participants.',
                  'Satellite and AI evidence supports review but does not replace certification or lab verification.',
                ]).map((caveat) => (
                  <div key={caveat}>{caveat}</div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="rounded-lg bg-white">
            <CardContent className="p-6 text-slate-600">Passport not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default PublicPassport;
