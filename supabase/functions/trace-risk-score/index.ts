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

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const supabase = createTraceSupabaseClient(req);

  try {
    const body = await readJson(req);
    const lotId = String(body.lot_id ?? '').trim();
    if (!lotId) return errorResponse('lot_id is required', 400);

    const bundle = await loadLotBundle(supabase, lotId);
    const evidence = evidenceFromEvents(bundle.events);
    const risk = calculateRisk(bundle.lot, bundle.events, evidence);
    const summary = buildComplianceSummary(bundle.lot, bundle.events, risk);

    const { data: assessment, error: assessmentError } = await supabase
      .from('compliance_assessments')
      .insert({
        organization_id: bundle.lot.organization_id,
        lot_id: lotId,
        framework: 'buyer_due_diligence',
        status: risk.status,
        score: risk.evidenceScore,
        summary: summary.headline,
        missing_requirements: risk.missingEvents,
        risk_flags: risk.flags,
        evidence_snapshot: summary,
      })
      .select('*')
      .maybeSingle();
    if (assessmentError) throw assessmentError;

    const { data: updatedLot, error: updateError } = await supabase
      .from('lots')
      .update({
        evidence_score: risk.evidenceScore,
        risk_score: risk.riskScore,
        compliance_status: risk.status,
      })
      .eq('id', lotId)
      .select('*')
      .maybeSingle();
    if (updateError) throw updateError;

    return successResponse({
      data: {
        lot: updatedLot,
        assessment,
        risk,
        summary,
      },
    });
  } catch (error) {
    return errorResponse('Trace risk score failed', 500, error);
  }
});
