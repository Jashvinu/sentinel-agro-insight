# Agricultural Indices API Documentation

## Overview
This API provides access to various agricultural indices calculated using Google Earth Engine and Sentinel-2 satellite data. It supports multiple vegetation indices, soil properties, and nutrient content calculations.

## Base URL
```
http://localhost:3001/api
```

## Endpoints

### 1. Agricultural Indices (Primary Endpoint)
**GET** `/api/agricultural-indices`

#### Query Parameters
- `index` (optional): The type of index to calculate
  - Default: `msavi`
  - Options: `ndvi`, `evi`, `savi`, `msavi`, `ndwi`, `nitrogen`, `phosphorus`, `potassium`, `salinity`, `ph`, `moisture`, `carbon`
- `start` (optional): Start date in YYYY-MM-DD format
  - Default: `2024-01-01`
- `end` (optional): End date in YYYY-MM-DD format
  - Default: `2024-12-31`

#### Example Requests
```bash
# MSAVI (default)
GET /api/agricultural-indices

# NDVI with custom date range
GET /api/agricultural-indices?index=ndvi&start=2024-06-01&end=2024-08-31

# Nitrogen content
GET /api/agricultural-indices?index=nitrogen

# Salinity analysis
GET /api/agricultural-indices?index=salinity
```

#### Response Format
```json
{
  "success": true,
  "urlFormat": "https://earthengine.googleapis.com/v1alpha/projects/{projectId}/maps/{mapid}/tiles/{z}/{x}/{y}?token={token}",
  "mapid": "unique_map_id",
  "token": "access_token",
  "geojson": {
    "type": "Polygon",
    "coordinates": [[...]]
  },
  "poiPolygon": {
    "type": "Feature",
    "geometry": {...},
    "properties": {
      "name": "Field Area",
      "index": "MSAVI"
    }
  },
  "metadata": {
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "algorithm": "MSAVI",
    "dataSource": "Sentinel-2 SR Harmonized",
    "cloudFilter": "< 20%",
    "calculationMethod": "MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2 - Modified Soil Adjusted Vegetation Index"
  }
}
```

### 2. Legacy Earth Engine Endpoint
**GET** `/api/ee`

#### Query Parameters
- `index` (optional): The type of index to calculate
  - Default: `msavi`
  - Same options as above
- `start` (optional): Start date in YYYY-MM-DD format
  - Default: `2024-01-01`
- `end` (optional): End date in YYYY-MM-DD format
  - Default: `2024-12-31`

### 3. Health Check
**GET** `/api/health`

Returns server status information.

### 4. Earth Engine Test
**GET** `/api/ee-test`

Tests Earth Engine authentication and basic functionality.

## Available Indices

### Vegetation Indices
- **NDVI**: Normalized Difference Vegetation Index
- **EVI**: Enhanced Vegetation Index  
- **SAVI**: Soil Adjusted Vegetation Index
- **MSAVI**: Modified Soil Adjusted Vegetation Index
- **NDWI**: Normalized Difference Water Index

### Soil Properties
- **Nitrogen**: Nitrogen content in kg N/ha
- **Phosphorus**: Phosphorus content in kg P₂O₅/ha
- **Potassium**: Potassium content in kg K₂O/ha
- **Salinity**: Electrical Conductivity in dS/m
- **pH**: Soil pH estimation
- **Moisture**: Volumetric moisture content (%)
- **Carbon**: Soil Organic Carbon percentage (%)

## Frontend Integration

### Using the Tile URL
```javascript
const response = await fetch('/api/agricultural-indices?index=ndvi');
const data = await response.json();

if (data.success) {
    // For Google Maps or Leaflet
    const tileUrl = `https://earthengine.googleapis.com/v1alpha/projects/${projectId}/maps/${data.mapid}/tiles/{z}/{x}/{y}?token=${data.token}`;
    
    // Add to your map layer
    L.tileLayer(tileUrl, {
        attribution: 'Sentinel-2 Data via Google Earth Engine'
    }).addTo(map);
}
```

### Error Handling
```javascript
try {
    const response = await fetch('/api/agricultural-indices?index=ndvi');
    const data = await response.json();
    
    if (data.success) {
        // Process successful response
        console.log('Map ID:', data.mapid);
        console.log('Token:', data.token);
    } else {
        console.error('API Error:', data.message);
    }
} catch (error) {
    console.error('Request failed:', error);
}
```

## Data Sources
- **Satellite**: Sentinel-2 SR Harmonized Collection
- **Resolution**: 10m (native), 30m (processed)
- **Cloud Filter**: < 20% cloud coverage
- **Date Range**: Configurable via query parameters
- **Area**: Fixed polygon in Bangalore, India (coordinates: 77.77°E, 12.39°N)

## Environment Variables Required
```bash
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY=your-private-key
GOOGLE_CLIENT_EMAIL=your-client-email
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=your-cert-url
```

## Performance Notes
- Uses `scale=30` and `bestEffort=true` for faster processing
- Implements proper scaling factor (0.0001) for Sentinel-2 harmonized data
- Cloud filtering reduces processing time and improves data quality
- Median composite reduces noise and atmospheric effects

## Troubleshooting

### Common Issues
1. **Missing Environment Variables**: Check all required Google Cloud credentials
2. **Authentication Failures**: Verify service account permissions
3. **No Data Available**: Check date range and cloud coverage filters
4. **Tile Loading Issues**: Ensure proper mapid and token usage

### Debug Endpoints
- Use `/api/ee-test` to verify Earth Engine connectivity
- Check `/api/health` for server status
- Monitor console logs for detailed error information

## Rate Limits
- No explicit rate limiting implemented
- Consider implementing client-side throttling for production use
- Earth Engine has its own rate limits and quotas

## Support
For issues or questions, check the server logs and ensure all environment variables are properly configured.
