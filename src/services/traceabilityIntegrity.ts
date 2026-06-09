export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson | undefined };

const textEncoder = new TextEncoder();

function isPlainRecord(value: unknown): value is Record<string, CanonicalJson | undefined> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNumber(value: number): number | string {
  if (!Number.isFinite(value)) return String(value);
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalize(value: CanonicalJson): CanonicalJson {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (isPlainRecord(value)) {
    return Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .reduce<Record<string, CanonicalJson>>((acc, key) => {
        acc[key] = canonicalize(value[key] as CanonicalJson);
        return acc;
      }, {});
  }

  if (typeof value === 'number') {
    return normalizeNumber(value);
  }

  return value;
}

export function canonicalStringify(value: CanonicalJson): string {
  return JSON.stringify(canonicalize(value));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable in this runtime');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return toHex(digest);
}

export async function hashCanonicalJson(value: CanonicalJson): Promise<string> {
  return sha256Hex(canonicalStringify(value));
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
  if (eventHashes.length === 0) {
    return sha256Hex('wrkfarm-empty-merkle-root-v1');
  }

  let level = [...eventHashes].sort();
  while (level.length > 1) {
    level = await Promise.all(pairHashes(level).map((pair) => sha256Hex(pair)));
  }

  return level[0];
}

export interface TraceEventHashInput {
  organization_id?: string | null;
  event_type: string;
  event_time: string;
  actor_id?: string | null;
  farm_id?: string | null;
  plot_id?: string | null;
  crop_cycle_id?: string | null;
  lot_id?: string | null;
  location_json?: CanonicalJson;
  quantity_in?: number | null;
  quantity_out?: number | null;
  quantity_unit?: string | null;
  cte_type?: string | null;
  kde_payload?: CanonicalJson;
  confidence_score?: number | null;
  previous_event_hash?: string | null;
}

export function canonicalEventPayload(input: TraceEventHashInput): CanonicalJson {
  return {
    actor_id: input.actor_id ?? null,
    confidence_score: input.confidence_score ?? 0,
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

export async function buildTraceEventHash(input: TraceEventHashInput): Promise<string> {
  return hashCanonicalJson(canonicalEventPayload(input));
}

export function verifyMerkleInclusion(
  eventHash: string,
  batchHashes: string[],
): boolean {
  return batchHashes.includes(eventHash);
}
