import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  createTraceSupabaseClient,
  ensureOrganization,
  generateLotCode,
  loadLotBundle,
  readJson,
} from '../_shared/traceability.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createTraceSupabaseClient(req);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');

      if (id) {
        const bundle = await loadLotBundle(supabase, id);
        return successResponse({ data: bundle, ...bundle });
      }

      const organizationId = url.searchParams.get('organization_id') ?? undefined;
      let query = supabase
        .from('lots')
        .select('*')
        .order('created_at', { ascending: false });

      if (organizationId) query = query.eq('organization_id', organizationId);

      const { data, error } = await query;
      if (error) throw error;
      return successResponse({ lots: data ?? [], data: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const crop = String(body.crop ?? '').trim();
      const quantity = Number(body.initial_quantity ?? 0);
      const quantityUnit = String(body.quantity_unit ?? 'kg').trim() || 'kg';

      if (!crop) return errorResponse('crop is required', 400);
      if (!Number.isFinite(quantity) || quantity < 0) return errorResponse('initial_quantity must be a non-negative number', 400);

      const organizationId = await ensureOrganization(supabase, typeof body.organization_id === 'string' ? body.organization_id : undefined);
      const lotCode = String(body.lot_code ?? '').trim() || generateLotCode(crop);

      const { data, error } = await supabase
        .from('lots')
        .insert({
          organization_id: organizationId,
          crop_cycle_id: body.crop_cycle_id || null,
          lot_code: lotCode,
          crop,
          variety: body.variety || null,
          season: body.season || null,
          production_area_hectares: body.production_area_hectares ?? null,
          initial_quantity: quantity,
          current_quantity: quantity,
          quantity_unit: quantityUnit,
          owner_actor_id: body.owner_actor_id || null,
          metadata: body.metadata ?? {},
        })
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return successResponse({ lot: data, data }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    return errorResponse('Trace lots request failed', 500, error);
  }
});
