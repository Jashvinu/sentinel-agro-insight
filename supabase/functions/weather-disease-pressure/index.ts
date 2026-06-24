/**
 * weather-disease-pressure
 *
 * The Weather-First Disease Pressure Engine — primary entry point.
 *
 * Architecture:
 *   Layer 1 — Weather infection pressure (weather-pressure.ts)
 *     - Fetches 7-day historical + 7-day forecast hourly from Open-Meteo
 *     - Engineers: leaf_wetness_hours, dewpoint_depression, VPD, rain_splash
 *     - Computes Gaussian temp suitability + disease-specific pressure scores
 *
 *   Layer 2 — Satellite anomaly confirmation (remote-sensing-features.ts)
 *     - Cloud Score+ weighted Sentinel-2 composites (monsoon-safe)
 *     - Time-series z-scores: NDVI, NDRE, CIre, NDMI vs. plot's own baseline
 *     - New indices: NDRE, MSI, SIPI
 *     - SAR: Sentinel-1 VV/VH wetness anomaly (cloud-penetrating)
 *     - satelliteAnomalyResponse() → per-disease confirmation scores [0,1]
 *
 *   Combiner (disease-models.ts: calibratedRisk)
 *     - Geometric mean when both signals are strong
 *     - Abiotic suppressor (hot + dry + uniform = drought, not disease)
 *     - Confidence levels: low / medium / medium-high / high
 *
 *   Output — human-readable advisory message:
 *     "High infection pressure from weather (14h leaf wetness + blast temp 22-26°C).
 *      Satellite confirms: CIre decline + NDMI anomaly.
 *      Scout within 24-48h. Confidence: medium-high.
 *      Spray window open if confirmed."
 *
 * POST /weather-disease-pressure
 * Body: {
 *   farm_id: string,
 *   crop?: 'rice' | 'millet',
 *   growth_stage?: string,
 *   season?: 'kharif' | 'rabi',
 *   geometry?: GeoJSON,        // optional override
 *   use_satellite?: boolean,   // default true; set false for weather-only mode
 * }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import ee from 'npm:@google/earthengine@1.6.13';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { initializeEarthEngine } from '../_shared/satellite-utils.ts';
import { geoJsonToEarthEngine } from '../_shared/satellite-utils.ts';
import {
  fetchWeatherPressure,
  getTodayPressure,
  getForwardPressure,
  buildWeatherReasonSummary,
  type DailyWeatherFeatures,
} from '../_shared/weather-pressure.ts';
import {
  fetchSatelliteSnapshot,
  satelliteAnomalyResponse,
  type RemoteSensingSnapshot,
  type SatelliteAnomalyResponse,
} from '../_shared/remote-sensing-features.ts';
import {
  calibratedRisk,
  buildAdvisoryMessage,
  parseGrowthStage,
  type DiseaseName,
  type CalibratedRiskOutput,
} from '../_shared/disease-models.ts';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function createSupabaseClient(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Get diseases applicable for a crop + season */
function getApplicableDiseases(
  crop: 'rice' | 'millet',
  season: 'kharif' | 'rabi',
): DiseaseName[] {
  if (crop === 'rice') {
    return ['rice_blast', 'sheath_blight', 'bacterial_leaf_blight'];
  }
  const milletDiseases: DiseaseName[] = ['downy_mildew', 'leaf_spot'];
  if (season === 'rabi') milletDiseases.push('charcoal_rot');
  return milletDiseases;
}

/** Map DiseaseName → weather pressure key in DailyWeatherFeatures */
function getWeatherPressureForDisease(
  disease: DiseaseName,
  today: DailyWeatherFeatures,
): number {
  switch (disease) {
    case 'rice_blast': return today.blast_weather_pressure;
    case 'sheath_blight': return today.sheath_blight_pressure;
    case 'bacterial_leaf_blight': return today.blb_pressure;
    case 'downy_mildew': return today.downy_mildew_pressure;
    case 'leaf_spot': return today.leaf_spot_pressure;
    case 'charcoal_rot': return today.charcoal_rot_pressure;
    default: return 0;
  }
}

/** Map DiseaseName → satellite anomaly response key */
function getSatResponseForDisease(
  disease: DiseaseName,
  satResponse: SatelliteAnomalyResponse,
): number {
  switch (disease) {
    case 'rice_blast': return satResponse.rice_blast;
    case 'sheath_blight': return satResponse.sheath_blight;
    case 'bacterial_leaf_blight': return satResponse.bacterial_leaf_blight;
    case 'downy_mildew': return satResponse.downy_mildew;
    case 'leaf_spot': return satResponse.leaf_spot;
    case 'charcoal_rot': return satResponse.charcoal_rot;
    default: return 0;
  }
}

/** Map DiseaseName → forward pressure key for forecasts */
function getForwardPressureKey(d: DiseaseName): Parameters<typeof getForwardPressure>[1] {
  if (d === 'rice_blast') return 'blast';
  if (d === 'sheath_blight') return 'sheath_blight';
  if (d === 'bacterial_leaf_blight') return 'blb';
  if (d === 'downy_mildew') return 'downy_mildew';
  if (d === 'leaf_spot') return 'leaf_spot';
  return 'charcoal_rot';
}

// Needed for getForwardPressure import
import { getForwardPressure } from '../_shared/weather-pressure.ts';

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const farmId       = String(body.farm_id ?? '');
    const crop         = (String(body.crop ?? 'rice').toLowerCase() === 'millet' ? 'millet' : 'rice') as 'rice' | 'millet';
    const season       = (String(body.season ?? 'kharif').toLowerCase() === 'rabi' ? 'rabi' : 'kharif') as 'kharif' | 'rabi';
    const growthStage  = parseGrowthStage(body.growth_stage);
    const useSatellite = body.use_satellite !== false; // default true
    const today        = new Date().toISOString().split('T')[0];

    const supabase = createSupabaseClient(req);

    // 1. Load farm geometry & centroid
    let geometry = body.geometry;
    let farmLat = 0;
    let farmLng = 0;

    if (!geometry && farmId) {
      const { data: farm } = await supabase
        .from('farms')
        .select('geometry, bounds')
        .eq('id', farmId)
        .maybeSingle();
      if (farm?.geometry) geometry = farm.geometry;
      if (farm?.bounds && Array.isArray(farm.bounds) && farm.bounds.length >= 2) {
        farmLat = ((farm.bounds[0][0] ?? 0) + (farm.bounds[1][0] ?? 0)) / 2;
        farmLng = ((farm.bounds[0][1] ?? 0) + (farm.bounds[1][1] ?? 0)) / 2;
      }
    }
    if (!geometry) return errorResponse('farm geometry required', 400);

    // Derive centroid from geometry if not from bounds
    if (!farmLat && !farmLng) {
      const coords: number[][][] = geometry.type === 'Polygon'
        ? geometry.coordinates
        : geometry.coordinates.flat();
      const allPts = coords.flat();
      farmLng = allPts.reduce((s: number, p: number[]) => s + p[0], 0) / allPts.length;
      farmLat = allPts.reduce((s: number, p: number[]) => s + p[1], 0) / allPts.length;
    }

    // 2. Layer 1 — Weather infection pressure
    const weatherResult = await fetchWeatherPressure(farmLat, farmLng, crop, growthStage);
    const todayFeatures = getTodayPressure(weatherResult);
    if (!todayFeatures) {
      return errorResponse('Failed to fetch weather data from Open-Meteo', 503);
    }

    // 3. Layer 2 — Satellite anomaly response (optional, fails gracefully)
    let satSnapshot: RemoteSensingSnapshot | null = null;
    let satResponse: SatelliteAnomalyResponse | null = null;

    if (useSatellite) {
      try {
        await initializeEarthEngine();
        const eeGeometry = geoJsonToEarthEngine(geometry);
        satSnapshot = await fetchSatelliteSnapshot(eeGeometry, today, 30);
        if (satSnapshot) {
          satResponse = satelliteAnomalyResponse(satSnapshot);
        }
      } catch (eeErr) {
        // GEE unavailable — proceed with weather-only mode
        console.warn('GEE initialization failed, proceeding in weather-only mode:', eeErr);
      }
    }

    const satDataQuality = satResponse?.data_quality ?? 'no_data';
    const abioticProb = satResponse?.abiotic_stress ?? 0;

    // 4. Combiner — calibrate risk for each applicable disease
    const applicableDiseases = getApplicableDiseases(crop, season);
    const calibratedOutputs: CalibratedRiskOutput[] = [];

    for (const disease of applicableDiseases) {
      const weatherPressure  = getWeatherPressureForDisease(disease, todayFeatures);
      const satelliteResp    = satResponse ? getSatResponseForDisease(disease, satResponse) : 0;
      const output = calibratedRisk(disease, weatherPressure, satelliteResp, abioticProb, satDataQuality);
      calibratedOutputs.push(output);
    }

    calibratedOutputs.sort((a, b) => b.final_risk - a.final_risk);
    const topOutput = calibratedOutputs[0];
    const topDisease = topOutput.final_risk > 0.15 ? topOutput.disease : null;
    const compositeRisk = topOutput?.final_risk ?? 0;

    // 5. Forecast risk (3d, 7d) from weather forward window
    const forecastKey = topDisease ? getForwardPressureKey(topDisease) : 'blast';
    const { forecast_3d, forecast_7d } = getForwardPressure(weatherResult, forecastKey);

    // 6. Build advisory message
    const weatherReason = buildWeatherReasonSummary(todayFeatures);
    const satSignals = satResponse?.primary_signals ?? [];
    const { message, reason_summary } = buildAdvisoryMessage(
      topDisease,
      topOutput,
      weatherReason,
      satSignals,
      forecast_3d,
      forecast_7d,
    );

    const sprayWindowFlag = compositeRisk >= 0.60 && topOutput.primary_driver !== 'abiotic';

    // 7. Persist to DB
    const diseaseBreakdown: Record<string, number> = {};
    for (const o of calibratedOutputs) {
      diseaseBreakdown[o.disease] = o.final_risk;
    }

    const riskRow = {
      farm_id: farmId || null,
      date: today,
      crop,
      stage: body.growth_stage ?? growthStage,
      // Weather pressures
      rice_blast_weather_pressure:  todayFeatures.blast_weather_pressure,
      sheath_blight_pressure:       todayFeatures.sheath_blight_pressure,
      blb_pressure:                 todayFeatures.blb_pressure,
      downy_mildew_pressure:        todayFeatures.downy_mildew_pressure,
      leaf_spot_pressure:           todayFeatures.leaf_spot_pressure,
      charcoal_rot_pressure:        todayFeatures.charcoal_rot_pressure,
      // Satellite responses
      rice_blast_satellite_response:    satResponse?.rice_blast ?? null,
      sheath_blight_satellite_response: satResponse?.sheath_blight ?? null,
      blb_satellite_response:           satResponse?.bacterial_leaf_blight ?? null,
      downy_mildew_satellite_response:  satResponse?.downy_mildew ?? null,
      leaf_spot_satellite_response:     satResponse?.leaf_spot ?? null,
      charcoal_rot_satellite_response:  satResponse?.charcoal_rot ?? null,
      abiotic_stress_probability:       abioticProb,
      // Final risks per disease
      rice_blast_final_risk:      calibratedOutputs.find((o) => o.disease === 'rice_blast')?.final_risk ?? null,
      sheath_blight_final_risk:   calibratedOutputs.find((o) => o.disease === 'sheath_blight')?.final_risk ?? null,
      blb_final_risk:             calibratedOutputs.find((o) => o.disease === 'bacterial_leaf_blight')?.final_risk ?? null,
      downy_mildew_final_risk:    calibratedOutputs.find((o) => o.disease === 'downy_mildew')?.final_risk ?? null,
      leaf_spot_final_risk:       calibratedOutputs.find((o) => o.disease === 'leaf_spot')?.final_risk ?? null,
      charcoal_rot_final_risk:    calibratedOutputs.find((o) => o.disease === 'charcoal_rot')?.final_risk ?? null,
      composite_risk:             compositeRisk,
      top_disease:                topDisease,
      forecast_3d_risk:           forecast_3d,
      forecast_7d_risk:           forecast_7d,
      confidence:                 topOutput.confidence,
      primary_driver:             topOutput.primary_driver,
      scout_priority:             topOutput.scout_priority,
      spray_window_flag:          sprayWindowFlag,
      recommended_action:         message,
      reason_summary,
      satellite_available:        satSnapshot !== null,
      satellite_source:           satSnapshot?.source ?? null,
      weather_source:             'open-meteo',
    };

    if (farmId) {
      await supabase
        .from('disease_risk_daily')
        .upsert(riskRow, { onConflict: 'farm_id,date' });

      // Also store raw hourly weather (last 7 days)
      if (weatherResult.raw_hourly.length > 0) {
        const hourlyRows = weatherResult.raw_hourly.map((h) => ({
          farm_id: farmId,
          timestamp: h.timestamp,
          temp_2m: h.temp_2m,
          rh_2m: h.rh_2m,
          dewpoint_2m: h.dewpoint_2m,
          dewpoint_depression: h.dewpoint_depression,
          vpd: h.vpd,
          rain_mm: h.rain_mm,
          wind_speed: h.wind_speed,
          wind_gust: h.wind_gust,
          cloud_cover: h.cloud_cover,
          soil_temp_0_6cm: h.soil_temp_0_6cm,
          soil_moisture_0_9cm: h.soil_moisture_0_9cm,
          et0: h.et0,
          leaf_wetness_probability: h.leaf_wetness_probability,
          source: 'open-meteo',
          model_run_id: null,
        }));
        // Upsert in batches of 200 (168 hours in 7 days)
        for (let i = 0; i < hourlyRows.length; i += 200) {
          await supabase
            .from('weather_hourly')
            .upsert(hourlyRows.slice(i, i + 200), {
              onConflict: 'farm_id,timestamp,model_run_id',
              ignoreDuplicates: true,
            });
        }
      }

      // Store satellite snapshot in remote_sensing_observations
      if (satSnapshot && farmId) {
        await supabase.from('remote_sensing_observations').upsert({
          farm_id: farmId,
          date: today,
          source: satSnapshot.source,
          cloud_score_plus: satSnapshot.cloud_score_plus,
          cloud_cover_pct: satSnapshot.cloud_cover_pct,
          ndvi: satSnapshot.ndvi,
          ndre: satSnapshot.ndre,
          cire: satSnapshot.cire,
          mtci: satSnapshot.mtci,
          ndmi: satSnapshot.ndmi,
          msi: satSnapshot.msi,
          dws: satSnapshot.dws,
          psri: satSnapshot.psri,
          sipi: satSnapshot.sipi,
          rbvi: satSnapshot.rbvi,
          ribinir: satSnapshot.ribinir,
          ribired: satSnapshot.ribired,
          redsi: satSnapshot.redsi,
          ndvi_cv: satSnapshot.ndvi_cv,
          ndvi_z_7d: satSnapshot.ndvi_z_7d,
          ndvi_z_14d: satSnapshot.ndvi_z_14d,
          ndvi_z_21d: satSnapshot.ndvi_z_21d,
          ndre_z_14d: satSnapshot.ndre_z_14d,
          cire_z_14d: satSnapshot.cire_z_14d,
          ndmi_z_14d: satSnapshot.ndmi_z_14d,
          vv: satSnapshot.vv,
          vh: satSnapshot.vh,
          vv_vh_ratio: satSnapshot.vv_vh_ratio,
          delta_vh_7d: satSnapshot.delta_vh_7d,
          delta_vh_14d: satSnapshot.delta_vh_14d,
          sar_wetness_anomaly: satSnapshot.sar_wetness_anomaly,
          lst_day: satSnapshot.lst_day,
          lst_night: satSnapshot.lst_night,
          lst_anomaly: satSnapshot.lst_anomaly,
        }, { onConflict: 'farm_id,date,source' });
      }
    }

    // 8. Response
    return successResponse({
      // Primary output
      risk_today: compositeRisk,
      risk_3d_forecast: forecast_3d,
      risk_7d_forecast: forecast_7d,
      confidence: topOutput.confidence,
      reason: reason_summary,
      scout_priority: topOutput.scout_priority,
      spray_window: sprayWindowFlag
        ? 'Open — prepare spray if field scouting confirms lesions'
        : 'Not open — continue monitoring',
      primary_driver: topOutput.primary_driver,
      advisory_message: message,
      // Disease breakdown
      disease_breakdown: diseaseBreakdown,
      top_disease: topDisease,
      // Weather context
      weather_context: {
        leaf_wetness_hours: todayFeatures.leaf_wetness_hours,
        night_rh_hours: todayFeatures.night_rh_hours,
        rain_24h: todayFeatures.rain_24h,
        rain_72h: todayFeatures.rain_72h,
        temp_suitability_blast: todayFeatures.temp_suitability_blast,
        storm_flag: todayFeatures.storm_flag,
        vpd_mean: todayFeatures.vpd_mean,
        dry_stress_score: todayFeatures.dry_stress_score,
      },
      // Satellite context
      satellite_context: satSnapshot ? {
        source: satSnapshot.source,
        data_quality: satDataQuality,
        cloud_score_plus: satSnapshot.cloud_score_plus,
        ndvi: satSnapshot.ndvi,
        ndre: satSnapshot.ndre,
        cire: satSnapshot.cire,
        ndmi: satSnapshot.ndmi,
        ndvi_z_14d: satSnapshot.ndvi_z_14d,
        abiotic_stress_probability: abioticProb,
        primary_signals: satSignals,
      } : { data_quality: 'no_data', reason: 'GEE unavailable or no images in window' },
      // Metadata
      date: today,
      crop,
      stage: growthStage,
      farm_id: farmId || null,
    });

  } catch (err) {
    return errorResponse('weather-disease-pressure failed', 500, err);
  }
});
