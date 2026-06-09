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
  disease_management?: {
    confirmed_disease?: string;
    urgency?: string;
    action_steps?: string[];
    spray_window?: string;
    variety_note?: string;
    do_not?: string[];
  };
  followups?: string[];
};

// Qwen3 via DashScope (OpenAI-compatible)
const QWEN_MODELS = ['qwen3-235b-a22b', 'qwen3-72b', 'qwen3-32b'];

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

/**
 * Call Qwen3-235B via DashScope (OpenAI-compatible API).
 * Qwen3 supports /think mode for step-by-step reasoning — we disable it for
 * JSON output to keep latency low.
 */
async function callQwen3(prompt: string, vlmDiagnosis?: Record<string, unknown> | null): Promise<{ advisory: GeminiAdvisory | null; model?: string; error?: string }> {
  const apiKey  = Deno.env.get('QWEN_API_KEY') ?? Deno.env.get('QWEN3_API_KEY');
  const baseUrl = Deno.env.get('QWEN_BASE_URL') ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  if (!apiKey) return { advisory: null, error: 'QWEN_API_KEY not configured' };

  // Inject confirmed VLM diagnosis block if available
  let fullPrompt = prompt;
  if (vlmDiagnosis?.confirmed_diagnosis && vlmDiagnosis.confirmed_diagnosis !== 'uncertain') {
    const vd = vlmDiagnosis;
    const diagBlock = [
      '\nCONFIRMED FIELD DIAGNOSIS (Qwen-VL photo analysis):',
      `  Disease: ${vd.confirmed_diagnosis} (confidence: ${((Number(vd.confidence ?? 0)) * 100).toFixed(0)}%)`,
      `  Severity: ${vd.severity_pct ?? 'unknown'}% leaf area affected`,
      `  Visual evidence: ${(vd.visual_evidence as string[] ?? []).join(', ')}`,
      `  Safe to spray now: ${vd.safe_to_spray ?? 'unknown'}`,
      vd.requires_lab_confirmation ? '  ⚠ Lab/extension confirmation recommended before chemical treatment.' : '',
    ].filter(Boolean).join('\n');
    fullPrompt += diagBlock;
  }

  // Append JSON schema expectation
  fullPrompt += '\n\nReturn ONLY valid JSON with keys: answer, priority_actions, disease_management, disease_risk_triage, followups.';
  if (vlmDiagnosis?.confirmed_diagnosis && vlmDiagnosis.confirmed_diagnosis !== 'uncertain') {
    fullPrompt += '\nInclude disease_management object with: confirmed_disease, urgency (immediate|this_week|monitor), action_steps[], spray_window, variety_note, do_not[].';
    if (!vlmDiagnosis.safe_to_spray) {
      fullPrompt += '\nSince safe_to_spray is false/null, do NOT include spray or chemical recommendations in action_steps.';
    }
  }

  let lastError = '';
  for (const model of QWEN_MODELS) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.20,
          max_tokens: 2400,
          // Disable thinking mode for structured JSON output
          extra_body: { enable_thinking: false },
          response_format: { type: 'json_object' },
        }),
      });

      if (!resp.ok) {
        lastError = `${model}: ${resp.status} ${await resp.text()}`;
        if (resp.status === 404) continue;
        break;
      }

      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      const parsed = safeJsonParse<GeminiAdvisory>(typeof text === 'string' ? text : JSON.stringify(text));
      if (parsed?.answer) return { advisory: parsed, model: `qwen/${model}` };
      lastError = `${model}: response missing 'answer' key`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { advisory: null, error: lastError || 'Qwen3 request failed' };
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
    const body = await req.json();
    const request = normalizeRequest(body);
    const supabase = createSupabaseClient(req);
    const context = await loadFarmContext(supabase, {
      farmId: request.farm_id,
      geometry: request.geometry,
      diagnosticResult: request.diagnostic_result,
    });
    const vlmDiagnosis = (body.vlm_diagnosis as Record<string, unknown> | null | undefined) ?? null;
    const retrieval = await retrieveRagChunks(supabase, request, context);
    const diseaseRisk = buildDiseaseRiskTriage(request, context);
    const remoteSensingSummary = buildRemoteSensingSummary(context);
    const citations = buildCitations(retrieval.chunks);
    const fallback = buildFallbackAdvisory(request, context, retrieval.chunks, diseaseRisk);
    const geminiPrompt = buildGeminiPrompt(request, context, retrieval.chunks, diseaseRisk);

    // Qwen3 is primary; Gemini is fallback
    let advisoryResult = await callQwen3(geminiPrompt, vlmDiagnosis);
    if (!advisoryResult.advisory) {
      advisoryResult = await callGemini(geminiPrompt);
    }

    const generated = advisoryResult.advisory;
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
        provider: advisoryResult.model ?? 'fallback',
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
      disease_management: generated?.disease_management ?? null,
      vlm_diagnosis_used: Boolean(vlmDiagnosis?.confirmed_diagnosis),
      diagnostics: {
        retrieval_source: retrieval.source,
        retrieval_error: retrieval.error,
        ai_model: advisoryResult.model,
        ai_error: advisoryResult.error,
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
