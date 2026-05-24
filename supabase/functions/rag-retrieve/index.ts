import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { buildCitations, type RagRequest } from '../_shared/rag-core.ts';
import { loadFarmContext } from '../_shared/farm-context.ts';
import { retrieveRagChunks } from '../_shared/rag-supabase.ts';

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

function normalizeRequest(body: Record<string, unknown>): RagRequest {
  const question = String(body.question ?? body.query ?? '').trim();
  if (!question) throw new Error('question is required');

  const crop = String(body.crop ?? 'rice').toLowerCase() === 'millet' ? 'millet' : 'rice';
  const season = String(body.season ?? 'kharif').toLowerCase() === 'rabi' ? 'rabi' : 'kharif';
  const topK = typeof body.top_k === 'number' ? body.top_k : Number(body.top_k ?? 8);

  return {
    question,
    crop,
    season,
    farm_id: typeof body.farm_id === 'string' ? body.farm_id : undefined,
    geometry: body.geometry,
    diagnostic_result: (body.diagnostic_result as RagRequest['diagnostic_result']) ?? null,
    region: typeof body.region === 'string' ? body.region : 'maharashtra',
    constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : [],
    top_k: Number.isFinite(topK) ? topK : 8,
  };
}

function sourceCoverage(chunks: Awaited<ReturnType<typeof retrieveRagChunks>>['chunks']) {
  const sources = new Set(chunks.map((chunk) => chunk.source_id));
  const evidenceTypes = new Set(chunks.flatMap((chunk) => chunk.evidence_types));
  const signalTags = new Set(chunks.flatMap((chunk) => chunk.signal_tags));

  return {
    source_count: sources.size,
    chunk_count: chunks.length,
    evidence_types: Array.from(evidenceTypes),
    signal_tags: Array.from(signalTags).slice(0, 16),
  };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const supabase = createSupabaseClient(req);
    const request = normalizeRequest(await req.json());
    const context = await loadFarmContext(supabase, {
      farmId: request.farm_id,
      geometry: request.geometry,
      diagnosticResult: request.diagnostic_result,
    });
    const retrieval = await retrieveRagChunks(supabase, request, context);

    return successResponse({
      chunks: retrieval.chunks,
      citations: buildCitations(retrieval.chunks),
      source_coverage: sourceCoverage(retrieval.chunks),
      diagnostics: {
        retrieval_source: retrieval.source,
        retrieval_error: retrieval.error,
        top_k: request.top_k ?? 8,
        farm_context_available: Boolean(context.farm || context.diagnostics),
      },
    });
  } catch (error) {
    return errorResponse('RAG retrieval failed', 500, error);
  }
});
