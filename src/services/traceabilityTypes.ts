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

export const TRACE_EVENT_LABELS: Record<TraceEventType, string> = {
  plot_registered: 'Plot Registered',
  crop_planted: 'Crop Planted',
  input_applied: 'Input Applied',
  field_observed: 'Field Observed',
  harvested: 'Harvested',
  aggregated: 'Aggregated',
  quality_checked: 'Quality Checked',
  stored: 'Stored',
  processed: 'Processed',
  packed: 'Packed',
  shipped: 'Shipped',
  received: 'Received',
};

export const EVIDENCE_TYPES = [
  'satellite_diagnostic',
  'agricultural_index',
  'water_metric',
  'weather',
  'field_photo',
  'survey',
  'lab_report',
  'weighbridge_slip',
  'invoice',
  'certificate',
  'field_agent_verification',
  'document_ai_extract',
  'other',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type LotStatus =
  | 'created'
  | 'planted'
  | 'harvested'
  | 'aggregated'
  | 'quality_checked'
  | 'stored'
  | 'processed'
  | 'packed'
  | 'shipped'
  | 'received'
  | 'closed'
  | 'flagged';

export type ComplianceStatus = 'not_assessed' | 'incomplete' | 'review_needed' | 'ready' | 'verified';

export interface TraceOrganization {
  id: string;
  name: string;
  owner_user_id?: string | null;
}

export interface TraceLot {
  id: string;
  organization_id: string;
  crop_cycle_id?: string | null;
  lot_code: string;
  crop: string;
  variety?: string | null;
  season?: string | null;
  production_area_hectares?: number | null;
  initial_quantity: number;
  current_quantity: number;
  quantity_unit: string;
  owner_actor_id?: string | null;
  status: LotStatus;
  compliance_status: ComplianceStatus;
  evidence_score: number;
  risk_score: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface TraceEvidence {
  id?: string;
  trace_event_id?: string;
  organization_id?: string;
  evidence_type: EvidenceType;
  source_kind?: 'manual' | 'supabase' | 'earth_engine' | 'gemini' | 'iot' | 'import';
  title: string;
  uri?: string | null;
  storage_path?: string | null;
  metadata?: Record<string, unknown>;
  extracted_fields?: Record<string, unknown>;
  confidence_score?: number;
  created_at?: string;
}

export interface TraceEvent {
  id: string;
  organization_id: string;
  event_type: TraceEventType;
  event_time: string;
  actor_id?: string | null;
  farm_id?: string | null;
  plot_id?: string | null;
  crop_cycle_id?: string | null;
  lot_id?: string | null;
  location_json?: Record<string, unknown> | null;
  quantity_in?: number | null;
  quantity_out?: number | null;
  quantity_unit?: string | null;
  source_system?: string | null;
  device_id?: string | null;
  cte_type?: string | null;
  kde_payload?: Record<string, unknown>;
  confidence_score: number;
  previous_event_hash?: string | null;
  event_hash: string;
  hash_status: 'pending' | 'batched' | 'anchored' | 'verified' | 'mismatch';
  notes?: string | null;
  created_at: string;
  evidence?: TraceEvidence[];
}

export interface CreateTraceLotInput {
  organization_id?: string;
  lot_code?: string;
  crop: string;
  variety?: string;
  season?: string;
  production_area_hectares?: number;
  initial_quantity: number;
  quantity_unit: string;
  owner_actor_id?: string;
  crop_cycle_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTraceEventInput {
  organization_id?: string;
  event_type: TraceEventType;
  event_time?: string;
  actor_id?: string;
  farm_id?: string;
  plot_id?: string;
  crop_cycle_id?: string;
  lot_id?: string;
  location_json?: Record<string, unknown>;
  quantity_in?: number;
  quantity_out?: number;
  quantity_unit?: string;
  cte_type?: string;
  kde_payload?: Record<string, unknown>;
  confidence_score?: number;
  notes?: string;
  evidence?: TraceEvidence[];
}

export interface TraceReport {
  id: string;
  organization_id: string;
  lot_id: string;
  report_type: 'buyer_audit' | 'cte_kde' | 'qr_passport' | 'farm_map_packet' | 'evidence_bundle' | 'commodity_checklist';
  title: string;
  report_json: Record<string, unknown>;
  report_url?: string | null;
  status: 'draft' | 'generated' | 'shared' | 'revoked';
  created_at: string;
}

export interface HashBatch {
  id: string;
  organization_id: string;
  batch_date: string;
  event_count: number;
  merkle_root: string;
  algorithm: string;
  event_hashes: string[];
  polygon_tx_hash?: string | null;
  anchored_at?: string | null;
  created_at: string;
}

export interface QrToken {
  id: string;
  organization_id: string;
  lot_id: string;
  token: string;
  public_slug: string;
  status: 'active' | 'revoked' | 'expired';
  expires_at?: string | null;
  scan_count: number;
  last_scanned_at?: string | null;
  created_at: string;
}
