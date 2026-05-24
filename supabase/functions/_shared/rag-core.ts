export type AdvisoryCrop = 'rice' | 'millet';
export type AdvisorySeason = 'kharif' | 'rabi';
export type Confidence = 'low' | 'medium' | 'high';

export interface RagRequest {
  question: string;
  crop: AdvisoryCrop;
  season: AdvisorySeason;
  farm_id?: string;
  geometry?: unknown;
  diagnostic_result?: DiagnosticLike | null;
  region?: string;
  constraints?: string[];
  top_k?: number;
}

export interface RagChunk {
  id: string;
  source_id: string;
  source_title: string;
  publisher: string;
  url: string;
  title: string;
  content: string;
  crops: string[];
  seasons: string[];
  regions: string[];
  evidence_types: string[];
  signal_tags: string[];
  disease_tags: string[];
  management_tags: string[];
  semantic_score?: number;
  keyword_score?: number;
  score: number;
}

export interface Citation {
  source_id: string;
  title: string;
  publisher: string;
  url: string;
  chunk_id: string;
  evidence_types: string[];
  quote: string;
  score: number;
}

export interface DiagnosticProblemLike {
  index?: string;
  label?: string;
  type?: string;
  cellCount?: number;
  avgValue?: number;
  avgDecline?: number;
  avgDeclineUnit?: string;
  confidence?: Confidence;
}

export interface DiagnosticLike {
  problems?: DiagnosticProblemLike[];
  farmStats?: {
    totalCells?: number;
    problemCells?: number;
    healthyCells?: number;
    overlapCells?: number;
  };
  imagesAnalyzed?: number;
  cloudCover?: number | null;
  nutrientModel?: {
    version?: string;
    unit?: string;
    confidenceByIndex?: Record<string, Confidence>;
  };
  cached?: boolean;
  expiresAt?: string;
}

export interface FarmTelemetryContext {
  farm?: {
    id?: string;
    name?: string;
    area_hectares?: number | null;
    geometry?: unknown;
    bounds?: unknown;
  } | null;
  diagnostics?: DiagnosticLike | null;
  latest_indices?: Record<string, {
    value: number;
    observation_date?: string;
    satellite?: string;
    cloud_cover?: number | null;
  }>;
  water_metrics?: Record<string, {
    value: number;
    observation_date?: string;
  }>;
  advanced_monitoring?: Record<string, {
    value: number;
    window_start_date?: string;
    window_end_date?: string;
  }>;
  weather_summary?: {
    summary: string;
    tags: string[];
  } | null;
  warnings?: string[];
}

export interface DiseaseRiskItem {
  risk: string;
  severity: Confidence;
  why: string;
  scout_action: string;
}

export interface RemoteSensingSummary {
  headline: string;
  signals: string[];
  warnings: string[];
}

export const FALLBACK_CHUNKS: RagChunk[] = [
  {
    id: 'fallback-maharashtra-nutrients',
    source_id: 'icar-maharashtra-soils',
    source_title: 'Maharashtra agricultural profile',
    publisher: 'ICAR',
    url: 'https://www.icar.gov.in/index.php/en/node/17272',
    title: 'Satellite nutrient stress needs soil-test confirmation',
    content:
      'Maharashtra farms are often rainfall-dependent and can have shallow soils with nitrogen, phosphorus, zinc, and sulphur constraints. Treat satellite NPK as zone-finding sufficiency signal, scout low-score areas, check moisture first, and confirm fertilizer changes with soil testing and local KVK guidance.',
    crops: ['all'],
    seasons: ['kharif', 'rabi'],
    regions: ['maharashtra', 'india'],
    evidence_types: ['research', 'extension'],
    signal_tags: ['nitrogen', 'phosphorus', 'potassium', 'soil', 'remote_sensing'],
    disease_tags: [],
    management_tags: ['soil_testing', 'nutrient_management', 'scouting'],
    score: 0,
  },
  {
    id: 'fallback-weather-operations',
    source_id: 'imd-agromet-weather',
    source_title: 'Agromet advisory services',
    publisher: 'India Meteorological Department',
    url: 'https://mausam.imd.gov.in/responsive/agromet_adv_ser_block_current_en.php',
    title: 'Weather timing for fertilizer, spray, and scouting',
    content:
      'Use district weather forecasts to time fertilizer, spray, irrigation, drainage, and scouting. Avoid top dressing, pesticide, or herbicide spray before heavy rain or high wind, and prioritize worker safety during lightning or thunderstorm risk.',
    crops: ['all'],
    seasons: ['kharif', 'rabi'],
    regions: ['maharashtra', 'india'],
    evidence_types: ['weather', 'extension'],
    signal_tags: ['weather', 'rain', 'wind', 'heat', 'climate'],
    disease_tags: ['fungal_risk', 'bacterial_risk'],
    management_tags: ['weather_timing', 'worker_safety', 'spray_timing'],
    score: 0,
  },
  {
    id: 'fallback-rice-wet-disease',
    source_id: 'kvk-gondia-paddy',
    source_title: 'Paddy package of practices',
    publisher: 'KVK Hiwara, Gondia / PDKV Akola',
    url: 'https://kvkhiwra.pdkv.ac.in/?page_id=858',
    title: 'Rice disease-risk triage from wet canopy and crop-health decline',
    content:
      'Rice with persistent wet conditions, high moisture or water signals, cloudy weather, and declining NDVI or crop-health scores should be scouted for blast, bacterial leaf blight, and sheath blight. Remote sensing highlights risk zones but field symptoms and local plant-protection guidance are required before treatment.',
    crops: ['rice'],
    seasons: ['kharif'],
    regions: ['maharashtra', 'india'],
    evidence_types: ['extension'],
    signal_tags: ['moisture', 'ndvi', 'weather', 'cloud', 'rain'],
    disease_tags: ['blast_risk', 'bacterial_leaf_blight_risk', 'sheath_blight_risk'],
    management_tags: ['disease_scouting', 'ipm', 'plant_protection'],
    score: 0,
  },
  {
    id: 'fallback-millet-disease',
    source_id: 'icar-iimr-millets',
    source_title: 'ICAR-IIMR millet focus',
    publisher: 'ICAR-Indian Institute of Millets Research',
    url: 'https://www.millets.res.in/',
    title: 'Millet disease-risk triage from moisture and vegetation anomalies',
    content:
      'Millets include jowar, bajra, ragi, and small millets. Wet weather with canopy stress can raise risk of downy mildew, blast, and leaf spots, while dryness and nutrient stress can mimic disease in satellite maps. Scout leaves, stems, and root-zone moisture before plant-protection advice.',
    crops: ['millet'],
    seasons: ['kharif', 'rabi'],
    regions: ['maharashtra', 'india'],
    evidence_types: ['research', 'extension'],
    signal_tags: ['moisture', 'ndvi', 'nitrogen', 'weather', 'drought'],
    disease_tags: ['downy_mildew_risk', 'blast_risk', 'leaf_spot_risk'],
    management_tags: ['disease_scouting', 'ipm', 'differential_diagnosis'],
    score: 0,
  },
];

const TOKEN_RE = /[a-z0-9_]+/g;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

function hashToken(token: string, seed: number): number {
  let hash = 2166136261 + seed;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashEmbedding(text: string, dimensions = 384): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const bucket = hashToken(token, 0) % dimensions;
    const sign = hashToken(token, 17) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export function vectorToPg(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(8))).join(',')}]`;
}

export function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split('|').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function normalizeChunk(row: Record<string, unknown>): RagChunk {
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    source_title: String(row.source_title ?? row.title ?? 'Unknown source'),
    publisher: String(row.publisher ?? 'Unknown publisher'),
    url: String(row.url ?? ''),
    title: String(row.title ?? 'Untitled'),
    content: String(row.content ?? ''),
    crops: normalizeArray(row.crops),
    seasons: normalizeArray(row.seasons),
    regions: normalizeArray(row.regions),
    evidence_types: normalizeArray(row.evidence_types),
    signal_tags: normalizeArray(row.signal_tags),
    disease_tags: normalizeArray(row.disease_tags),
    management_tags: normalizeArray(row.management_tags),
    semantic_score: typeof row.semantic_score === 'number' ? row.semantic_score : undefined,
    keyword_score: typeof row.keyword_score === 'number' ? row.keyword_score : undefined,
    score: typeof row.score === 'number' ? row.score : 0,
  };
}

export function rankFallbackChunks(request: RagRequest, context: FarmTelemetryContext | null, limit = 8): RagChunk[] {
  const requested = new Set([
    ...tokenize(request.question),
    request.crop,
    request.season,
    ...(request.constraints ?? []).flatMap(tokenize),
    ...deriveSignalTags(context),
  ]);

  return FALLBACK_CHUNKS
    .filter((chunk) => (chunk.crops.includes('all') || chunk.crops.includes(request.crop)) && chunk.seasons.includes(request.season))
    .map((chunk) => {
      const searchable = [
        chunk.title,
        chunk.content,
        ...chunk.signal_tags,
        ...chunk.disease_tags,
        ...chunk.management_tags,
      ].join(' ');
      const matches = tokenize(searchable).filter((token) => requested.has(token)).length;
      const cropBoost = chunk.crops.includes(request.crop) ? 0.2 : 0.05;
      const seasonBoost = chunk.seasons.includes(request.season) ? 0.12 : 0;
      const score = matches / 8 + cropBoost + seasonBoost;
      return { ...chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function deriveSignalTags(context: FarmTelemetryContext | null): string[] {
  const tags = new Set<string>();
  const problems = context?.diagnostics?.problems ?? [];
  for (const problem of problems) {
    if (problem.index) tags.add(problem.index);
    if (problem.type === 'trend' || problem.type === 'both') tags.add('trend');
    if ((problem.avgDecline ?? 0) < 0) tags.add('decline');
  }

  const indices = context?.latest_indices ?? {};
  for (const [algorithm, item] of Object.entries(indices)) {
    tags.add(algorithm);
    if (algorithm === 'moisture' && item.value < 10) tags.add('drought');
    if (algorithm === 'ndvi' && item.value < 0.2) tags.add('crop-stress');
  }

  const water = context?.water_metrics ?? {};
  for (const [index, item] of Object.entries(water)) {
    tags.add(index);
    if (item.value > 35) tags.add('wet');
    if (item.value < 10) tags.add('dry');
  }

  return Array.from(tags);
}

export function buildRemoteSensingSummary(context: FarmTelemetryContext | null): RemoteSensingSummary {
  const warnings = [
    'Satellite NPK values are 0-100 sufficiency/risk signals, not laboratory fertilizer units.',
    ...(context?.warnings ?? []),
  ];
  const signals: string[] = [];
  const diagnostics = context?.diagnostics;

  if (diagnostics?.farmStats) {
    const problemCells = diagnostics.farmStats.problemCells ?? 0;
    const totalCells = diagnostics.farmStats.totalCells ?? 0;
    const overlaps = diagnostics.farmStats.overlapCells ?? 0;
    signals.push(`${problemCells}/${totalCells} diagnostic grid cells show alerts; ${overlaps} overlap multiple signals.`);
  }

  for (const problem of diagnostics?.problems ?? []) {
    const label = problem.label ?? problem.index ?? 'Signal';
    const value = typeof problem.avgValue === 'number' ? `avg ${problem.avgValue.toFixed(1)}` : 'avg unavailable';
    const trend = typeof problem.avgDecline === 'number'
      ? `trend ${problem.avgDecline.toFixed(1)} ${problem.avgDeclineUnit === 'points' ? 'points' : '%'}`
      : 'trend unavailable';
    signals.push(`${label}: ${value}, ${trend}, ${problem.confidence ?? 'unknown'} confidence.`);
  }

  for (const [algorithm, item] of Object.entries(context?.latest_indices ?? {})) {
    signals.push(`${algorithm}: latest ${item.value.toFixed(2)}${item.observation_date ? ` on ${item.observation_date}` : ''}.`);
  }

  for (const [index, item] of Object.entries(context?.water_metrics ?? {})) {
    signals.push(`${index}: water metric ${item.value.toFixed(2)}${item.observation_date ? ` on ${item.observation_date}` : ''}.`);
  }

  return {
    headline: signals.length > 0
      ? 'Remote sensing context is available and should guide zone scouting before input decisions.'
      : 'No farm telemetry was available; recommendations rely on agronomy context and should request field data.',
    signals: signals.slice(0, 8),
    warnings,
  };
}

export function buildDiseaseRiskTriage(request: RagRequest, context: FarmTelemetryContext | null): DiseaseRiskItem[] {
  const tags = new Set(deriveSignalTags(context));
  const problems = context?.diagnostics?.problems ?? [];
  const hasCropStress = tags.has('ndvi') || tags.has('crop-stress') || problems.some((problem) => problem.index === 'ndvi');
  const hasWetSignal = tags.has('wet') || tags.has('moisture') || tags.has('rain');
  const hasDrySignal = tags.has('dry') || tags.has('drought') || problems.some((problem) => problem.index === 'moisture');
  const hasNutrientStress = ['nitrogen', 'phosphorus', 'potassium'].some((tag) => tags.has(tag) || problems.some((problem) => problem.index === tag));
  const triage: DiseaseRiskItem[] = [];

  if (request.crop === 'rice' && hasWetSignal && hasCropStress) {
    triage.push({
      risk: 'Rice blast / sheath blight / bacterial leaf blight risk',
      severity: 'medium',
      why: 'Wet or cloudy conditions combined with crop-health decline can indicate disease-conducive zones.',
      scout_action: 'Scout flagged zones for lesions, leaf blast, sheath symptoms, bacterial streaking, and field drainage before recommending treatment.',
    });
  }

  if (request.crop === 'millet' && hasWetSignal && hasCropStress) {
    triage.push({
      risk: 'Millet downy mildew / blast / leaf spot risk',
      severity: 'medium',
      why: 'Moisture plus canopy stress can indicate disease risk in jowar, bajra, ragi, or small millets.',
      scout_action: 'Confirm crop species and inspect leaves, whorls, heads, and humid low-lying patches for symptoms.',
    });
  }

  if (hasDrySignal || hasNutrientStress) {
    triage.push({
      risk: 'Abiotic stress can mimic disease',
      severity: hasNutrientStress && hasDrySignal ? 'high' : 'medium',
      why: 'Low NPK sufficiency, dry moisture signals, and NDVI decline can look like disease from satellite imagery.',
      scout_action: 'Check soil moisture, root-zone constraints, nutrient symptoms, and field history before diagnosing disease.',
    });
  }

  if (triage.length === 0) {
    triage.push({
      risk: 'No strong satellite disease-risk pattern',
      severity: 'low',
      why: 'Current context does not combine canopy decline with moisture/weather signals strongly enough for disease triage.',
      scout_action: 'Maintain routine scouting and add recent weather, disease history, and field photos if symptoms appear.',
    });
  }

  return triage;
}

export function buildCitations(chunks: RagChunk[]): Citation[] {
  return chunks.map((chunk) => ({
    source_id: chunk.source_id,
    title: chunk.source_title,
    publisher: chunk.publisher,
    url: chunk.url,
    chunk_id: chunk.id,
    evidence_types: chunk.evidence_types,
    quote: compactQuote(chunk.content),
    score: Number(chunk.score.toFixed(4)),
  }));
}

export function compactQuote(text: string, maxLength = 260): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trim()}...`;
}

export function confidenceFromEvidence(chunks: RagChunk[], context: FarmTelemetryContext | null): Confidence {
  if (chunks.length >= 4 && (context?.diagnostics || context?.latest_indices) && chunks[0]?.score >= 0.45) return 'high';
  if (chunks.length >= 2) return 'medium';
  return 'low';
}

export function buildGeminiPrompt(
  request: RagRequest,
  context: FarmTelemetryContext | null,
  chunks: RagChunk[],
  diseaseRisk: DiseaseRiskItem[],
): string {
  const remote = buildRemoteSensingSummary(context);
  const contextBlock = chunks.map((chunk, index) => {
    return [
      `[${index + 1}] ${chunk.title}`,
      `Source: ${chunk.publisher} - ${chunk.url}`,
      `Evidence: ${chunk.evidence_types.join(', ')}`,
      `Text: ${chunk.content}`,
    ].join('\n');
  }).join('\n\n');

  return `
You are GrainAI, a cautious Maharashtra agronomy advisor for rice and millets.
Use only the remote-sensing context and cited agronomy chunks below.
Disease detection is satellite triage only: never claim confirmed disease without field scouting.
Do not invent pesticide names, fertilizer rates, varieties, or regulatory claims.
Mention that satellite NPK is a sufficiency/risk score, not lab kg/ha data.
Return concise JSON with keys: answer, priority_actions, disease_risk_triage, followups.

Question: ${request.question}
Crop: ${request.crop}
Season: ${request.season}
Region: ${request.region ?? 'maharashtra'}
Constraints: ${(request.constraints ?? []).join(', ') || 'none'}

Remote sensing summary:
${remote.headline}
${remote.signals.join('\n')}
Warnings:
${remote.warnings.join('\n')}

Disease risk triage:
${diseaseRisk.map((risk) => `${risk.risk}: ${risk.why} Scout action: ${risk.scout_action}`).join('\n')}

Retrieved context:
${contextBlock}
`.trim();
}

export function buildFallbackAdvisory(
  request: RagRequest,
  context: FarmTelemetryContext | null,
  chunks: RagChunk[],
  diseaseRisk: DiseaseRiskItem[],
): { answer: string; priority_actions: string[]; followups: string[] } {
  const remote = buildRemoteSensingSummary(context);
  const topChunks = chunks.slice(0, 4);
  const priorityActions = [
    'Use the diagnostic map to scout the highest-risk zones before changing inputs.',
    diseaseRisk[0]?.scout_action ?? 'Scout for field symptoms and verify with local extension guidance.',
    'Confirm NPK and pH decisions with soil testing because satellite values are sufficiency/risk signals.',
  ];
  const evidenceLines = topChunks.map((chunk, index) => `${compactQuote(chunk.content, 210)} [${index + 1}]`);
  const answer = [
    `For ${request.season} ${request.crop} in ${request.region ?? 'Maharashtra'}, GrainAI recommends a scout-first response.`,
    remote.signals.length > 0 ? `Remote sensing signals: ${remote.signals.slice(0, 3).join(' ')}` : remote.headline,
    `Disease triage: ${diseaseRisk.map((risk) => `${risk.risk} (${risk.severity})`).join('; ')}.`,
    ...evidenceLines,
    'Verify locally with the nearest KVK/agriculture officer before pesticide, fertilizer-rate, seed, or regulatory decisions.',
  ].join('\n\n');

  return {
    answer,
    priority_actions: priorityActions,
    followups: buildFollowups(request, context),
  };
}

export function buildFollowups(request: RagRequest, context: FarmTelemetryContext | null): string[] {
  const followups: string[] = [];
  if (!request.farm_id && !request.geometry) followups.push('Add a Sentinel farm ID or GeoJSON polygon for field-specific telemetry.');
  if (!context?.diagnostics) followups.push('Run Sentinel diagnostics or provide a diagnostic_result for live NPK, moisture, and NDVI context.');
  if (!request.region) followups.push('Specify district or region to narrow local KVK guidance.');
  if (request.crop === 'millet') followups.push('Identify the millet species: jowar, bajra, ragi, or small millet.');
  followups.push('Add recent rainfall, irrigation, disease history, and field photos if symptoms are present.');
  return followups.slice(0, 5);
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(value.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
