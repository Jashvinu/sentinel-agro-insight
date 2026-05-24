import {
  buildDiseaseRiskTriage,
  buildFallbackAdvisory,
  buildRemoteSensingSummary,
  FALLBACK_CHUNKS,
  hashEmbedding,
  rankFallbackChunks,
  type FarmTelemetryContext,
  type RagRequest,
} from './rag-core.ts';

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = 'Values are not equal') {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const riceRequest: RagRequest = {
  question: 'What should I do with low NDVI and wet rice patches?',
  crop: 'rice',
  season: 'kharif',
  region: 'maharashtra',
  top_k: 4,
};

const wetRiceContext: FarmTelemetryContext = {
  diagnostics: {
    problems: [
      { index: 'ndvi', label: 'NDVI decline', avgDecline: -14, confidence: 'medium' },
      { index: 'nitrogen', label: 'Nitrogen sufficiency', avgValue: 42, confidence: 'medium' },
    ],
    farmStats: { totalCells: 40, problemCells: 9, healthyCells: 31, overlapCells: 3 },
  },
  latest_indices: {
    ndvi: { value: 0.18, observation_date: '2026-05-01', satellite: 'Sentinel-2' },
  },
  water_metrics: {
    ndwi: { value: 38, observation_date: '2026-05-01' },
  },
  warnings: ['Use local KVK confirmation.'],
};

Deno.test('hashEmbedding is deterministic and normalized', () => {
  const first = hashEmbedding('rice nitrogen moisture rice');
  const second = hashEmbedding('rice nitrogen moisture rice');
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

  assertEquals(first.length, 384);
  assertEquals(JSON.stringify(first), JSON.stringify(second));
  assert(Math.abs(norm - 1) < 0.000001, `Expected unit norm, got ${norm}`);
});

Deno.test('disease-risk triage treats wet rice stress as scouting risk', () => {
  const triage = buildDiseaseRiskTriage(riceRequest, wetRiceContext);

  assert(triage.some((item) => item.risk.includes('Rice blast')));
  assert(triage.every((item) => item.scout_action.toLowerCase().includes('scout') || item.scout_action.toLowerCase().includes('check')));
});

Deno.test('fallback advisory warns that satellite NPK is not lab fertilizer data', () => {
  const chunks = rankFallbackChunks(riceRequest, wetRiceContext, 4);
  const advisory = buildFallbackAdvisory(riceRequest, wetRiceContext, chunks, buildDiseaseRiskTriage(riceRequest, wetRiceContext));

  assert(advisory.answer.includes('satellite'));
  assert(advisory.priority_actions.some((action) => action.includes('soil testing')));
  assert(advisory.priority_actions.some((action) => action.includes('NPK')));
});

Deno.test('remote-sensing summary includes diagnostic and warning context', () => {
  const summary = buildRemoteSensingSummary(wetRiceContext);

  assert(summary.signals.some((signal) => signal.includes('9/40')));
  assert(summary.warnings.some((warning) => warning.includes('Satellite NPK')));
  assert(summary.warnings.some((warning) => warning.includes('KVK')));
});

Deno.test('fallback chunks cover rice and millet evidence anchors', () => {
  assert(FALLBACK_CHUNKS.some((chunk) => chunk.crops.includes('rice')));
  assert(FALLBACK_CHUNKS.some((chunk) => chunk.crops.includes('millet')));
  assert(FALLBACK_CHUNKS.some((chunk) => chunk.management_tags.includes('disease_scouting')));
});
