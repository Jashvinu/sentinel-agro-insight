import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { buildRemoteSensingSummary } from '../_shared/rag-core.ts';
import { loadFarmContext } from '../_shared/farm-context.ts';

function createSupabaseClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !key) {
    throw new Error('Supabase URL/key environment variables are not configured');
  }

  return createClient(url, key, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? `Bearer ${key}`,
      },
    },
  });
}

async function readInput(req: Request): Promise<Record<string, unknown>> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const geometryText = url.searchParams.get('geometry');
    return {
      farm_id: url.searchParams.get('farm_id') ?? undefined,
      geometry: geometryText ? JSON.parse(geometryText) : undefined,
    };
  }

  if (req.method === 'POST') {
    return await req.json();
  }

  throw new Error('Method not allowed');
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const input = await readInput(req);
    const supabase = createSupabaseClient(req);
    const context = await loadFarmContext(supabase, {
      farmId: typeof input.farm_id === 'string' ? input.farm_id : undefined,
      geometry: input.geometry,
      diagnosticResult: (input.diagnostic_result as any) ?? null,
    });

    return successResponse({
      context,
      remote_sensing_summary: buildRemoteSensingSummary(context),
    });
  } catch (error) {
    return errorResponse('Farm context lookup failed', 500, error);
  }
});
