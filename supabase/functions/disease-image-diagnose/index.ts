/**
 * disease-image-diagnose
 *
 * Stage 4: Qwen-VL vision model diagnoses disease from a farmer photo.
 * Reads a photo from Supabase Storage, calls Qwen-VL via DashScope (OpenAI-compat API),
 * and writes the structured diagnosis back to farmer_photo_submissions.
 *
 * POST /disease-image-diagnose
 * Body: {
 *   submission_id: string,   // farmer_photo_submissions.id
 *   farm_id?: string,
 *   // OR direct invocation:
 *   storage_path?: string,
 *   crop?: string,
 *   growth_stage?: string,
 *   satellite_context?: object,
 * }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Qwen-VL API (DashScope OpenAI-compatible endpoint)
// Models available: qwen-vl-plus, qwen-vl-max, qwen2.5-vl-7b-instruct
// ---------------------------------------------------------------------------

const QWEN_VL_MODELS = [
  'qwen2.5-vl-7b-instruct',
  'qwen-vl-plus',
  'qwen-vl-max',
];

function buildDiagnosisPrompt(
  crop: string,
  growthStage: string,
  satelliteCtx: Record<string, unknown> | null,
): { system: string; user: string } {
  const system = [
    'You are an expert plant pathologist specializing in rice and millet diseases in Maharashtra, India.',
    'Analyze the farmer photograph provided, guided by satellite pre-screen data.',
    'RULES:',
    '- Return ONLY valid JSON — no markdown, no explanation outside JSON.',
    '- Never invent pesticide brand names, dosage rates, or regulatory claims.',
    '- Always provide a differential diagnosis — symptoms can overlap.',
    '- If the image is unclear, blurry, or shows no plant, set confirmed_diagnosis to "unclear_image".',
    '- safe_to_spray must be null if you cannot assess from the photo.',
  ].join('\n');

  const satSummary = satelliteCtx
    ? [
        `RBVI: ${satelliteCtx.rbvi ?? 'n/a'}`,
        `CIre: ${satelliteCtx.cire ?? 'n/a'}`,
        `NDVI: ${satelliteCtx.ndvi ?? 'n/a'}`,
        `Moisture: ${satelliteCtx.moisture ?? 'n/a'}%`,
        `Top risks: ${(satelliteCtx.disease_candidates as string[] ?? []).join(', ') || 'none flagged'}`,
        `Weather blast pressure: ${satelliteCtx.weather_risk ?? 'unknown'}`,
        `Composite risk score: ${satelliteCtx.composite_risk ?? 'unknown'}`,
      ].join(' | ')
    : 'No satellite context available.';

  const user = [
    `CROP: ${crop} at ${growthStage} growth stage`,
    `LOCATION: Maharashtra, India`,
    `SATELLITE PRE-SCREEN: ${satSummary}`,
    '',
    'TASK: Analyze the attached field photograph and return this exact JSON structure:',
    JSON.stringify({
      confirmed_diagnosis: '<rice_blast|sheath_blight|bacterial_leaf_blight|downy_mildew|leaf_spot|charcoal_rot|abiotic_stress|healthy|unclear_image|uncertain>',
      confidence: '<float 0.0 to 1.0>',
      severity_pct: '<integer 0 to 100 — estimated leaf area affected>',
      differential: [
        { disease: '<name>', likelihood: '<low|medium|high>', distinguishing_feature: '<what to look for>' },
      ],
      visual_evidence: ['<observed symptom 1>', '<observed symptom 2>'],
      scout_action: '<one concrete next step to confirm diagnosis in the field>',
      requires_lab_confirmation: '<true|false>',
      safe_to_spray: '<true|false|null>',
      notes: '<optional brief note about image quality or abiotic vs biotic ambiguity>',
    }, null, 2),
  ].join('\n');

  return { system, user };
}

async function callQwenVL(
  imageBase64: string,
  mimeType: string,
  crop: string,
  growthStage: string,
  satelliteCtx: Record<string, unknown> | null,
): Promise<{ result: Record<string, unknown> | null; model?: string; error?: string }> {
  const apiKey   = Deno.env.get('QWEN_API_KEY') ?? Deno.env.get('QWEN3_API_KEY');
  const baseUrl  = Deno.env.get('QWEN_BASE_URL') ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

  if (!apiKey) return { result: null, error: 'QWEN_API_KEY not configured' };

  const { system, user } = buildDiagnosisPrompt(crop, growthStage, satelliteCtx);

  for (const model of QWEN_VL_MODELS) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                },
                { type: 'text', text: user },
              ],
            },
          ],
          temperature: 0.15,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        // 404 = model not available on this tier → try next
        if (response.status === 404 || response.status === 400) continue;
        return { result: null, error: `${model}: ${response.status} ${errText}` };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content ?? '';

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = typeof text === 'string' ? JSON.parse(text) : text;
      } catch {
        parsed = null;
      }

      if (parsed && parsed.confirmed_diagnosis) {
        return { result: parsed, model };
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // network errors — try next model
      if (msg.includes('fetch')) continue;
      return { result: null, error: msg };
    }
  }

  return { result: null, error: 'All Qwen-VL models exhausted or unavailable' };
}

/** Fallback: rule-based diagnosis from satellite context when VLM is unavailable */
function fallbackDiagnosis(
  satelliteCtx: Record<string, unknown> | null,
  crop: string,
): Record<string, unknown> {
  const candidates = (satelliteCtx?.disease_candidates as string[]) ?? [];
  const risk = (satelliteCtx?.composite_risk as number) ?? 0;
  const topDisease = candidates[0] ?? (crop === 'rice' ? 'rice_blast' : 'downy_mildew');

  return {
    confirmed_diagnosis: 'uncertain',
    confidence: 0,
    severity_pct: null,
    differential: candidates.slice(0, 3).map((d: string) => ({
      disease: d,
      likelihood: 'medium',
      distinguishing_feature: 'Satellite pre-screen only — field confirmation required',
    })),
    visual_evidence: [],
    scout_action: `Satellite flags ${topDisease} risk (score ${risk.toFixed(2)}). Walk to this zone and inspect ${crop === 'rice' ? 'leaves for diamond-shaped lesions (blast), water-soaking (BLB), or stem sheath browning' : 'whorls and leaves for white downy growth, lesions, or streaking'}.`,
    requires_lab_confirmation: true,
    safe_to_spray: null,
    notes: 'Vision model unavailable — diagnosis based on satellite signals only.',
  };
}

function createSupabaseClient(req: Request) {
  const url  = Deno.env.get('SUPABASE_URL');
  const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? `Bearer ${key}` } },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const supabase = createSupabaseClient(req);

    let storagePath: string | null = null;
    let crop        = 'rice';
    let growthStage = 'tillering';
    let satelliteCtx: Record<string, unknown> | null = null;
    let submissionId: string | null = null;
    let scoutZoneId: string | null  = null;

    // Resolve submission record
    if (body.submission_id) {
      const { data: sub } = await supabase
        .from('farmer_photo_submissions')
        .select('*')
        .eq('id', body.submission_id)
        .maybeSingle();

      if (!sub) return errorResponse('submission not found', 404);
      storagePath  = sub.storage_path;
      crop         = sub.crop ?? 'rice';
      growthStage  = sub.growth_stage ?? 'tillering';
      satelliteCtx = sub.satellite_context ?? null;
      submissionId = sub.id;
      scoutZoneId  = sub.scout_zone_id ?? null;
    } else {
      storagePath  = body.storage_path ?? null;
      crop         = String(body.crop ?? 'rice');
      growthStage  = String(body.growth_stage ?? 'tillering');
      satelliteCtx = body.satellite_context ?? null;
    }

    if (!storagePath) return errorResponse('storage_path required', 400);

    // Download photo from Supabase Storage
    const bucketName = storagePath.startsWith('disease-photos/') ? 'disease-photos' : 'disease-photos';
    const objectPath = storagePath.replace(/^disease-photos\//, '');

    const { data: fileData, error: storageError } = await supabase.storage
      .from(bucketName)
      .download(objectPath);

    let imageBase64 = '';
    let mimeType    = 'image/jpeg';

    if (storageError || !fileData) {
      // If storage download fails, still attempt fallback diagnosis
      const diagnosis = fallbackDiagnosis(satelliteCtx, crop);
      if (submissionId) {
        await supabase.from('farmer_photo_submissions')
          .update({ diagnosis_result: diagnosis, diagnosis_model: 'fallback', diagnosis_at: new Date().toISOString() })
          .eq('id', submissionId);
      }
      return successResponse({ diagnosis, model: 'fallback', submission_id: submissionId });
    }

    // Convert Blob to base64
    const buffer = await fileData.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    imageBase64  = btoa(String.fromCharCode(...bytes));
    mimeType     = fileData.type || 'image/jpeg';

    // Call Qwen-VL
    const { result, model, error: vlmError } = await callQwenVL(
      imageBase64,
      mimeType,
      crop,
      growthStage,
      satelliteCtx,
    );

    const diagnosis = result ?? fallbackDiagnosis(satelliteCtx, crop);
    const usedModel = model ?? 'fallback';

    // Write back to DB
    if (submissionId) {
      await supabase.from('farmer_photo_submissions')
        .update({
          diagnosis_result: diagnosis,
          diagnosis_model:  usedModel,
          diagnosis_at:     new Date().toISOString(),
        })
        .eq('id', submissionId);

      // Update scout zone status if high-confidence confirmed diagnosis
      const confidence = Number(diagnosis.confirmed_diagnosis !== 'uncertain' && diagnosis.confirmed_diagnosis !== 'unclear_image'
        ? (diagnosis.confidence ?? 0)
        : 0);

      if (scoutZoneId && confidence >= 0.65) {
        await supabase.from('disease_scout_zones')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', scoutZoneId);
      } else if (scoutZoneId) {
        await supabase.from('disease_scout_zones')
          .update({ status: 'scouted', updated_at: new Date().toISOString() })
          .eq('id', scoutZoneId);
      }
    }

    return successResponse({
      diagnosis,
      model: usedModel,
      submission_id: submissionId,
      vlm_error: vlmError ?? null,
    });

  } catch (err) {
    return errorResponse('disease-image-diagnose failed', 500, err);
  }
});
