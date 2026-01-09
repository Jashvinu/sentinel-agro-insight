# Advanced Monitoring Local Server

Local Node.js server for compute-intensive Earth Engine operations. This server handles advanced monitoring requests locally to avoid Supabase Edge Function compute resource limits (error 546 - WORKER_LIMIT).

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Create a `.env` file in the `server` directory:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
   - `GOOGLE_CREDENTIALS_JSON`: Your Google Earth Engine service account credentials (JSON string)
   - `SUPABASE_URL`: Your Supabase project URL (optional, for caching)
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (optional, for caching)
   - `PORT`: Server port (default: 3000)

## Running the Server

### Development (with auto-reload):
```bash
npm run dev
```

### Production:
```bash
npm start
```

Or from the project root:
```bash
npm run server:dev    # Development mode
npm run server:start  # Production mode
```

The server will start on `http://localhost:3000` by default.

## API Endpoints

### POST `/advanced-monitoring`

Processes advanced monitoring analysis requests.

**Request Body:**
```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[lon, lat], ...]]
  },
  "farmId": "farm-id",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "algorithms": ["optram_moisture", "sar_moisture_change"],
  "includeTrends": true,
  "aggregationLevel": "grid",
  "windowSizeDays": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "timeseries": [...],
    "trends": [...],
    "metadata": {...}
  }
}
```

### GET `/health`

Health check endpoint.

## Features

- ✅ Multi-sensor fusion (Sentinel-2, Landsat-8, Landsat-9, Sentinel-1)
- ✅ OPTRAM soil moisture estimation
- ✅ SAR moisture change detection
- ✅ PCA-based nutrient estimation (Phosphorus, Potassium)
- ✅ Nitrogen estimation (GNDVI, NDRE)
- ✅ Sensor fusion with NDVI-based weighting
- ✅ Theil-Sen trend analysis
- ✅ Database caching (optional, via Supabase)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CREDENTIALS_JSON` | Yes | Google Earth Engine service account credentials as JSON string |
| `SUPABASE_URL` | No | Supabase project URL for caching |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key for caching |
| `PORT` | No | Server port (default: 3000) |

## Notes

- The server automatically uses the local endpoint when running on `localhost` or `127.0.0.1`
- Caching is optional but recommended for faster repeated queries
- Make sure your Google Earth Engine service account has the necessary permissions
