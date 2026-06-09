import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';

import { Navigation } from '@/components/layout/navigation/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import { getTraceReport } from '@/services/traceabilityService';
import type { TraceReport } from '@/services/traceabilityTypes';

function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not recorded';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

const TraceReportDetail: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('traceability');
  const [report, setReport] = useState<TraceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { reportId } = useParams();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!reportId) return;
      setLoading(true);
      try {
        const data = await getTraceReport(reportId);
        if (!cancelled) setReport(data);
      } catch (error) {
        toast({
          title: 'Report unavailable',
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
  }, [reportId, toast]);

  const sections = report ? Object.entries(report.report_json ?? {}) : [];

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <Link to={report?.lot_id ? `/traceability/lots/${report.lot_id}` : '/traceability'}>
            <Button variant="outline" size="sm" className="h-10 w-10 p-0" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{report?.title ?? 'Traceability Report'}</h1>
            {report && (
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">{report.report_type.replace(/_/g, ' ')}</Badge>
                <Badge variant="outline">{report.status}</Badge>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <Card className="rounded-lg">
            <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading report...
            </CardContent>
          </Card>
        ) : report ? (
          <div className="space-y-3">
            {sections.map(([key, value]) => (
              <Card key={key} className="rounded-lg">
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-base capitalize">
                    <FileText className="h-4 w-4 text-slate-700" />
                    {key.replace(/_/g, ' ')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                    {formatJsonValue(value)}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-lg border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">Report not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TraceReportDetail;
