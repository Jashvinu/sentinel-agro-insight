import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  TRACE_EVENT_TYPES,
  buildTraceEventHash,
  createTraceSupabaseClient,
  ensureOrganization,
  readJson,
  statusFromEvent,
  type TraceEventType,
} from '../_shared/traceability.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createTraceSupabaseClient(req);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const lotId = url.searchParams.get('lot_id');
      let query = supabase
        .from('trace_events')
        .select('*, event_evidence(*)')
        .order('event_time', { ascending: false });

      if (lotId) query = query.eq('lot_id', lotId);

      const { data, error } = await query;
      if (error) throw error;
      return successResponse({ events: data ?? [], data: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const eventType = String(body.event_type ?? '') as TraceEventType;
      if (!TRACE_EVENT_TYPES.includes(eventType)) return errorResponse('Unsupported event_type', 400);

      const lotId = typeof body.lot_id === 'string' && body.lot_id ? body.lot_id : null;
      let organizationId = typeof body.organization_id === 'string' ? body.organization_id : undefined;
      let lot: Record<string, unknown> | null = null;

      if (lotId) {
        const { data: lotData, error: lotError } = await supabase
          .from('lots')
          .select('*')
          .eq('id', lotId)
          .maybeSingle();
        if (lotError) throw lotError;
        lot = lotData;
        organizationId = organizationId ?? lotData?.organization_id;
      }

      const resolvedOrgId = await ensureOrganization(supabase, organizationId);

      const { data: previousEvent, error: previousError } = lotId
        ? await supabase
          .from('trace_events')
          .select('event_hash')
          .eq('lot_id', lotId)
          .order('event_time', { ascending: false })
          .limit(1)
          .maybeSingle()
        : { data: null, error: null };
      if (previousError) throw previousError;

      const eventTime = String(body.event_time ?? new Date().toISOString());
      const hashInput = {
        organization_id: resolvedOrgId,
        event_type: eventType,
        event_time: eventTime,
        actor_id: body.actor_id ?? null,
        farm_id: body.farm_id ?? null,
        plot_id: body.plot_id ?? null,
        crop_cycle_id: body.crop_cycle_id ?? lot?.crop_cycle_id ?? null,
        lot_id: lotId,
        location_json: body.location_json ?? null,
        quantity_in: body.quantity_in ?? null,
        quantity_out: body.quantity_out ?? null,
        quantity_unit: body.quantity_unit ?? lot?.quantity_unit ?? null,
        cte_type: body.cte_type ?? eventType,
        kde_payload: body.kde_payload ?? {},
        confidence_score: Number(body.confidence_score ?? 70),
        previous_event_hash: previousEvent?.event_hash ?? null,
      };
      const eventHash = await buildTraceEventHash(hashInput);

      const { data: inserted, error: insertError } = await supabase
        .from('trace_events')
        .insert({
          ...hashInput,
          event_hash: eventHash,
          notes: body.notes ?? null,
          source_system: 'wrkfarm',
        })
        .select('*')
        .maybeSingle();
      if (insertError) throw insertError;

      const evidence = Array.isArray(body.evidence) ? body.evidence : [];
      if (inserted?.id && evidence.length > 0) {
        const evidenceRows = evidence
          .filter((item) => item && typeof item === 'object')
          .map((item: Record<string, unknown>) => ({
            organization_id: resolvedOrgId,
            trace_event_id: inserted.id,
            evidence_type: item.evidence_type ?? 'other',
            source_kind: item.source_kind ?? 'manual',
            title: item.title ?? 'Evidence',
            uri: item.uri || null,
            storage_path: item.storage_path || null,
            metadata: item.metadata ?? {},
            extracted_fields: item.extracted_fields ?? {},
            confidence_score: Number(item.confidence_score ?? hashInput.confidence_score),
          }));

        if (evidenceRows.length > 0) {
          const { error: evidenceError } = await supabase.from('event_evidence').insert(evidenceRows);
          if (evidenceError) throw evidenceError;
        }
      }

      if (lotId) {
        const nextStatus = statusFromEvent(eventType);
        const quantityOut = body.quantity_out !== undefined ? Number(body.quantity_out) : null;
        const update: Record<string, unknown> = {};
        if (nextStatus) update.status = nextStatus;
        if (Number.isFinite(quantityOut) && quantityOut !== null && quantityOut > 0) {
          update.current_quantity = quantityOut;
        }
        if (Object.keys(update).length > 0) {
          await supabase.from('lots').update(update).eq('id', lotId);
        }
      }

      const { data: hydrated, error: hydrateError } = await supabase
        .from('trace_events')
        .select('*, event_evidence(*)')
        .eq('id', inserted.id)
        .maybeSingle();
      if (hydrateError) throw hydrateError;

      return successResponse({ event: hydrated, data: hydrated }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    return errorResponse('Trace events request failed', 500, error);
  }
});
