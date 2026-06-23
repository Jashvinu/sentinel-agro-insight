/**
 * disease-risk-screen
 *
 * Stage 1 + 2 of the disease detection pipeline.
 * 1. Computes per-cell satellite disease risk scores using new indices (RBVI, CIre, MTCI, DWS, NDVI_CV)
 * 2. Generates scout zones (spatial clusters of high-risk cells)
 *
 * POST /disease-risk-screen
 * Body: {
 *   farm_id: string,
 *   crop: 'rice' | 'millet',
 *   growth_stage?: string,
 *   season?: 'kharif' | 'rabi',
 *   geometry?: GeoJSON,
 *   start_date?: string,   // ISO date
 *   end_date?: string,
 * }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import ee from 'npm:@google/earthengine@1.6.13';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { initializeEarthEngine, evaluate } from '../_shared/satellite-utils.ts';
import { calculateDiseaseIndices } from '../_shared/optical-algorithms.ts';
import { computeThermalStress } from '../_shared/thermal-utils.ts';
import {
  scoreCropDiseases,
  thermalConfounder,
  parseGrowthStage,
  type SpectralFeatures,
  type WeatherFeatures,
} from '../_shared/disease-models.ts';

const SCOUT_ZONE_MIN_RISK = 0.40;   // cells above this are candidates
const SCOUT_ZONE_MERGE_M  = 50;     // meters — merge radius for clustering
const SCOUT_ZONE_MAX      = 5;      // max scout zones returned per scan
const HOTSPOT_DIST_M      = 90;     // Getis-Ord Gi* neighbourhood distance band
const HOTSPOT_Z_SIG       = 1.96;   // |z| > 1.96 ≈ 95% significant hot cluster

function createSupabaseClient(req: Request) {
  const url  = Deno.env.get('SUPABASE_URL');
  const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Supabase env not configured');
  // Always use the service role key as Authorization to bypass RLS for DB writes
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
}

/** Haversine distance in meters */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RiskCell {
  lat: number;
  lng: number;
  composite_risk: number;
  disease_candidates: string[];
  rbvi: number;
  cire: number;
  mtci: number;
  dws: number;
  ndvi_cv: number;
  ndvi: number;
  moisture: number;
  weather_risk: number;
  per_disease: Record<string, number>;
  ribinir: number;
  ribired: number;
  redsi: number;
  psri: number;
  thermal_stress: number;
  anomaly_z: number;
  likely_abiotic: boolean;
  gi_star_z?: number;
}

interface ScoutZone {
  centroid_lat: number;
  centroid_lng: number;
  radius_meters: number;
  disease_candidates: string[];
  max_risk_score: number;
  cell_count: number;
  hotspot_z: number;
  significance: 'significant' | 'marginal';
}

/**
 * Getis-Ord Gi* hotspot z-score for each cell over the composite-risk field.
 * A neighbourhood (incl. self) is the cells within HOTSPOT_DIST_M. Gi* tells us
 * whether a local cluster of high risk is statistically real vs. noise, replacing
 * the arbitrary radius merge. Mutates each cell's `gi_star_z`.
 */
function computeGiStar(cells: RiskCell[], distM: number): void {
  const n = cells.length;
  if (n < 3) {
    for (const c of cells) c.gi_star_z = 0;
    return;
  }
  const x = cells.map((c) => c.composite_risk);
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const S = Math.sqrt(Math.max(variance, 1e-9));

  for (let i = 0; i < n; i++) {
    let sumW = 0;        // Σ w_ij (binary 0/1, self included)
    let sumWx = 0;       // Σ w_ij x_j
    for (let j = 0; j < n; j++) {
      const w = i === j || distanceM(cells[i].lat, cells[i].lng, cells[j].lat, cells[j].lng) <= distM ? 1 : 0;
      if (w) { sumW += 1; sumWx += x[j]; }
    }
    // Gi* = (Σw x − X̄ Σw) / (S √[(n Σw² − (Σw)²)/(n−1)]); w² = w for binary weights
    const numer = sumWx - mean * sumW;
    const denom = S * Math.sqrt(Math.max((n * sumW - sumW * sumW) / (n - 1), 1e-9));
    cells[i].gi_star_z = denom > 0 ? numer / denom : 0;
  }
}

/**
 * Build scout zones from Gi*-significant hot cells. Only cells that are both
 * above the risk floor AND statistically hot (Gi* z > sig) seed zones; contiguous
 * hot cells within mergeM are merged. Output shape matches the legacy clusterer
 * (plus hotspot_z / significance) so downstream code is unchanged.
 */
function clusterToZones(
  cells: RiskCell[],
  minRisk: number,
  mergeM: number,
  maxZones: number,
): ScoutZone[] {
  computeGiStar(cells, HOTSPOT_DIST_M);

  const candidates = cells
    .filter((c) => c.composite_risk >= minRisk && (c.gi_star_z ?? 0) >= HOTSPOT_Z_SIG)
    .sort((a, b) => (b.gi_star_z ?? 0) - (a.gi_star_z ?? 0));

  const zones: ScoutZone[] = [];
  const used = new Set<number>();

  for (let i = 0; i < candidates.length && zones.length < maxZones; i++) {
    if (used.has(i)) continue;
    const seed = candidates[i];
    const members: RiskCell[] = [seed];
    used.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      if (distanceM(seed.lat, seed.lng, candidates[j].lat, candidates[j].lng) <= mergeM) {
        members.push(candidates[j]);
        used.add(j);
      }
    }

    const centroid_lat = members.reduce((s, c) => s + c.lat, 0) / members.length;
    const centroid_lng = members.reduce((s, c) => s + c.lng, 0) / members.length;
    // Exclude likely-abiotic cells from the zone's disease roster.
    const allDiseases  = [...new Set(members.filter((c) => !c.likely_abiotic).flatMap((c) => c.disease_candidates))];
    const maxRisk      = Math.max(...members.map((c) => c.composite_risk));
    const maxZ         = Math.max(...members.map((c) => c.gi_star_z ?? 0));

    zones.push({
      centroid_lat,
      centroid_lng,
      radius_meters: mergeM,
      disease_candidates: allDiseases,
      max_risk_score: maxRisk,
      cell_count: members.length,
      hotspot_z: Number(maxZ.toFixed(3)),
      significance: maxZ >= HOTSPOT_Z_SIG ? 'significant' : 'marginal',
    });
  }

  return zones;
}

/** Fetch Open-Meteo 7-day lookback weather for a lat/lng */
async function fetchWeatherRisk(lat: number, lng: number): Promise<WeatherFeatures> {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation` +
    `&past_days=7&forecast_days=1&timezone=Asia%2FKolkata`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();

  const temps: number[] = data.hourly?.temperature_2m ?? [];
  const rhs: number[] = data.hourly?.relative_humidity_2m ?? [];
  const rain: number[] = data.hourly?.precipitation ?? [];

  if (temps.length === 0 || rhs.length === 0 || rain.length === 0) {
    throw new Error('Open-Meteo response missing required hourly weather arrays.');
  }

  const hours2028 = temps.filter((t) => t >= 20 && t <= 28).length;
  const leafWet = rhs.filter((rh) => rh >= 80).length;
  const totalRain = rain.reduce((s: number, v: number) => s + (v ?? 0), 0);
  const meanTemp = temps.reduce((s, v) => s + v, 0) / temps.length;
  const maxRh = Math.max(...rhs);

  return { hours_temp_20_28c: hours2028, leaf_wetness_hours: leafWet, max_rh_pct: maxRh, total_rain_mm: totalRain, mean_temp_c: meanTemp };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const farmId     = String(body.farm_id ?? '');
    const crop       = String(body.crop ?? 'rice').toLowerCase() === 'millet' ? 'millet' : 'rice' as 'rice' | 'millet';
    const season     = String(body.season ?? 'kharif').toLowerCase() === 'rabi' ? 'rabi' : 'kharif' as 'kharif' | 'rabi';
    const growthStage = parseGrowthStage(body.growth_stage);
    const scanDate   = new Date().toISOString().split('T')[0];

    const supabase = createSupabaseClient(req);

    // Load farm geometry
    let geometry = body.geometry;
    let farmBounds: number[][] | null = null;
    if (!geometry && farmId) {
      const { data: farm } = await supabase
        .from('farms')
        .select('geometry, bounds')
        .eq('id', farmId)
        .maybeSingle();
      if (farm?.geometry) geometry = farm.geometry;
      if (farm?.bounds) farmBounds = farm.bounds;
    }
    if (!geometry) return errorResponse('farm geometry required', 400);

    // Initialize Earth Engine
    await initializeEarthEngine();
    const eeGeometry = ee.Geometry(geometry);

    // Build date window (14 days)
    const endDate   = body.end_date   ?? scanDate;
    const startDate = body.start_date ?? new Date(new Date(endDate).getTime() - 45 * 86400000)
      .toISOString().split('T')[0];

    // Load Sentinel-2 harmonized collection
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(eeGeometry)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map((img: any) => {
        return img.select(
            ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12'],
            ['blue','green','red','rededge','rededge2','rededge3','nir','nir2','swir1','swir2'])
          .multiply(0.0001);
      });

    const imageCount: number = await evaluate(s2Collection.size());
    if (imageCount === 0) {
      return successResponse({
        scout_zones: [],
        risk_cells_count: 0,
        message: 'No cloud-free Sentinel-2 images in the date window. Try a wider date range.',
        scan_date: scanDate,
      });
    }

    // Compute disease indices
    const diseaseIndices = await calculateDiseaseIndices(s2Collection, eeGeometry);

    // Multi-temporal NDVI baseline: per-pixel mean + stdDev over the prior ~56 days
    // (≈4 Sentinel-2 revisit cycles). Comparing the current scan to each cell's OWN
    // temporal baseline cancels field-wide drought/rain — only within-field anomalies
    // survive (research doc §3/§5). anomaly_z is derived per cell below.
    const BASELINE_DAYS = 56;
    const baselineStart = new Date(new Date(startDate).getTime() - BASELINE_DAYS * 86400000)
      .toISOString().split('T')[0];
    const baselineCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(eeGeometry)
      .filterDate(baselineStart, startDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map((img: any) =>
        img.select(['B4','B8'], ['red','nir']).multiply(0.0001)
          .normalizedDifference(['nir','red']).rename('NDVI')
      );
    const baselineMean = baselineCollection.mean().rename('NDVI_baseline');
    const baselineSd   = baselineCollection.reduce(ee.Reducer.stdDev()).rename('NDVI_baseline_sd');

    // Thermal water-stress proxy (Landsat/MODIS LST) for confounder reduction
    const thermalStressImage = await computeThermalStress(eeGeometry, startDate, endDate);

    // Moisture from NDMI
    const ndmiImage = diseaseIndices.dwsImage; // DWS includes NDMI component
    const moistureImage = diseaseIndices.ndviImage
      .subtract(ee.Image(1))
      .abs()
      .multiply(45.2)
      .subtract(8.7)
      .clamp(0, 100)
      .rename('moisture'); // simplified proxy

    // Sample grid points at 30m
    const stackedImage = ee.Image.cat([
      diseaseIndices.rbviImage,
      diseaseIndices.cireImage,
      diseaseIndices.mtciImage,
      diseaseIndices.dwsImage,
      diseaseIndices.ndviCvImage,
      diseaseIndices.ndviImage,
      diseaseIndices.ribinirImage,
      diseaseIndices.ribiredImage,
      diseaseIndices.redsiImage,
      diseaseIndices.psriImage,
      moistureImage,
      baselineMean,
      baselineSd,
      thermalStressImage,
    ]);

    const samples = stackedImage.sample({
      region: eeGeometry,
      scale: 30,
      numPixels: 500,
      geometries: true,
    });

    const sampleList: any[] = await evaluate(samples.toList(500));

    // Fetch weather once for the farm centroid
    let farmLat = 0;
    let farmLng = 0;
    if (Array.isArray(farmBounds) && farmBounds.length >= 2 && Array.isArray(farmBounds[0]) && Array.isArray(farmBounds[1])) {
      farmLat = (((farmBounds[0][0] as number) ?? 0) + ((farmBounds[1][0] as number) ?? 0)) / 2;
      farmLng = (((farmBounds[0][1] as number) ?? 0) + ((farmBounds[1][1] as number) ?? 0)) / 2;
    } else {
      const centroid: any = await evaluate(eeGeometry.centroid());
      farmLng = centroid.coordinates?.[0] ?? 0;
      farmLat = centroid.coordinates?.[1] ?? 0;
    }

    const weather = await fetchWeatherRisk(farmLat, farmLng);

    // Score each sample point
    const riskCells: RiskCell[] = [];

    for (const sample of sampleList) {
      const props  = sample.properties ?? {};
      const coords = sample.geometry?.coordinates ?? [0, 0];
      const lng    = coords[0] ?? 0;
      const lat    = coords[1] ?? 0;

      if (!lat || !lng) continue;

      const ndviBaseline = props['NDVI_baseline'] ?? props['NDVI'] ?? 0.3;
      const spec: SpectralFeatures = {
        ndvi:           props['NDVI']          ?? 0.3,
        ndvi_cv:        props['NDVI_CV']       ?? 0,
        rbvi:           props['RBVI']          ?? 0.2,
        cire:           props['CIre']          ?? 2.0,
        mtci:           props['MTCI']          ?? 1.5,
        dws:            props['DWS']           ?? 0,
        moisture:       props['moisture']      ?? 20,
        ndvi_baseline:  ndviBaseline,
        ribinir:        props['RIBInir'],
        ribired:        props['RIBIred'],
        redsi:          props['REDSI'],
        psri:           props['PSRI'],
        thermal_stress: props['thermal_stress'],
      };

      // Per-cell temporal anomaly z-score: how far this scan's NDVI sits BELOW the
      // cell's own rolling baseline, in baseline-stdDev units (positive = decline).
      const baselineSdVal = props['NDVI_baseline_sd'];
      const anomaly_z = baselineSdVal && baselineSdVal > 0.01
        ? (ndviBaseline - spec.ndvi) / baselineSdVal
        : 0;

      const cropRisk = scoreCropDiseases(crop, season, spec, weather, growthStage);
      const { likely_abiotic } = thermalConfounder(spec);

      const perDisease: Record<string, number> = {};
      for (const d of cropRisk.applicable_diseases) {
        perDisease[d.disease] = d.score;
      }

      riskCells.push({
        lat,
        lng,
        composite_risk: cropRisk.composite_risk,
        disease_candidates: cropRisk.applicable_diseases
          .filter((d) => d.score > 0.30)
          .map((d) => d.disease),
        rbvi:         spec.rbvi,
        cire:         spec.cire,
        mtci:         spec.mtci,
        dws:          spec.dws,
        ndvi_cv:      spec.ndvi_cv,
        ndvi:         spec.ndvi,
        moisture:     spec.moisture,
        weather_risk: (weather.hours_temp_20_28c / 72 + weather.leaf_wetness_hours / 60) / 2,
        per_disease:  perDisease,
        ribinir:        spec.ribinir ?? 0,
        ribired:        spec.ribired ?? 0,
        redsi:          spec.redsi ?? 0,
        psri:           spec.psri ?? 0,
        thermal_stress: spec.thermal_stress ?? 0,
        anomaly_z:      Number(anomaly_z.toFixed(3)),
        likely_abiotic,
      });
    }

    // Generate scout zones (computes per-cell Gi* z-scores, mutated onto riskCells)
    const scoutZones = clusterToZones(riskCells, SCOUT_ZONE_MIN_RISK, SCOUT_ZONE_MERGE_M, SCOUT_ZONE_MAX);

    // Persist risk cells to DB (after Gi* so gi_star_z is populated)
    if (farmId && riskCells.length > 0) {
      const rows = riskCells.map((c) => ({
        farm_id:       farmId,
        scan_date:     scanDate,
        crop,
        growth_stage:  body.growth_stage ?? growthStage,
        cell_lat:      c.lat,
        cell_lng:      c.lng,
        composite_risk: c.composite_risk,
        rice_blast_risk:    c.per_disease['rice_blast'] ?? null,
        sheath_blight_risk: c.per_disease['sheath_blight'] ?? null,
        blb_risk:           c.per_disease['bacterial_leaf_blight'] ?? null,
        downy_mildew_risk:  c.per_disease['downy_mildew'] ?? null,
        leaf_spot_risk:     c.per_disease['leaf_spot'] ?? null,
        charcoal_rot_risk:  c.per_disease['charcoal_rot'] ?? null,
        rbvi:               c.rbvi,
        cire:               c.cire,
        mtci:               c.mtci,
        dws:                c.dws,
        ndvi_cv:            c.ndvi_cv,
        ndvi:               c.ndvi,
        moisture:           c.moisture,
        weather_risk:       c.weather_risk,
        ribinir:            c.ribinir,
        ribired:            c.ribired,
        redsi:              c.redsi,
        psri:               c.psri,
        thermal_stress:     c.thermal_stress,
        anomaly_z:          c.anomaly_z,
        gi_star_z:          c.gi_star_z ?? null,
        likely_abiotic:     c.likely_abiotic,
      }));

      // upsert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from('disease_risk_cells').insert(rows.slice(i, i + 100));
        if (error) throw new Error(`Failed to insert disease risk cells: ${error.message}`);
      }
    }

    // Persist scout zones
    const savedZones: any[] = [];
    if (farmId) {
      // delete old pending zones for this farm+date
      const { error: deleteError } = await supabase
        .from('disease_scout_zones')
        .delete()
        .eq('farm_id', farmId)
        .eq('scan_date', scanDate)
        .eq('status', 'pending');
      if (deleteError) throw new Error(`Failed to clear old disease scout zones: ${deleteError.message}`);

      for (let i = 0; i < scoutZones.length; i++) {
        const { data: zoneRow, error: zoneError } = await supabase
          .from('disease_scout_zones')
          .insert({
            farm_id:           farmId,
            scan_date:         scanDate,
            zone_rank:         i + 1,
            centroid_lat:      scoutZones[i].centroid_lat,
            centroid_lng:      scoutZones[i].centroid_lng,
            radius_meters:     scoutZones[i].radius_meters,
            disease_candidates: scoutZones[i].disease_candidates,
            max_risk_score:    scoutZones[i].max_risk_score,
            cell_count:        scoutZones[i].cell_count,
            hotspot_z:         scoutZones[i].hotspot_z,
            significance:      scoutZones[i].significance,
            crop,
            growth_stage:      body.growth_stage ?? growthStage,
          })
          .select()
          .maybeSingle();
        if (zoneError) throw new Error(`Failed to insert disease scout zone: ${zoneError.message}`);
        if (zoneRow) savedZones.push(zoneRow);
      }
    }

    const highRiskCells = riskCells.filter((c) => c.composite_risk >= SCOUT_ZONE_MIN_RISK).length;

    return successResponse({
      scan_date: scanDate,
      crop,
      growth_stage: growthStage,
      season,
      images_analyzed: imageCount,
      risk_cells_count: riskCells.length,
      high_risk_cells: highRiskCells,
      scout_zones: savedZones.length > 0 ? savedZones : scoutZones,
      weather_context: {
        hours_blast_temp_window: weather.hours_temp_20_28c,
        leaf_wetness_hours: weather.leaf_wetness_hours,
        total_rain_mm: weather.total_rain_mm,
        mean_temp_c: weather.mean_temp_c,
      },
      top_disease_risks: riskCells.length > 0
        ? Object.fromEntries(
            ['rice_blast','sheath_blight','bacterial_leaf_blight','downy_mildew','leaf_spot','charcoal_rot']
              .map((d) => {
                const vals = riskCells.map((c) => c.per_disease[d] ?? 0);
                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                return [d, Number(mean.toFixed(3))];
              })
              .filter(([, v]) => (v as number) > 0)
          )
        : {},
    });

  } catch (err) {
    return errorResponse('disease-risk-screen failed', 500, err);
  }
});
