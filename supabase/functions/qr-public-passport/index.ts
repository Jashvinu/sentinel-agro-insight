import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  createTraceSupabaseClient,
  generatePublicToken,
  loadLotBundle,
  readJson,
} from '../_shared/traceability.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createTraceSupabaseClient(req);

  try {
    if (req.method === 'GET') {
      const tokenParam = new URL(req.url).searchParams.get('token');
      if (!tokenParam) return errorResponse('token is required', 400);

      const { data: token, error: tokenError } = await supabase
        .from('qr_tokens')
        .select('*')
        .or(`token.eq.${tokenParam},public_slug.eq.${tokenParam}`)
        .eq('status', 'active')
        .maybeSingle();
      if (tokenError) throw tokenError;
      if (!token) return errorResponse('Passport not found', 404);

      const bundle = await loadLotBundle(supabase, token.lot_id);
      const { data: batches, error: batchError } = await supabase
        .from('hash_batches')
        .select('merkle_root,batch_date,event_hashes')
        .eq('organization_id', token.organization_id)
        .order('batch_date', { ascending: false })
        .limit(10);
      if (batchError) throw batchError;

      await supabase
        .from('qr_tokens')
        .update({
          scan_count: Number(token.scan_count ?? 0) + 1,
          last_scanned_at: new Date().toISOString(),
        })
        .eq('id', token.id);

      return successResponse({
        data: {
          token: {
            public_slug: token.public_slug,
            status: token.status,
          },
          lot: {
            lot_code: bundle.lot.lot_code,
            crop: bundle.lot.crop,
            variety: bundle.lot.variety,
            season: bundle.lot.season,
            current_quantity: bundle.lot.current_quantity,
            quantity_unit: bundle.lot.quantity_unit,
            compliance_status: bundle.lot.compliance_status,
            evidence_score: bundle.lot.evidence_score,
            risk_score: bundle.lot.risk_score,
          },
          events: bundle.events.map((event: Record<string, unknown>) => ({
            id: event.id,
            event_type: event.event_type,
            event_time: event.event_time,
            event_hash: event.event_hash,
            hash_status: event.hash_status,
          })),
          hash_batches: (batches ?? []).map((batch: Record<string, unknown>) => ({
            merkle_root: batch.merkle_root,
            batch_date: batch.batch_date,
          })),
          caveats: [
            'Traceability records are provided by supply-chain participants.',
            'Satellite and AI evidence supports review but does not replace certification or lab verification.',
          ],
        },
      });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const lotId = String(body.lot_id ?? '').trim();
      if (!lotId) return errorResponse('lot_id is required', 400);

      const bundle = await loadLotBundle(supabase, lotId);
      const token = generatePublicToken('wrk');
      const publicSlug = generatePublicToken('lot');

      const { data, error } = await supabase
        .from('qr_tokens')
        .insert({
          organization_id: bundle.lot.organization_id,
          lot_id: lotId,
          token,
          public_slug: publicSlug,
          status: 'active',
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;

      return successResponse({ token: data, data }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    return errorResponse('QR passport request failed', 500, error);
  }
});
