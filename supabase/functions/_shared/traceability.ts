import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const TRACE_EVENT_TYPES = [
  'plot_registered',
  'crop_planted',
  'input_applied',
  'field_observed',
  'harvested',
  'aggregated',
  'quality_checked',
  'stored',
  'processed',
  'packed',
  'shipped',
  'received',
] as const;

export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export const EUDR_COMMODITIES = new Set(['cattle', 'cocoa', 'coffee', 'oil palm', 'palm oil', 'rubber', 'soya', 'soy', 'wood', 'timber']);

const REQUIRED_EVENTS: TraceEventType[] = ['plot_registered', 'crop_planted', 'harvested', 'quality_checked'];
const TRANSFER_EVENTS = new Set<TraceEventType>(['aggregated', 'stored', 'processed', 'packed', 'shipped', 'received']);
const encoder = new TextEncoder();

export function createTraceSupabaseClient(req: Request): SupabaseClient {
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

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toHex(digest);
}

export async function hashCanonicalJson(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}

export function canonicalEventPayload(input: Record<string, unknown>): Record<string, unknown> {
  return {
    actor_id: input.actor_id ?? null,
    confidence_score: Number(input.confidence_score ?? 0),
    crop_cycle_id: input.crop_cycle_id ?? null,
    cte_type: input.cte_type ?? null,
    event_time: input.event_time,
    event_type: input.event_type,
    farm_id: input.farm_id ?? null,
    kde_payload: input.kde_payload ?? {},
    location_json: input.location_json ?? null,
    lot_id: input.lot_id ?? null,
    organization_id: input.organization_id ?? null,
    plot_id: input.plot_id ?? null,
    previous_event_hash: input.previous_event_hash ?? null,
    quantity_in: input.quantity_in ?? null,
    quantity_out: input.quantity_out ?? null,
    quantity_unit: input.quantity_unit ?? null,
  };
}

export async function buildTraceEventHash(input: Record<string, unknown>): Promise<string> {
  return hashCanonicalJson(canonicalEventPayload(input));
}

function pairHashes(hashes: string[]): string[] {
  const pairs: string[] = [];
  for (let index = 0; index < hashes.length; index += 2) {
    const left = hashes[index];
    const right = hashes[index + 1] ?? left;
    pairs.push(`${left}${right}`);
  }
  return pairs;
}

export async function buildMerkleRoot(eventHashes: string[]): Promise<string> {
  if (eventHashes.length === 0) return sha256Hex('wrkfarm-empty-merkle-root-v1');
  let level = [...eventHashes].sort();
  while (level.length > 1) {
    level = await Promise.all(pairHashes(level).map((pair) => sha256Hex(pair)));
  }
  return level[0];
}

export async function ensureOrganization(supabase: SupabaseClient, organizationId?: string): Promise<string> {
  if (organizationId) return organizationId;

  const { data: existing, error: lookupError } = await supabase
    .from('organizations')
    .select('id')
    .is('owner_user_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('organizations')
    .insert({
      name: 'wrkFarm Traceability Workspace',
      owner_user_id: null,
      metadata: { system_default: true },
    })
    .select('id')
    .maybeSingle();

  if (createError) throw createError;
  if (!created?.id) throw new Error('Could not create traceability organization');
  return created.id;
}

export function generateLotCode(crop: string): string {
  const cropSlug = crop.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'CROP';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${cropSlug}-${date}-${suffix}`;
}

export function generatePublicToken(prefix = 'wrk'): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function statusFromEvent(eventType: TraceEventType): string | null {
  const mapping: Partial<Record<TraceEventType, string>> = {
    crop_planted: 'planted',
    harvested: 'harvested',
    aggregated: 'aggregated',
    quality_checked: 'quality_checked',
    stored: 'stored',
    processed: 'processed',
    packed: 'packed',
    shipped: 'shipped',
    received: 'received',
  };
  return mapping[eventType] ?? null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateRisk(lot: Record<string, unknown>, events: Record<string, unknown>[], evidence: Record<string, unknown>[]) {
  const eventTypes = new Set(events.map((event) => String(event.event_type ?? '')));
  const missingEvents = REQUIRED_EVENTS.filter((eventType) => !eventTypes.has(eventType));
  const flags: string[] = [];

  if (!lot.production_area_hectares || Number(lot.production_area_hectares) <= 0) flags.push('Production area is missing.');
  if (events.length === 0) flags.push('No traceability events have been recorded.');
  if (!events.some((event) => Boolean(event.event_hash))) flags.push('No hashed event is available for audit verification.');
  if (!events.some((event) => event.hash_status === 'batched' || event.hash_status === 'anchored')) flags.push('Events have not been included in a hash batch yet.');
  if (!events.some((event) => TRANSFER_EVENTS.has(String(event.event_type ?? '') as TraceEventType))) flags.push('No chain-of-custody transfer event has been recorded.');

  const initial = Number(lot.initial_quantity ?? 0);
  const current = Number(lot.current_quantity ?? 0);
  if (initial < 0 || current < 0) flags.push('Lot contains a negative quantity.');
  if (initial > 0 && current > initial * 1.15) flags.push('Current quantity is materially higher than the starting quantity.');

  const evidenceTypes = new Set(evidence.map((item) => String(item.evidence_type ?? '')));
  const hasSatelliteEvidence = evidenceTypes.has('satellite_diagnostic') || evidenceTypes.has('agricultural_index');
  const hasDocumentEvidence = ['lab_report', 'weighbridge_slip', 'invoice', 'certificate'].some((type) => evidenceTypes.has(type));
  const hasFieldEvidence = evidenceTypes.has('field_photo') || evidenceTypes.has('field_agent_verification') || evidenceTypes.has('survey');

  let evidenceScore = 10;
  evidenceScore += Math.min(events.length, 8) * 5;
  evidenceScore += (REQUIRED_EVENTS.length - missingEvents.length) * 10;
  if (hasSatelliteEvidence) evidenceScore += 15;
  if (hasDocumentEvidence) evidenceScore += 15;
  if (hasFieldEvidence) evidenceScore += 10;
  if (lot.production_area_hectares && Number(lot.production_area_hectares) > 0) evidenceScore += 10;
  if (events.some((event) => event.hash_status === 'batched' || event.hash_status === 'anchored')) evidenceScore += 10;
  if (events.length > 0) {
    evidenceScore += events.reduce((sum, event) => sum + Number(event.confidence_score ?? 0), 0) / events.length * 0.1;
  }
  evidenceScore = clampScore(evidenceScore);

  let riskScore = 100 - evidenceScore;
  riskScore += missingEvents.length * 8;
  riskScore += flags.length * 6;
  riskScore = clampScore(riskScore);

  let status = 'incomplete';
  if (evidenceScore >= 85 && riskScore <= 20) status = 'verified';
  else if (evidenceScore >= 70 && riskScore <= 35) status = 'ready';
  else if (evidenceScore >= 40) status = 'review_needed';

  return { evidenceScore, riskScore, status, missingEvents, flags };
}

export async function loadLotBundle(supabase: SupabaseClient, lotId: string) {
  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('*')
    .eq('id', lotId)
    .maybeSingle();
  if (lotError) throw lotError;
  if (!lot) throw new Error('Lot not found');

  const { data: events, error: eventsError } = await supabase
    .from('trace_events')
    .select('*, event_evidence(*)')
    .eq('lot_id', lotId)
    .order('event_time', { ascending: true });
  if (eventsError) throw eventsError;

  const { data: reports, error: reportsError } = await supabase
    .from('compliance_reports')
    .select('*')
    .eq('lot_id', lotId)
    .order('created_at', { ascending: false });
  if (reportsError) throw reportsError;

  const { data: token, error: tokenError } = await supabase
    .from('qr_tokens')
    .select('*')
    .eq('lot_id', lotId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokenError) throw tokenError;

  return {
    lot,
    events: events ?? [],
    reports: reports ?? [],
    token,
  };
}

export function evidenceFromEvents(events: Record<string, unknown>[]) {
  return events.flatMap((event) => {
    if (Array.isArray(event.event_evidence)) return event.event_evidence as Record<string, unknown>[];
    if (Array.isArray(event.evidence)) return event.evidence as Record<string, unknown>[];
    return [];
  });
}

export function buildComplianceSummary(lot: Record<string, unknown>, events: Record<string, unknown>[], risk: ReturnType<typeof calculateRisk>) {
  const crop = String(lot.crop ?? '').toLowerCase();
  const frameworks = ['buyer_due_diligence'];
  if (EUDR_COMMODITIES.has(crop)) frameworks.push('eudr');
  frameworks.push('fsma204_record_ready');

  return {
    headline: `${lot.lot_code} has ${events.length} recorded traceability event(s).`,
    frameworks,
    status: risk.status,
    evidence_score: risk.evidenceScore,
    risk_score: risk.riskScore,
    missing_events: risk.missingEvents,
    risk_flags: risk.flags,
    caveats: [
      'Records are audit-supporting evidence, not a substitute for third-party certification.',
      'Satellite and AI outputs are corroborating signals and require field or document verification for regulated claims.',
      'EUDR is only marked when the commodity is in regulated scope.',
    ],
  };
}
