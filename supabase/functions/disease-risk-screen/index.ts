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
import {
  scoreCropDiseases,
  parseGrowthStage,
  type SpectralFeatures,
  type WeatherFeatures,
} from '../_shared/disease-models.ts';

const SCOUT_ZONE_MIN_RISK = 0.40;   // cells above this are candidates
const SCOUT_ZONE_MERGE_M  = 50;     // meters — merge radius for clustering
const SCOUT_ZONE_MAX      = 5;      // max scout zones returned per scan

function createSupabaseClient(req: Request) {
  const url  = Deno.env.get('SUPABASE_URL');
  const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? `Bearer ${key}` } },
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
}

/** Greedy radius merge → scout zones */
function clusterToZones(
  cells: RiskCell[],
  minRisk: number,
  mergeM: number,
  maxZones: number,
) {
  const candidates = cells
    .filter((c) => c.composite_risk >= minRisk)
    .sort((a, b) => b.composite_risk - a.composite_risk);

  const zones: Array<{
    centroid_lat: number;
    centroid_lng: number;
    radius_meters: number;
    disease_candidates: string[];
    max_risk_score: number;
    cell_count: number;
  }> = [];

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
    const allDiseases  = [...new Set(members.flatMap((c) => c.disease_candidates))];
    const maxRisk      = Math.max(...members.map((c) => c.composite_risk));

    zones.push({
      centroid_lat,
      centroid_lng,
      radius_meters: mergeM,
      disease_candidates: allDiseases,
      max_risk_score: maxRisk,
      cell_count: members.length,
    });
  }

  return zones;
}

/** Fetch Open-Meteo 7-day lookback weather for a lat/lng */
async function fetchWeatherRisk(lat: number, lng: number): Promise<WeatherFeatures> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lng}` +
      `&hourly=temperature_2m,relative_humidity_2m,precipitation` +
      `&past_days=7&forecast_days=1&timezone=Asia%2FKolkata`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();

    const temps: number[]    = data.hourly?.temperature_2m ?? [];
    const rhs: number[]      = data.hourly?.relative_humidity_2m ?? [];
    const rain: number[]     = data.hourly?.precipitation ?? [];

    const hours2028  = temps.filter((t) => t >= 20 && t <= 28).length;
    const leafWet    = rhs.filter((rh) => rh >= 80).length;
    const totalRain  = rain.reduce((s: number, v: number) => s + (v ?? 0), 0);
    const meanTemp   = temps.length > 0 ? temps.reduce((s, v) => s + v, 0) / temps.length : 26;
    const maxRh      = rhs.length > 0 ? Math.max(...rhs) : 80;

    return { hours_temp_20_28c: hours2028, leaf_wetness_hours: leafWet, max_rh_pct: maxRh, total_rain_mm: totalRain, mean_temp_c: meanTemp };
  } catch {
    // sensible kharif Maharashtra defaults on failure
    return { hours_temp_20_28c: 40, leaf_wetness_hours: 30, max_rh_pct: 82, total_rain_mm: 30, mean_temp_c: 26 };
  }
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
    const startDate = body.start_date ?? new Date(new Date(endDate).getTime() - 14 * 86400000)
      .toISOString().split('T')[0];

    // Load Sentinel-2 harmonized collection
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(eeGeometry)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map((img: any) => {
        return img.rename(['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B10','B11','B12','QA60'])
          .select(['B2','B3','B4','B5','B8','B11','B12'],
                  ['blue','green','red','rededge','nir','swir1','swir2'])
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

    // Also get baseline NDVI (prior 14–28 days)
    const baselineStart = new Date(new Date(startDate).getTime() - 14 * 86400000).toISOString().split('T')[0];
    const baselineCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(eeGeometry)
      .filterDate(baselineStart, startDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .map((img: any) =>
        img.select(['B4','B8'], ['red','nir']).multiply(0.0001)
          .normalizedDifference(['nir','red']).rename('NDVI')
      );
    const baselineNDVI = baselineCollection.size().gt(0)
      ? baselineCollection.median()
      : diseaseIndices.ndviImage; // fallback to current if no baseline

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
      moistureImage,
      baselineNDVI.rename ? baselineNDVI.rename('NDVI_baseline') : baselineNDVI,
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
    if (farmBounds) {
      farmLat = ((farmBounds[0][0] as number) + (farmBounds[1][0] as number)) / 2;
      farmLng = ((farmBounds[0][1] as number) + (farmBounds[1][1] as number)) / 2;
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

      const spec: SpectralFeatures = {
        ndvi:           props['NDVI']          ?? 0.3,
        ndvi_cv:        props['NDVI_CV']       ?? 0,
        rbvi:           props['RBVI']          ?? 0.2,
        cire:           props['CIre']          ?? 2.0,
        mtci:           props['MTCI']          ?? 1.5,
        dws:            props['DWS']           ?? 0,
        moisture:       props['moisture']      ?? 20,
        ndvi_baseline:  props['NDVI_baseline'] ?? props['NDVI'] ?? 0.3,
      };

      const cropRisk = scoreCropDiseases(crop, season, spec, weather, growthStage);

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
      });
    }

    // Persist risk cells to DB
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
      }));

      // upsert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        await supabase.from('disease_risk_cells').insert(rows.slice(i, i + 100));
      }
    }

    // Generate scout zones
    const scoutZones = clusterToZones(riskCells, SCOUT_ZONE_MIN_RISK, SCOUT_ZONE_MERGE_M, SCOUT_ZONE_MAX);

    // Persist scout zones
    const savedZones: any[] = [];
    if (farmId) {
      // delete old pending zones for this farm+date
      await supabase
        .from('disease_scout_zones')
        .delete()
        .eq('farm_id', farmId)
        .eq('scan_date', scanDate)
        .eq('status', 'pending');

      for (let i = 0; i < scoutZones.length; i++) {
        const { data: zoneRow } = await supabase
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
            crop,
            growth_stage:      body.growth_stage ?? growthStage,
          })
          .select()
          .maybeSingle();
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
