import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  buildMerkleRoot,
  createTraceSupabaseClient,
  ensureOrganization,
  readJson,
} from '../_shared/traceability.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createTraceSupabaseClient(req);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const organizationId = url.searchParams.get('organization_id') ?? undefined;
      let query = supabase
        .from('hash_batches')
        .select('*')
        .order('batch_date', { ascending: false })
        .limit(30);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error) throw error;
      return successResponse({ data: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const organizationId = await ensureOrganization(supabase, typeof body.organization_id === 'string' ? body.organization_id : undefined);
      const batchDate = String(body.batch_date ?? new Date().toISOString().slice(0, 10));
      const start = `${batchDate}T00:00:00.000Z`;
      const end = `${batchDate}T23:59:59.999Z`;

      const { data: events, error: eventsError } = await supabase
        .from('trace_events')
        .select('id,event_hash')
        .eq('organization_id', organizationId)
        .gte('event_time', start)
        .lte('event_time', end)
        .order('event_hash', { ascending: true });
      if (eventsError) throw eventsError;

      const eventHashes = (events ?? []).map((event: Record<string, string>) => event.event_hash).filter(Boolean);
      if (eventHashes.length === 0) {
        return errorResponse('No events found for the requested batch date', 400);
      }

      const merkleRoot = await buildMerkleRoot(eventHashes);
      const { data: batch, error: batchError } = await supabase
        .from('hash_batches')
        .upsert({
          organization_id: organizationId,
          batch_date: batchDate,
          event_count: eventHashes.length,
          merkle_root: merkleRoot,
          algorithm: 'sha256-merkle-v1',
          event_hashes: eventHashes,
          polygon_tx_hash: null,
        }, { onConflict: 'organization_id,batch_date' })
        .select('*')
        .maybeSingle();
      if (batchError) throw batchError;

      const eventIds = (events ?? []).map((event: Record<string, string>) => event.id).filter(Boolean);
      if (eventIds.length > 0) {
        const { error: updateError } = await supabase
          .from('trace_events')
          .update({ hash_status: 'batched' })
          .in('id', eventIds);
        if (updateError) throw updateError;
      }

      return successResponse({ batch, data: batch }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    return errorResponse('Trace hash batch request failed', 500, error);
  }
});
