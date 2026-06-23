import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';

const REQUIRED_HOURLY_FIELDS = [
  'temperature_2m',
  'precipitation',
  'apparent_temperature',
  'wind_speed_10m',
  'cloud_cover',
  'weather_code',
] as const;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    const startDate = url.searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = url.searchParams.get('end_date') || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return errorResponse('latitude and longitude are required numeric query parameters', 400);
    }

    const upstream = new URL('https://api.open-meteo.com/v1/forecast');
    upstream.searchParams.set('latitude', String(latitude));
    upstream.searchParams.set('longitude', String(longitude));
    upstream.searchParams.set('hourly', REQUIRED_HOURLY_FIELDS.join(','));
    upstream.searchParams.set('start_date', startDate);
    upstream.searchParams.set('end_date', endDate);

    const response = await fetch(upstream);
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly?.time || !Array.isArray(hourly.time)) {
      throw new Error('Open-Meteo response missing hourly time array.');
    }

    for (const field of REQUIRED_HOURLY_FIELDS) {
      if (!Array.isArray(hourly[field]) || hourly[field].length !== hourly.time.length) {
        throw new Error(`Open-Meteo response missing valid hourly ${field} array.`);
      }
    }

    return successResponse({
      data: {
        hourly: {
          time: hourly.time,
          temperature_2m: hourly.temperature_2m,
          rain: hourly.precipitation,
          precipitation: hourly.precipitation,
          apparent_temperature: hourly.apparent_temperature,
          snowfall: new Array(hourly.time.length).fill(0),
          wind_speed_10m: hourly.wind_speed_10m,
          cloud_cover: hourly.cloud_cover,
          weather_code: hourly.weather_code,
        },
        location: {
          latitude: data.latitude,
          longitude: data.longitude,
          elevation: data.elevation,
          utcOffsetSeconds: data.utc_offset_seconds,
        },
      },
    });
  } catch (err) {
    return errorResponse('weather failed', 500, err);
  }
});
