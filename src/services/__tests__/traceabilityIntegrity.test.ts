import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMerkleRoot,
  buildTraceEventHash,
  canonicalStringify,
} from '../traceabilityIntegrity';
import {
  calculateTraceabilityRisk,
  checkQuantityContinuity,
} from '../traceabilityRisk';

test('canonicalStringify is stable regardless of object key order', () => {
  const first = canonicalStringify({
    b: 2,
    a: {
      z: 'last',
      m: [3, { y: true, x: false }],
    },
  });
  const second = canonicalStringify({
    a: {
      m: [3, { x: false, y: true }],
      z: 'last',
    },
    b: 2,
  });

  assert.equal(first, second);
});

test('trace event hash is deterministic for equivalent payloads', async () => {
  const base = {
    organization_id: 'org-1',
    event_type: 'harvested',
    event_time: '2026-05-26T10:00:00.000Z',
    lot_id: 'lot-1',
    quantity_out: 120,
    quantity_unit: 'kg',
    kde_payload: {
      crop: 'sorghum',
      grade: 'A',
    },
  };

  const first = await buildTraceEventHash(base);
  const second = await buildTraceEventHash({
    kde_payload: {
      grade: 'A',
      crop: 'sorghum',
    },
    quantity_unit: 'kg',
    quantity_out: 120,
    lot_id: 'lot-1',
    event_time: '2026-05-26T10:00:00.000Z',
    event_type: 'harvested',
    organization_id: 'org-1',
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('merkle root changes when event hashes change', async () => {
  const rootA = await buildMerkleRoot(['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]);
  const rootB = await buildMerkleRoot(['a'.repeat(64), 'b'.repeat(64), 'd'.repeat(64)]);

  assert.match(rootA, /^[a-f0-9]{64}$/);
  assert.notEqual(rootA, rootB);
});

test('quantity continuity flags impossible increases', () => {
  const flags = checkQuantityContinuity(
    { crop: 'rice', initial_quantity: 100, current_quantity: 140 },
    [],
  );

  assert.ok(flags.some((flag) => flag.includes('higher than the starting quantity')));
});

test('risk scoring improves with required events and evidence', () => {
  const result = calculateTraceabilityRisk(
    {
      crop: 'millet',
      production_area_hectares: 4,
      initial_quantity: 1000,
      current_quantity: 950,
      status: 'quality_checked',
    },
    [
      { event_type: 'plot_registered', event_time: '2026-05-01T00:00:00.000Z', confidence_score: 90, event_hash: 'a', hash_status: 'batched' },
      { event_type: 'crop_planted', event_time: '2026-05-02T00:00:00.000Z', confidence_score: 90, event_hash: 'b', hash_status: 'batched' },
      { event_type: 'harvested', event_time: '2026-05-20T00:00:00.000Z', confidence_score: 90, event_hash: 'c', hash_status: 'batched' },
      { event_type: 'quality_checked', event_time: '2026-05-21T00:00:00.000Z', confidence_score: 90, event_hash: 'd', hash_status: 'batched' },
      { event_type: 'shipped', event_time: '2026-05-22T00:00:00.000Z', confidence_score: 90, event_hash: 'e', hash_status: 'batched' },
    ],
    [
      { evidence_type: 'satellite_diagnostic', confidence_score: 80 },
      { evidence_type: 'weighbridge_slip', confidence_score: 85 },
      { evidence_type: 'field_agent_verification', confidence_score: 90 },
    ],
  );

  assert.equal(result.missingEvents.length, 0);
  assert.ok(result.evidenceScore >= 85);
  assert.ok(result.riskScore <= 20);
});
