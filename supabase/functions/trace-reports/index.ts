import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  buildComplianceSummary,
  calculateRisk,
  createTraceSupabaseClient,
  evidenceFromEvents,
  loadLotBundle,
  readJson,
} from '../_shared/traceability.ts';

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCteKdeCsv(events: Record<string, unknown>[]): string {
  const headers = ['event_type', 'event_time', 'cte_type', 'quantity_in', 'quantity_out', 'quantity_unit', 'event_hash', 'hash_status'];
  const rows = events.map((event) => headers.map((header) => csvEscape(event[header])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function buildBuyerMarkdown(lot: Record<string, unknown>, compliance: Record<string, unknown>): string {
  return [
    `# Buyer Audit - ${lot.lot_code}`,
    '',
    `Crop: ${lot.crop}`,
    `Quantity: ${lot.current_quantity} ${lot.quantity_unit}`,
    `Status: ${compliance.status}`,
    `Evidence score: ${compliance.evidence_score}`,
    `Risk score: ${compliance.risk_score}`,
    '',
    'Claims remain audit-supporting evidence unless a certification document is attached.',
  ].join('\n');
}

function buildReportJson(bundle: Awaited<ReturnType<typeof loadLotBundle>>, reportType: string) {
  const evidence = evidenceFromEvents(bundle.events);
  const risk = calculateRisk(bundle.lot, bundle.events, evidence);
  const compliance = buildComplianceSummary(bundle.lot, bundle.events, risk);
  const cteRows = bundle.events.map((event: Record<string, unknown>) => ({
    event_type: event.event_type,
    event_time: event.event_time,
    cte_type: event.cte_type,
    kde_payload: event.kde_payload,
    quantity_in: event.quantity_in,
    quantity_out: event.quantity_out,
    quantity_unit: event.quantity_unit,
    event_hash: event.event_hash,
    hash_status: event.hash_status,
    evidence_count: Array.isArray(event.event_evidence) ? event.event_evidence.length : 0,
  }));

  return {
    report_type: reportType,
    generated_at: new Date().toISOString(),
    lot: {
      id: bundle.lot.id,
      lot_code: bundle.lot.lot_code,
      crop: bundle.lot.crop,
      variety: bundle.lot.variety,
      season: bundle.lot.season,
      quantity: bundle.lot.current_quantity,
      quantity_unit: bundle.lot.quantity_unit,
      status: bundle.lot.status,
    },
    compliance,
    cte_kde_events: cteRows,
    evidence: evidence.map((item: Record<string, unknown>) => ({
      evidence_type: item.evidence_type,
      title: item.title,
      uri: item.uri,
      confidence_score: item.confidence_score,
    })),
    hash_verification: {
      event_hashes: bundle.events.map((event: Record<string, unknown>) => event.event_hash).filter(Boolean),
      pending_events: bundle.events.filter((event: Record<string, unknown>) => event.hash_status === 'pending').length,
    },
    exports: {
      cte_kde_csv: buildCteKdeCsv(cteRows),
      buyer_audit_markdown: buildBuyerMarkdown(bundle.lot, compliance),
    },
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createTraceSupabaseClient(req);

  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return errorResponse('id is required', 400);

      const { data, error } = await supabase
        .from('compliance_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse('Report not found', 404);
      return successResponse({ report: data, data });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const lotId = String(body.lot_id ?? '').trim();
      const reportType = String(body.report_type ?? 'buyer_audit');
      if (!lotId) return errorResponse('lot_id is required', 400);

      const bundle = await loadLotBundle(supabase, lotId);
      const reportJson = buildReportJson(bundle, reportType);
      const title = `${bundle.lot.lot_code} ${reportType.replace(/_/g, ' ')}`;

      const { data, error } = await supabase
        .from('compliance_reports')
        .insert({
          organization_id: bundle.lot.organization_id,
          lot_id: lotId,
          report_type: reportType,
          title,
          report_json: reportJson,
          status: 'generated',
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;

      return successResponse({ report: data, data }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    return errorResponse('Trace reports request failed', 500, error);
  }
});
