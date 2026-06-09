import { z } from 'zod';

import { EVIDENCE_TYPES, TRACE_EVENT_TYPES } from './traceabilityTypes';

const uuid = z.string().uuid();

const positiveQuantity = z.coerce
  .number()
  .finite()
  .nonnegative('Quantity cannot be negative');

const optionalUuid = uuid.optional();

export const traceLotSchema = z.object({
  organization_id: optionalUuid,
  lot_code: z.string().trim().min(2).max(80).optional(),
  crop: z.string().trim().min(2).max(80),
  variety: z.string().trim().max(80).optional(),
  season: z.string().trim().max(80).optional(),
  production_area_hectares: z.coerce.number().finite().positive().optional(),
  initial_quantity: positiveQuantity,
  quantity_unit: z.string().trim().min(1).max(20).default('kg'),
  owner_actor_id: optionalUuid,
  crop_cycle_id: optionalUuid,
  metadata: z.record(z.unknown()).optional(),
});

export const evidenceSchema = z.object({
  evidence_type: z.enum(EVIDENCE_TYPES),
  source_kind: z.enum(['manual', 'supabase', 'earth_engine', 'gemini', 'iot', 'import']).default('manual'),
  title: z.string().trim().min(2).max(180),
  uri: z.string().url().optional().or(z.literal('')),
  storage_path: z.string().trim().max(300).optional(),
  metadata: z.record(z.unknown()).optional(),
  extracted_fields: z.record(z.unknown()).optional(),
  confidence_score: z.coerce.number().finite().min(0).max(100).default(50),
});

export const traceEventSchema = z.object({
  organization_id: optionalUuid,
  event_type: z.enum(TRACE_EVENT_TYPES),
  event_time: z.string().datetime().optional(),
  actor_id: optionalUuid,
  farm_id: optionalUuid,
  plot_id: optionalUuid,
  crop_cycle_id: optionalUuid,
  lot_id: optionalUuid,
  location_json: z.record(z.unknown()).optional(),
  quantity_in: positiveQuantity.optional(),
  quantity_out: positiveQuantity.optional(),
  quantity_unit: z.string().trim().min(1).max(20).optional(),
  cte_type: z.string().trim().max(80).optional(),
  kde_payload: z.record(z.unknown()).optional(),
  confidence_score: z.coerce.number().finite().min(0).max(100).default(70),
  notes: z.string().trim().max(1000).optional(),
  evidence: z.array(evidenceSchema).max(12).optional(),
});

export const reportRequestSchema = z.object({
  lot_id: uuid,
  report_type: z.enum(['buyer_audit', 'cte_kde', 'qr_passport', 'farm_map_packet', 'evidence_bundle', 'commodity_checklist']).default('buyer_audit'),
});

export const hashBatchRequestSchema = z.object({
  organization_id: optionalUuid,
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function getValidationMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(', ');
  }

  return error instanceof Error ? error.message : String(error);
}
