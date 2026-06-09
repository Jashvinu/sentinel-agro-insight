import type { TraceEventType } from './traceabilityTypes';

export interface RiskTraceEvent {
  event_type: TraceEventType;
  event_time: string;
  quantity_in?: number | null;
  quantity_out?: number | null;
  confidence_score?: number | null;
  event_hash?: string | null;
  hash_status?: string | null;
}

export interface RiskEvidence {
  evidence_type: string;
  confidence_score?: number | null;
}

export interface RiskLot {
  crop: string;
  production_area_hectares?: number | null;
  initial_quantity?: number | null;
  current_quantity?: number | null;
  status?: string | null;
}

export interface TraceabilityRiskResult {
  evidenceScore: number;
  riskScore: number;
  status: 'incomplete' | 'review_needed' | 'ready' | 'verified';
  missingEvents: TraceEventType[];
  flags: string[];
}

const REQUIRED_EVENTS: TraceEventType[] = [
  'plot_registered',
  'crop_planted',
  'harvested',
  'quality_checked',
];

const TRANSFER_EVENTS = new Set<TraceEventType>(['aggregated', 'stored', 'processed', 'packed', 'shipped', 'received']);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueEventTypes(events: RiskTraceEvent[]): Set<TraceEventType> {
  return new Set(events.map((event) => event.event_type));
}

export function checkQuantityContinuity(lot: RiskLot, events: RiskTraceEvent[]): string[] {
  const flags: string[] = [];
  const initial = Number(lot.initial_quantity ?? 0);
  const current = Number(lot.current_quantity ?? 0);

  if (initial < 0 || current < 0) {
    flags.push('Lot contains a negative quantity.');
  }

  if (initial > 0 && current > initial * 1.15) {
    flags.push('Current quantity is materially higher than the starting quantity.');
  }

  for (const event of events) {
    const inQty = Number(event.quantity_in ?? 0);
    const outQty = Number(event.quantity_out ?? 0);
    if (inQty < 0 || outQty < 0) {
      flags.push(`${event.event_type} has a negative quantity.`);
    }
    if (outQty > 0 && inQty > 0 && outQty > inQty * 1.15 && event.event_type !== 'processed') {
      flags.push(`${event.event_type} output is unexpectedly higher than input.`);
    }
  }

  return flags;
}

export function calculateTraceabilityRisk(
  lot: RiskLot,
  events: RiskTraceEvent[],
  evidence: RiskEvidence[],
): TraceabilityRiskResult {
  const eventTypes = uniqueEventTypes(events);
  const missingEvents = REQUIRED_EVENTS.filter((eventType) => !eventTypes.has(eventType));
  const flags: string[] = [];

  if (!lot.production_area_hectares || lot.production_area_hectares <= 0) {
    flags.push('Production area is missing.');
  }

  if (events.length === 0) {
    flags.push('No traceability events have been recorded.');
  }

  if (!events.some((event) => Boolean(event.event_hash))) {
    flags.push('No hashed event is available for audit verification.');
  }

  if (!events.some((event) => event.hash_status === 'batched' || event.hash_status === 'anchored')) {
    flags.push('Events have not been included in a hash batch yet.');
  }

  if (!events.some((event) => TRANSFER_EVENTS.has(event.event_type))) {
    flags.push('No chain-of-custody transfer event has been recorded.');
  }

  flags.push(...checkQuantityContinuity(lot, events));

  const evidenceTypes = new Set(evidence.map((item) => item.evidence_type));
  const hasSatelliteEvidence = evidenceTypes.has('satellite_diagnostic') || evidenceTypes.has('agricultural_index');
  const hasDocumentEvidence = ['lab_report', 'weighbridge_slip', 'invoice', 'certificate'].some((type) => evidenceTypes.has(type));
  const hasFieldEvidence = evidenceTypes.has('field_photo') || evidenceTypes.has('field_agent_verification') || evidenceTypes.has('survey');

  let evidenceScore = 10;
  evidenceScore += Math.min(events.length, 8) * 5;
  evidenceScore += (REQUIRED_EVENTS.length - missingEvents.length) * 10;
  if (hasSatelliteEvidence) evidenceScore += 15;
  if (hasDocumentEvidence) evidenceScore += 15;
  if (hasFieldEvidence) evidenceScore += 10;
  if (lot.production_area_hectares && lot.production_area_hectares > 0) evidenceScore += 10;
  if (events.some((event) => event.hash_status === 'batched' || event.hash_status === 'anchored')) evidenceScore += 10;

  const averageConfidence = events.length > 0
    ? events.reduce((sum, event) => sum + Number(event.confidence_score ?? 0), 0) / events.length
    : 0;
  evidenceScore += averageConfidence * 0.1;
  evidenceScore = clampScore(evidenceScore);

  let riskScore = 100 - evidenceScore;
  riskScore += missingEvents.length * 8;
  riskScore += flags.length * 6;
  riskScore = clampScore(riskScore);

  let status: TraceabilityRiskResult['status'] = 'incomplete';
  if (evidenceScore >= 85 && riskScore <= 20) {
    status = 'verified';
  } else if (evidenceScore >= 70 && riskScore <= 35) {
    status = 'ready';
  } else if (evidenceScore >= 40) {
    status = 'review_needed';
  }

  return {
    evidenceScore,
    riskScore,
    status,
    missingEvents,
    flags,
  };
}
