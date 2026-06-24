/**
 * weather-pressure.ts
 *
 * Layer 1 of the Weather-First Disease Pressure Engine.
 *
 * Responsibilities:
 *   1. Fetch full hourly weather from Open-Meteo (past 7 days + next 7 days)
 *   2. Engineer disease-ready derived features from raw hourly data
 *   3. Compute disease-specific infection pressure scores [0,1] per day
 *
 * Design principles:
 *   - Disease risk STARTS here, from microclimate conditions.
 *   - Satellite data (Layer 2) confirms whether the crop is responding.
 *   - Pressure = pathogen had the right window. Response = crop shows it.
 *
 * References:
 *   - Open-Meteo API: https://open-meteo.com/en/docs
 *   - Open-Meteo Historical Forecast: https://open-meteo.com/en/docs/historical-forecast-api
 *   - Yoshino blast model approximation (temp × wetness window)
 *   - ICAR-CRRI sheath blight epidemiology guidelines
 *   - Sci. Reports 2025: doi:10.1038/s41598-025-18613-7
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HourlyWeatherRow {
  timestamp: string;           // ISO datetime
  temp_2m: number;             // °C
  rh_2m: number;               // %
  dewpoint_2m: number;         // °C
  dewpoint_depression: number; // T - Tdew °C
  vpd: number;                 // kPa
  rain_mm: number;             // mm/h
  wind_speed: number;          // m/s
  wind_gust: number;           // m/s
  cloud_cover: number;         // %
  soil_temp_0_6cm: number;     // °C
  soil_moisture_0_9cm: number; // m³/m³
  et0: number;                 // mm/h
  leaf_wetness_probability: number; // 0–1 (daily backfilled to each hour)
}

export interface DailyWeatherFeatures {
  date: string;                    // YYYY-MM-DD
  // Wetness
  leaf_wetness_hours: number;      // hours where RH>=90 OR lwp>=0.5 OR dewdep<=2
  night_rh_hours: number;          // 18:00–06:00 hours with RH>=90
  consecutive_wet_days?: number;   // computed externally from a run of days
  // Rainfall
  rain_24h: number;
  rain_72h: number;
  rain_7d: number;
  storm_flag: boolean;             // any hour with rain >= 5mm
  rain_splash_pressure: number;    // rain_24h + 0.5*rain_72h + storm_flag*20
  // Temperature suitability
  temp_suitability_blast: number;  // Gaussian [0,1] optimal 20-28°C, σ=4
  temp_suitability_blight: number; // Gaussian [0,1] optimal 26°C, σ=6
  temp_suitability_mildew: number; // Gaussian [0,1] optimal 20°C, σ=5 (cool-moist)
  // VPD / stress
  vpd_mean: number;
  vpd_max: number;
  dry_stress_score: number;        // [0,1] — high VPD + low soil moisture
  soil_moisture_score: number;     // [0,1] mean of daily soil moisture
  // Disease pressure (Layer 1 final outputs)
  blast_weather_pressure: number;
  sheath_blight_pressure: number;
  blb_pressure: number;
  downy_mildew_pressure: number;
  leaf_spot_pressure: number;
  charcoal_rot_pressure: number;
  // Forecast flag
  is_forecast: boolean;
}

export interface WeatherFetchResult {
  historical: DailyWeatherFeatures[];  // past 7 days
  forecast: DailyWeatherFeatures[];    // next 7 days
  raw_hourly: HourlyWeatherRow[];      // all 14 days of hourly data
  lat: number;
  lng: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Open-Meteo API
// ---------------------------------------------------------------------------

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dewpoint_2m',
  'precipitation',
  'windspeed_10m',
  'windgusts_10m',
  'cloudcover',
  'soil_temperature_0_to_6cm',
  'soil_moisture_0_to_9cm',
  'et0_fao_evapotranspiration',
  'vapour_pressure_deficit',
].join(',');

const DAILY_VARS = 'leaf_wetness_probability_mean';

/**
 * Fetch 7 past days + 7 forecast days of hourly weather from Open-Meteo.
 * Returns raw arrays indexed by hour (0 = 168h ago, etc.)
 */
async function fetchOpenMeteoHourly(lat: number, lng: number): Promise<{
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  dewpoint_2m: number[];
  precipitation: number[];
  windspeed_10m: number[];
  windgusts_10m: number[];
  cloudcover: number[];
  soil_temperature_0_to_6cm: number[];
  soil_moisture_0_to_9cm: number[];
  et0_fao_evapotranspiration: number[];
  vapour_pressure_deficit: number[];
  daily_leaf_wetness: Record<string, number>; // date -> LWP
}> {
  const url =
    `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_VARS}` +
    `&daily=${DAILY_VARS}` +
    `&past_days=7&forecast_days=7` +
    `&timezone=Asia%2FKolkata` +
    `&timeformat=iso8601`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const h = data.hourly ?? {};
  const d = data.daily ?? {};

  // Build daily LWP map: date -> leaf_wetness_probability
  const lwpMap: Record<string, number> = {};
  const dailyTimes: string[] = d.time ?? [];
  const dailyLwp: number[] = d.leaf_wetness_probability_mean ?? [];
  for (let i = 0; i < dailyTimes.length; i++) {
    lwpMap[dailyTimes[i].split('T')[0]] = dailyLwp[i] ?? 0;
  }

  return {
    time: h.time ?? [],
    temperature_2m: h.temperature_2m ?? [],
    relative_humidity_2m: h.relative_humidity_2m ?? [],
    dewpoint_2m: h.dewpoint_2m ?? [],
    precipitation: h.precipitation ?? [],
    windspeed_10m: h.windspeed_10m ?? [],
    windgusts_10m: h.windgusts_10m ?? [],
    cloudcover: h.cloudcover ?? [],
    soil_temperature_0_to_6cm: h.soil_temperature_0_to_6cm ?? [],
    soil_moisture_0_to_9cm: h.soil_moisture_0_to_9cm ?? [],
    et0_fao_evapotranspiration: h.et0_fao_evapotranspiration ?? [],
    vapour_pressure_deficit: h.vapour_pressure_deficit ?? [],
    daily_leaf_wetness: lwpMap,
  };
}

// ---------------------------------------------------------------------------
// Derived feature helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Gaussian temperature suitability kernel.
 * Returns [0,1]: 1 at T_opt, falls off with σ.
 * Lets us model disease as a window event, not a binary threshold.
 */
function gaussianTSuitability(temp: number, tOpt: number, sigma: number): number {
  return Math.exp(-((temp - tOpt) ** 2) / (2 * sigma * sigma));
}

/**
 * Aggregate hourly rows for a single calendar date (IST = UTC+5:30).
 * Computes all derived features + disease pressure scores.
 */
function aggregateDayFeatures(
  hours: HourlyWeatherRow[],
  allRainByDate: Map<string, number[]>, // for 72h / 7d windows
  date: string,
  isForecast: boolean,
  crop: 'rice' | 'millet',
  stage: string,
): DailyWeatherFeatures {
  const temps = hours.map((h) => h.temp_2m);
  const rhs = hours.map((h) => h.rh_2m);
  const dewdeps = hours.map((h) => h.dewpoint_depression);
  const lwps = hours.map((h) => h.leaf_wetness_probability);
  const rains = hours.map((h) => h.rain_mm);
  const soilMoist = hours.map((h) => h.soil_moisture_0_9cm).filter((v) => !isNaN(v));
  const vpds = hours.map((h) => h.vpd);

  // Leaf wetness hours: RH>=90 OR LWP>=0.5 OR dewpoint_depression<=2
  const leafWetHours = hours.filter(
    (h) => h.rh_2m >= 90 || h.leaf_wetness_probability >= 0.5 || h.dewpoint_depression <= 2,
  ).length;

  // Night RH hours (18:00–06:00)
  const nightRhHours = hours.filter((h) => {
    const hour = new Date(h.timestamp).getUTCHours(); // IST hours approximated
    return (hour >= 18 || hour < 6) && h.rh_2m >= 90;
  }).length;

  // Rainfall
  const rain24h = rains.reduce((s, v) => s + (v || 0), 0);
  const stormFlag = rains.some((r) => r >= 5);

  // Collect multi-day rain from the map
  const collectRainDays = (nDays: number): number => {
    let total = 0;
    const target = new Date(date);
    for (let d = 0; d < nDays; d++) {
      const key = new Date(target.getTime() - d * 86400000).toISOString().split('T')[0];
      const dayRain = allRainByDate.get(key);
      if (dayRain) total += dayRain.reduce((s, v) => s + v, 0);
    }
    return total;
  };
  const rain72h = collectRainDays(3);
  const rain7d = collectRainDays(7);
  const rainSplashPressure = clamp01(rain24h / 40) + 0.5 * clamp01(rain72h / 80) + (stormFlag ? 0.2 : 0);

  // Temperature suitability (mean of day's temps)
  const meanTemp = temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : 25;
  const tempSuitBlast = gaussianTSuitability(meanTemp, 24, 4);    // optimal 20-28, peak ~24
  const tempSuitBlight = gaussianTSuitability(meanTemp, 26, 6);   // warm-moist, broader
  const tempSuitMildew = gaussianTSuitability(meanTemp, 20, 5);   // cool-moist

  // VPD
  const vpdMean = vpds.length ? vpds.reduce((s, v) => s + v, 0) / vpds.length : 0;
  const vpdMax = vpds.length ? Math.max(...vpds) : 0;

  // Soil moisture score (0 = very dry = drought risk)
  const soilMoistMean = soilMoist.length ? soilMoist.reduce((s, v) => s + v, 0) / soilMoist.length : 0.2;
  const soilMoistureScore = clamp01(soilMoistMean / 0.35); // 0.35 m³/m³ = near field capacity

  // Dry stress (high VPD + low soil moisture → charcoal rot / abiotic)
  const dryStressScore = clamp01((vpdMax / 3.0) * 0.5 + (1 - soilMoistureScore) * 0.5);

  // Wetness score (shared)
  const wetnessScore = clamp01(leafWetHours / 14);   // 14h = saturation
  const nightRhScore = clamp01(nightRhHours / 10);

  // -----------------------------------------------------------------------
  // Disease-specific pressure models (Layer 1)
  // -----------------------------------------------------------------------

  // Rice Blast: warm nights + extended leaf wetness + blast temp window
  const blastWeatherPressure = clamp01(
    tempSuitBlast * 0.35
    + wetnessScore * 0.35
    + nightRhScore * 0.20
    + clamp01(rain24h / 30) * 0.10,
  );

  // Sheath Blight: warm + humid + post-tillering dense canopy
  const sheathBlightPressure = clamp01(
    tempSuitBlight * 0.30
    + wetnessScore * 0.30
    + nightRhScore * 0.25
    + clamp01(rain24h / 50) * 0.15,
  );

  // Bacterial Leaf Blight: storm + rain splash + wet field + warm
  const blbPressure = clamp01(
    clamp01(rainSplashPressure) * 0.40
    + wetnessScore * 0.30
    + tempSuitBlight * 0.20
    + soilMoistureScore * 0.10,
  );

  // Downy Mildew (millet): cool + moist + early seedling stage
  const downyMildewPressure = clamp01(
    tempSuitMildew * 0.35
    + wetnessScore * 0.35
    + nightRhScore * 0.20
    + soilMoistureScore * 0.10,
  );

  // Leaf Spot (millet): moderate-warm + wet canopy + frequent rain
  const leafSpotPressure = clamp01(
    tempSuitBlight * 0.30
    + wetnessScore * 0.35
    + clamp01(rain7d / 80) * 0.35,
  );

  // Charcoal Rot (rabi jowar): HIGH VPD + DRY soil + hot days
  const charcoalRotPressure = clamp01(
    dryStressScore * 0.60
    + clamp01((vpdMax - 1.5) / 2.5) * 0.40,
  );

  return {
    date,
    leaf_wetness_hours: leafWetHours,
    night_rh_hours: nightRhHours,
    rain_24h: rain24h,
    rain_72h: rain72h,
    rain_7d: rain7d,
    storm_flag: stormFlag,
    rain_splash_pressure: Number(rainSplashPressure.toFixed(3)),
    temp_suitability_blast: Number(tempSuitBlast.toFixed(3)),
    temp_suitability_blight: Number(tempSuitBlight.toFixed(3)),
    temp_suitability_mildew: Number(tempSuitMildew.toFixed(3)),
    vpd_mean: Number(vpdMean.toFixed(3)),
    vpd_max: Number(vpdMax.toFixed(3)),
    dry_stress_score: Number(dryStressScore.toFixed(3)),
    soil_moisture_score: Number(soilMoistureScore.toFixed(3)),
    blast_weather_pressure: Number(blastWeatherPressure.toFixed(3)),
    sheath_blight_pressure: Number(sheathBlightPressure.toFixed(3)),
    blb_pressure: Number(blbPressure.toFixed(3)),
    downy_mildew_pressure: Number(downyMildewPressure.toFixed(3)),
    leaf_spot_pressure: Number(leafSpotPressure.toFixed(3)),
    charcoal_rot_pressure: Number(charcoalRotPressure.toFixed(3)),
    is_forecast: isForecast,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch and process 14 days (7 past + 7 forecast) of weather for a farm centroid.
 * Returns structured daily features and raw hourly rows for DB storage.
 */
export async function fetchWeatherPressure(
  lat: number,
  lng: number,
  crop: 'rice' | 'millet' = 'rice',
  stage: string = 'tillering',
): Promise<WeatherFetchResult> {
  const raw = await fetchOpenMeteoHourly(lat, lng);

  // Group hourly rows by date (YYYY-MM-DD) for multi-day rain windows
  const hoursByDate = new Map<string, HourlyWeatherRow[]>();
  const allRainByDate = new Map<string, number[]>();

  const processedHourly: HourlyWeatherRow[] = [];

  for (let i = 0; i < raw.time.length; i++) {
    const tsStr = raw.time[i];
    const date = tsStr.split('T')[0];
    const lwp = raw.daily_leaf_wetness[date] ?? 0;
    const temp = raw.temperature_2m[i] ?? 20;
    const dew = raw.dewpoint_2m[i] ?? 15;
    const rain = raw.precipitation[i] ?? 0;
    const vpd = raw.vapour_pressure_deficit[i] ?? 1;

    const row: HourlyWeatherRow = {
      timestamp: tsStr,
      temp_2m: temp,
      rh_2m: raw.relative_humidity_2m[i] ?? 70,
      dewpoint_2m: dew,
      dewpoint_depression: Number((temp - dew).toFixed(2)),
      vpd: vpd > 0 ? vpd : 0,
      rain_mm: rain,
      wind_speed: raw.windspeed_10m[i] ?? 0,
      wind_gust: raw.windgusts_10m[i] ?? 0,
      cloud_cover: raw.cloudcover[i] ?? 0,
      soil_temp_0_6cm: raw.soil_temperature_0_to_6cm[i] ?? temp,
      soil_moisture_0_9cm: raw.soil_moisture_0_to_9cm[i] ?? 0.2,
      et0: raw.et0_fao_evapotranspiration[i] ?? 0,
      leaf_wetness_probability: lwp,
    };
    processedHourly.push(row);
    if (!hoursByDate.has(date)) hoursByDate.set(date, []);
    hoursByDate.get(date)!.push(row);
    if (!allRainByDate.has(date)) allRainByDate.set(date, []);
    allRainByDate.get(date)!.push(rain);
  }

  const today = new Date().toISOString().split('T')[0];
  const historical: DailyWeatherFeatures[] = [];
  const forecast: DailyWeatherFeatures[] = [];

  for (const [date, hours] of hoursByDate) {
    const isForecast = date >= today;
    const features = aggregateDayFeatures(hours, allRainByDate, date, isForecast, crop, stage);
    if (isForecast) {
      forecast.push(features);
    } else {
      historical.push(features);
    }
  }

  historical.sort((a, b) => a.date.localeCompare(b.date));
  forecast.sort((a, b) => a.date.localeCompare(b.date));

  return {
    historical,
    forecast,
    raw_hourly: processedHourly,
    lat,
    lng,
    source: 'open-meteo',
  };
}

/**
 * Get the most representative daily feature for "today".
 * Uses the last historical day. Returns null if no data.
 */
export function getTodayPressure(result: WeatherFetchResult): DailyWeatherFeatures | null {
  if (result.historical.length === 0) return null;
  return result.historical[result.historical.length - 1];
}

/**
 * Get forward 3-day and 7-day max pressure scores (worst-case window)
 * for a specific disease — used for the forecast risk output.
 */
export function getForwardPressure(
  result: WeatherFetchResult,
  disease: 'blast' | 'sheath_blight' | 'blb' | 'downy_mildew' | 'leaf_spot' | 'charcoal_rot',
): { forecast_3d: number; forecast_7d: number } {
  const key = `${disease === 'blast' ? 'blast_weather_pressure' : disease + '_pressure'}` as keyof DailyWeatherFeatures;
  const pressureKey = disease === 'blast' ? 'blast_weather_pressure' : `${disease}_pressure` as keyof DailyWeatherFeatures;

  const scores = result.forecast.map((d) => (d[pressureKey] as number) ?? 0);
  const max3d = scores.slice(0, 3).reduce((a, b) => Math.max(a, b), 0);
  const max7d = scores.slice(0, 7).reduce((a, b) => Math.max(a, b), 0);

  return {
    forecast_3d: Number(max3d.toFixed(3)),
    forecast_7d: Number(max7d.toFixed(3)),
  };
}

/**
 * Build a human-readable reason string from the top weather drivers.
 * Used in the advisory message generation.
 */
export function buildWeatherReasonSummary(day: DailyWeatherFeatures): string {
  const reasons: string[] = [];
  if (day.leaf_wetness_hours >= 8) reasons.push(`${day.leaf_wetness_hours}h leaf wetness`);
  if (day.temp_suitability_blast >= 0.65) reasons.push('blast temp window (20-28°C)');
  if (day.night_rh_hours >= 6) reasons.push(`${day.night_rh_hours}h night RH ≥90%`);
  if (day.storm_flag) reasons.push('storm / rain-splash event');
  if (day.rain_24h >= 20) reasons.push(`${day.rain_24h.toFixed(0)}mm in 24h`);
  if (day.dry_stress_score >= 0.6) reasons.push('high VPD + dry soil (abiotic risk)');
  if (reasons.length === 0) reasons.push('moderate conditions');
  return reasons.slice(0, 3).join(' + ');
}
