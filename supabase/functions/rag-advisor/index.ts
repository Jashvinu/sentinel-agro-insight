import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  buildCitations,
  buildDiseaseRiskTriage,
  buildFallbackAdvisory,
  buildFollowups,
  buildGeminiPrompt,
  buildRemoteSensingSummary,
  confidenceFromEvidence,
  safeJsonParse,
  type DiseaseRiskItem,
  type RagRequest,
} from '../_shared/rag-core.ts';
import { loadFarmContext } from '../_shared/farm-context.ts';
import { retrieveRagChunks } from '../_shared/rag-supabase.ts';

type GeminiAdvisory = {
  answer?: string;
  priority_actions?: string[];
  disease_risk_triage?: DiseaseRiskItem[] | string[];
  followups?: string[];
};

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const DEFAULT_GEMINI_VERSIONS = ['v1beta', 'v1'];

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

function splitEnvList(name: string, fallback: string[]) {
  const value = Deno.env.get(name)?.trim();
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function normalizeRequest(body: Record<string, unknown>): RagRequest {
  const question = String(body.question ?? '').trim();
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return String((item as Record<string, unknown>).action ?? (item as Record<string, unknown>).risk ?? JSON.stringify(item));
    return String(item);
  }).filter(Boolean);
}

function uuidOrNull(value: string | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function callGemini(prompt: string): Promise<{ advisory: GeminiAdvisory | null; model?: string; error?: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!apiKey) return { advisory: null, error: 'GEMINI_API_KEY is not configured' };

  const models = splitEnvList('GEMINI_MODELS', DEFAULT_GEMINI_MODELS);
  const versions = splitEnvList('GEMINI_API_VERSIONS', DEFAULT_GEMINI_VERSIONS);
  let lastError = '';

  for (const version of versions) {
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 1800,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!response.ok) {
          lastError = `${model} ${version}: ${response.status} ${await response.text()}`;
          continue;
        }

        const data = await response.json();
        const text = (data.candidates?.[0]?.content?.parts ?? [])
          .map((part: { text?: string }) => part.text ?? '')
          .join('\n')
          .trim();
        const parsed = safeJsonParse<GeminiAdvisory>(text);
        if (parsed?.answer) {
          return { advisory: parsed, model: `${model}/${version}` };
        }
        lastError = `${model} ${version}: response was not valid advisory JSON`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  return { advisory: null, error: lastError || 'Gemini request failed' };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const request = normalizeRequest(await req.json());
    const supabase = createSupabaseClient(req);
    const context = await loadFarmContext(supabase, {
      farmId: request.farm_id,
      geometry: request.geometry,
      diagnosticResult: request.diagnostic_result,
    });
    const retrieval = await retrieveRagChunks(supabase, request, context);
    const diseaseRisk = buildDiseaseRiskTriage(request, context);
    const remoteSensingSummary = buildRemoteSensingSummary(context);
    const citations = buildCitations(retrieval.chunks);
    const fallback = buildFallbackAdvisory(request, context, retrieval.chunks, diseaseRisk);
    const gemini = await callGemini(buildGeminiPrompt(request, context, retrieval.chunks, diseaseRisk));
    const generated = gemini.advisory;
    const priorityActions = normalizeStringArray(generated?.priority_actions);
    const followups = normalizeStringArray(generated?.followups);
    const answer = generated?.answer?.trim() || fallback.answer;
    const usedFallback = !generated?.answer;

    const { data: auditRow, error: auditError } = await supabase
      .from('rag_advisory_runs')
      .insert({
        farm_id: uuidOrNull(request.farm_id),
        crop: request.crop,
        season: request.season,
        question: request.question,
        remote_sensing_summary: remoteSensingSummary,
        disease_risk_triage: diseaseRisk,
        citations,
        provider: gemini.model ?? 'fallback',
        used_fallback: usedFallback,
      })
      .select('id')
      .maybeSingle();

    return successResponse({
      advisory_run_id: auditRow?.id ?? null,
      answer,
      priority_actions: priorityActions.length > 0 ? priorityActions : fallback.priority_actions,
      disease_risk_triage: diseaseRisk,
      remote_sensing_summary: remoteSensingSummary,
      citations,
      confidence: confidenceFromEvidence(retrieval.chunks, context),
      followups: followups.length > 0 ? followups : (fallback.followups.length > 0 ? fallback.followups : buildFollowups(request, context)),
      diagnostics: {
        retrieval_source: retrieval.source,
        retrieval_error: retrieval.error,
        gemini_model: gemini.model,
        gemini_error: gemini.error,
        audit_error: auditError?.message,
        used_fallback: usedFallback,
        chunk_count: retrieval.chunks.length,
        farm_context_available: Boolean(context.farm || context.diagnostics),
      },
    });
  } catch (error) {
    return errorResponse('RAG advisory failed', 500, error);
  }
});
