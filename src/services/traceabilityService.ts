import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';
import { calculateTraceabilityRisk } from './traceabilityRisk';
import { getValidationMessage, hashBatchRequestSchema, reportRequestSchema, traceEventSchema, traceLotSchema } from './traceabilityValidation';
import {
  MOCK_HASH_BATCHES,
  MOCK_QR_TOKEN,
  MOCK_QR_TOKENS,
  MOCK_TRACE_EVENTS,
  MOCK_TRACE_LOT_ID,
  MOCK_TRACE_LOTS,
  MOCK_TRACE_REPORTS,
  buildMockPassport,
  getMockLotBundle,
} from './traceabilityMockData';
import type {
  CreateTraceEventInput,
  CreateTraceLotInput,
  HashBatch,
  QrToken,
  TraceEvent,
  TraceLot,
  TraceReport,
} from './traceabilityTypes';

const OFFLINE_TRACE_QUEUE_KEY = 'offline_trace_queue';
const USE_MOCK_TRACEABILITY_FIRST = import.meta.env.DEV && import.meta.env.VITE_TRACEABILITY_LIVE !== 'true';

interface ApiEnvelope<T> {
  success: boolean;
  error?: string;
  details?: string;
  data?: T;
  lot?: TraceLot;
  lots?: TraceLot[];
  event?: TraceEvent;
  events?: TraceEvent[];
  report?: TraceReport;
  reports?: TraceReport[];
  batch?: HashBatch;
  token?: QrToken;
}

interface OfflineTraceQueueEntry {
  id: string;
  type: 'trace_lot' | 'trace_event';
  payload: CreateTraceLotInput | CreateTraceEventInput;
  createdAt: string;
  lastError?: string;
}

function createOfflineId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function saveOfflineTraceEntry(entry: Omit<OfflineTraceQueueEntry, 'id' | 'createdAt'>): void {
  try {
    const existing = localStorage.getItem(OFFLINE_TRACE_QUEUE_KEY);
    const queue: OfflineTraceQueueEntry[] = existing ? JSON.parse(existing) : [];
    queue.push({
      ...entry,
      id: createOfflineId(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(OFFLINE_TRACE_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[TraceabilityService] Could not write offline queue:', error);
  }
}

async function requestTraceability<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getSupabaseFunctionHeaders(),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || `Traceability API failed with ${response.status}`);
  }

  return payload;
}

function makeQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function listTraceLots(): Promise<TraceLot[]> {
  if (USE_MOCK_TRACEABILITY_FIRST) return MOCK_TRACE_LOTS;

  try {
    const payload = await requestTraceability<TraceLot[]>('trace-lots');
    const lots = payload.lots ?? payload.data ?? [];
    return lots.length > 0 ? lots : MOCK_TRACE_LOTS;
  } catch (error) {
    console.warn('[TraceabilityService] Using mock traceability lots:', error);
    return MOCK_TRACE_LOTS;
  }
}

export async function getTraceLot(lotId: string): Promise<{ lot: TraceLot; events: TraceEvent[]; reports: TraceReport[]; token?: QrToken | null }> {
  const mockLot = MOCK_TRACE_LOTS.find((lot) => lot.id === lotId);
  if (mockLot) return getMockLotBundle(lotId);

  try {
    const payload = await requestTraceability<{
      lot: TraceLot;
      events: TraceEvent[];
      reports: TraceReport[];
      token?: QrToken | null;
    }>(`trace-lots${makeQuery({ id: lotId })}`);

    const data = payload.data;
    if (data?.lot) return data;
    if (payload.lot) {
      return {
        lot: payload.lot,
        events: payload.events ?? [],
        reports: payload.reports ?? [],
        token: payload.token ?? null,
      };
    }
  } catch (error) {
    console.warn('[TraceabilityService] Using mock lot bundle:', error);
  }

  return {
    ...getMockLotBundle(MOCK_TRACE_LOT_ID),
  };
}

export async function createTraceLot(input: CreateTraceLotInput): Promise<TraceLot> {
  const parsed = traceLotSchema.parse(input);

  try {
    const payload = await requestTraceability<TraceLot>('trace-lots', {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    if (payload.lot) return payload.lot;
    if (payload.data) return payload.data;
    throw new Error('Lot was not returned by traceability API');
  } catch (error) {
    saveOfflineTraceEntry({
      type: 'trace_lot',
      payload: parsed,
      lastError: getValidationMessage(error),
    });
    throw error;
  }
}

export async function listTraceEvents(lotId?: string): Promise<TraceEvent[]> {
  if (!lotId) return MOCK_TRACE_EVENTS;
  if (MOCK_TRACE_LOTS.some((lot) => lot.id === lotId)) return MOCK_TRACE_EVENTS.filter((event) => event.lot_id === lotId);

  try {
    const payload = await requestTraceability<TraceEvent[]>(`trace-events${makeQuery({ lot_id: lotId })}`);
    return payload.events ?? payload.data ?? [];
  } catch (error) {
    console.warn('[TraceabilityService] Using mock trace events:', error);
    return MOCK_TRACE_EVENTS;
  }
}

export async function createTraceEvent(input: CreateTraceEventInput): Promise<TraceEvent> {
  const parsed = traceEventSchema.parse(input);

  try {
    const payload = await requestTraceability<TraceEvent>('trace-events', {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    if (payload.event) return payload.event;
    if (payload.data) return payload.data;
    throw new Error('Event was not returned by traceability API');
  } catch (error) {
    saveOfflineTraceEntry({
      type: 'trace_event',
      payload: parsed,
      lastError: getValidationMessage(error),
    });
    throw error;
  }
}

export async function assessTraceLot(lotId: string) {
  const mockLot = MOCK_TRACE_LOTS.find((lot) => lot.id === lotId);
  if (mockLot) {
    const mockEvents = MOCK_TRACE_EVENTS.filter((event) => event.lot_id === mockLot.id);
    return {
      lot: mockLot,
      risk: calculateClientRiskPreview(mockLot, mockEvents),
      summary: MOCK_TRACE_REPORTS.find((report) => report.lot_id === mockLot.id)?.report_json ?? {},
    };
  }

  const payload = await requestTraceability('trace-risk-score', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId }),
  });
  return payload.data ?? payload;
}

export async function generateTraceReport(lotId: string, reportType: TraceReport['report_type'] = 'buyer_audit'): Promise<TraceReport> {
  const mockReport = MOCK_TRACE_REPORTS.find((report) => report.lot_id === lotId && report.report_type === reportType);
  if (mockReport) return mockReport;

  const parsed = reportRequestSchema.parse({ lot_id: lotId, report_type: reportType });
  const payload = await requestTraceability<TraceReport>('trace-reports', {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
  if (payload.report) return payload.report;
  if (payload.data) return payload.data;
  throw new Error('Report was not returned by traceability API');
}

export async function getTraceReport(reportId: string): Promise<TraceReport> {
  const mockReport = MOCK_TRACE_REPORTS.find((report) => report.id === reportId);
  if (mockReport) return mockReport;

  const payload = await requestTraceability<TraceReport>(`trace-reports${makeQuery({ id: reportId })}`);
  if (payload.report) return payload.report;
  if (payload.data) return payload.data;
  throw new Error('Report was not returned by traceability API');
}

export async function createHashBatch(input: { organization_id?: string; batch_date?: string } = {}): Promise<HashBatch> {
  if (!input.organization_id || input.organization_id === MOCK_TRACE_LOTS[0].organization_id) {
    return MOCK_HASH_BATCHES[0];
  }

  const parsed = hashBatchRequestSchema.parse(input);
  const payload = await requestTraceability<HashBatch>('trace-hash-batch', {
    method: 'POST',
    body: JSON.stringify(parsed),
  });
  if (payload.batch) return payload.batch;
  if (payload.data) return payload.data;
  throw new Error('Hash batch was not returned by traceability API');
}

export async function createQrToken(lotId: string): Promise<QrToken> {
  const mockToken = MOCK_QR_TOKENS.find((token) => token.lot_id === lotId);
  if (mockToken) return mockToken;

  const payload = await requestTraceability<QrToken>('qr-public-passport', {
    method: 'POST',
    body: JSON.stringify({ lot_id: lotId }),
  });
  if (payload.token) return payload.token;
  if (payload.data) return payload.data;
  throw new Error('QR token was not returned by traceability API');
}

export async function getPublicPassport(token: string) {
  if (MOCK_QR_TOKENS.some((mockToken) => token === mockToken.public_slug || token === mockToken.token)) {
    return buildMockPassport(token);
  }

  const payload = await requestTraceability(`qr-public-passport${makeQuery({ token })}`);
  return payload.data ?? payload;
}

export function getOfflineTraceQueue(): OfflineTraceQueueEntry[] {
  try {
    const existing = localStorage.getItem(OFFLINE_TRACE_QUEUE_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
}

export function calculateClientRiskPreview(lot: TraceLot, events: TraceEvent[]) {
  const evidence = events.flatMap((event) => event.evidence ?? []);
  return calculateTraceabilityRisk(lot, events, evidence);
}
