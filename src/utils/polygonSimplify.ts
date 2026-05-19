/**
 * Ramer–Douglas–Peucker stroke simplification.
 *
 * Takes a dense freehand lat/lng stroke and returns a closed polygon ring
 * with the minimum vertices needed to preserve the shape within `tolerance`
 * meters. Operates in Web Mercator metres so the tolerance is uniform on
 * the ground (not in degrees, which warp with latitude).
 */
export type LatLng = { lat: number; lng: number };

interface MetersPoint {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6378137;

function toMeters({ lat, lng }: LatLng): MetersPoint {
  return {
    x: EARTH_RADIUS_M * ((lng * Math.PI) / 180),
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)),
  };
}

function fromMeters({ x, y }: MetersPoint): LatLng {
  return {
    lng: ((x / EARTH_RADIUS_M) * 180) / Math.PI,
    lat: ((2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * 180) / Math.PI,
  };
}

function perpendicularDistance(p: MetersPoint, a: MetersPoint, b: MetersPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / mag);
}

function rdp(points: MetersPoint[], epsilon: number): MetersPoint[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let pivot = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      pivot = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, pivot + 1), epsilon);
    const right = rdp(points.slice(pivot), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

export interface SimplifyResult {
  ring: LatLng[];
  vertexCount: number;
  areaSqM: number;
  toleranceM: number;
}

export interface SimplifyOptions {
  /** Tolerance as a fraction of the stroke's bounding-box diagonal (default 1.5%). */
  tolerancePct?: number;
  /** Lower bound on tolerance in meters (default 0.5m). Avoids over-aggressive simplification of tiny strokes. */
  minToleranceM?: number;
}

/**
 * Simplifies a freehand lat/lng stroke into a clean closed polygon ring.
 * The ring is closed (first === last) so it plugs straight into GeoJSON.
 */
export function simplifyStrokeToPolygon(
  stroke: LatLng[],
  opts: SimplifyOptions = {},
): SimplifyResult {
  const tolerancePct = opts.tolerancePct ?? 0.015;
  const minTol = opts.minToleranceM ?? 0.5;

  if (stroke.length < 3) {
    const ring = stroke.slice();
    return { ring, vertexCount: ring.length, areaSqM: 0, toleranceM: 0 };
  }

  // Project to metres
  const meters = stroke.map(toMeters);

  // Close the loop so RDP treats it as a polygon
  const first = meters[0];
  const last = meters[meters.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    meters.push({ ...first });
  }

  // Scale tolerance to the stroke's size
  const xs = meters.map((p) => p.x);
  const ys = meters.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const epsilon = Math.max(diag * tolerancePct, minTol);

  const simplifiedMeters = rdp(meters, epsilon);

  // Make sure the ring stays closed after simplification
  if (
    simplifiedMeters.length === 0 ||
    simplifiedMeters[0].x !== simplifiedMeters[simplifiedMeters.length - 1].x ||
    simplifiedMeters[0].y !== simplifiedMeters[simplifiedMeters.length - 1].y
  ) {
    simplifiedMeters.push({ ...simplifiedMeters[0] });
  }

  const ring = simplifiedMeters.map(fromMeters);
  return {
    ring,
    vertexCount: Math.max(ring.length - 1, 0),
    areaSqM: shoelaceAreaM(simplifiedMeters),
    toleranceM: epsilon,
  };
}

function shoelaceAreaM(ringMeters: MetersPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ringMeters.length - 1; i += 1) {
    const a = ringMeters[i];
    const b = ringMeters[i + 1];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}
