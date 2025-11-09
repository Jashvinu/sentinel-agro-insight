import { VercelRequest, VercelResponse } from '@vercel/node';
import ee from '@google/earthengine';

// Earth Engine authentication function
function authenticate(serviceAccount: any) {
    return new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            serviceAccount,
            () =>
                ee.initialize(
                    null,
                    null,
                    () => resolve(undefined),
                    (error: any) => reject(new Error(error))
                ),
            (error: any) => reject(new Error(error))
        );
    });
}

// Function to get the image tile url with proper return structure
function getMapId(image: any, vis: any) {
    return new Promise((resolve, reject) => {
        image.getMapId(vis, (obj: any, error: any) => {
            if (error) {
                reject(new Error(error));
            } else {
                resolve({
                    urlFormat: obj.urlFormat,
                    mapid: obj.mapid,
                    token: obj.token
                });
            }
        });
    });
}

// Function to get calculation method description for each index
function getCalculationMethod(index: string) {
    const methods: { [key: string]: string } = {
        'ndvi': 'NDVI = (NIR - Red) / (NIR + Red) - Normalized Difference Vegetation Index',
        'evi': 'EVI = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1) - Enhanced Vegetation Index',
        'savi': 'SAVI = (NIR - Red) × (1 + L) / (NIR + Red + L) - Soil Adjusted Vegetation Index',
        'msavi': 'MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2 - Modified Soil Adjusted Vegetation Index',
        'ndwi': 'NDWI = (NIR - SWIR) / (NIR + SWIR) - Normalized Difference Water Index for Water Detection',
        'nitrogen': 'N = 259.4 × NDVI - 58.6 (R²=0.90) - Nitrogen content in kg N/ha',
        'phosphorus': 'P₂O₅ = 180 × EVI - 25 - Phosphorus content in kg P₂O₅/ha',
        'potassium': 'K₂O = 250 × SAVI - 40 - Potassium content in kg K₂O/ha',
        'salinity': 'ECe = 0.0045 × SI + 1.2 - Electrical Conductivity in dS/m',
        'ph': 'pH = 0.023×Blue - 0.015×SWIR + 7.2 (±0.35) - Soil pH estimation',
        'moisture': 'Moisture % = 45.2 × NDMI - 8.7 - Volumetric moisture content',
        'carbon': 'SOC % = 12.5 × NDVI - 3.2 (R²=0.79) - Soil Organic Carbon percentage'
    };
    return methods[index] || 'Standard vegetation index calculation';
}

// Function to get an actual value of an ee object
function evaluate(obj: any) {
    return new Promise((resolve, reject) =>
        obj.evaluate((result: any, error: any) =>
            error ? reject(new Error(error)) : resolve(result)
        )
    );
}

// Calculate NDVI (Normalized Difference Vegetation Index)
async function calculateNDVI(poi: any, startDate: string, endDate: string) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");

    const ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI");
    const clippedNdvi = ndvi.clip(poi);

    const minMax = await evaluate(clippedNdvi.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    const vis = {
        min: (minMax as any).NDVI_min || 0,
        max: (minMax as any).NDVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedNdvi, vis);
    
    return {
        urlFormat: (mapIdResult as any).urlFormat,
        mapid: (mapIdResult as any).mapid,
        token: (mapIdResult as any).token,
        geojson: {
            type: "Polygon",
            coordinates: null as any // Will be set from polygonCoords in handler
        }
    };
}

// Calculate EVI (Enhanced Vegetation Index)
async function calculateEVI(poi: any, startDate: string, endDate: string) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B2", "B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");
    const blue = image.select("B2");

    const G = 2.5;
    const L = 1;
    const C1 = 6;
    const C2 = 7.5;

    const evi = ee.Image(G).multiply(
        nir.subtract(red).divide(
            nir.add(ee.Image(C1).multiply(red)).subtract(ee.Image(C2).multiply(blue)).add(L)
        )
    ).rename("EVI");

    const clippedEvi = evi.clip(poi);

    const minMax = await evaluate(clippedEvi.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    const vis = {
        min: (minMax as any).EVI_min || 0,
        max: (minMax as any).EVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedEvi, vis);

    return {
        urlFormat: (mapIdResult as any).urlFormat,
        mapid: (mapIdResult as any).mapid,
        token: (mapIdResult as any).token,
        geojson: {
            type: "Polygon",
            coordinates: null as any // Will be set from polygonCoords in handler
        }
    };
}

// Calculate SAVI (Soil Adjusted Vegetation Index)
async function calculateSAVI(poi: any, startDate: string, endDate: string) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");
    const L = 0.5;

    const savi = nir.subtract(red).multiply(1 + L).divide(
        nir.add(red).add(L)
    ).rename("SAVI");

    const clippedSavi = savi.clip(poi);

    const minMax = await evaluate(clippedSavi.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    const vis = {
        min: (minMax as any).SAVI_min || 0,
        max: (minMax as any).SAVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedSavi, vis);

    return {
        urlFormat: (mapIdResult as any).urlFormat,
        mapid: (mapIdResult as any).mapid,
        token: (mapIdResult as any).token,
        geojson: {
            type: "Polygon",
            coordinates: null as any // Will be set from polygonCoords in handler
        }
    };
}

// Calculate MSAVI (Modified Soil Adjusted Vegetation Index)
async function calculateMSAVI(poi: any, startDate: string, endDate: string) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");

    const msavi = nir.multiply(2).add(1)
        .subtract((nir.multiply(2).add(1)).pow(2).subtract(nir.subtract(red).multiply(8)).sqrt())
        .divide(2).rename("MSAVI");

    const clippedMsavi = msavi.clip(poi);

    const vis = {
        min: 0,
        max: 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedMsavi, vis);

    return {
        urlFormat: (mapIdResult as any).urlFormat,
        mapid: (mapIdResult as any).mapid,
        token: (mapIdResult as any).token,
        geojson: {
            type: "Polygon",
            coordinates: null as any // Will be set from polygonCoords in handler
        }
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { index = 'msavi', start = '2024-01-01', end = '2024-12-31', polygon } = req.query;

        console.log(`Processing agricultural indices request for index: ${index}, date range: ${start} to ${end}`);

        // Get service account credentials from environment variables
        // Supports either GOOGLE_CREDENTIALS_JSON or individual GOOGLE_* vars
        let serviceAccountKey: any;
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            try {
                const parsed = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
                if (parsed.private_key && typeof parsed.private_key === 'string') {
                    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
                }
                serviceAccountKey = parsed;
            } catch (e: any) {
                throw new Error(`Invalid GOOGLE_CREDENTIALS_JSON: ${e.message}`);
            }
        } else {
            serviceAccountKey = {
                "type": "service_account",
                "project_id": process.env.GOOGLE_PROJECT_ID,
                "private_key_id": process.env.GOOGLE_PRIVATE_KEY_ID,
                "private_key": process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                "client_email": process.env.GOOGLE_CLIENT_EMAIL,
                "client_id": process.env.GOOGLE_CLIENT_ID,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": process.env.GOOGLE_CLIENT_X509_CERT_URL,
                "universe_domain": "googleapis.com"
            };
        }

        // Validate required environment variables
        if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
            throw new Error("Missing required Google Cloud credentials in environment variables");
        }

        // Authenticate earth engine
        await authenticate(serviceAccountKey);
        console.log('Earth Engine authenticated successfully');

        // Use custom polygon if provided, otherwise use default
        let poi: any;
        let polygonCoords: number[][][] | null = null;
        if (polygon && typeof polygon === 'string') {
            try {
                const polygonGeometry = JSON.parse(polygon);
                if (polygonGeometry.type === 'Polygon' && polygonGeometry.coordinates) {
                    // Convert GeoJSON coordinates to Earth Engine format
                    // GeoJSON: [[[lon, lat], ...]]
                    // Earth Engine: [[[lon, lat], ...]]
                    polygonCoords = polygonGeometry.coordinates;
                    poi = ee.Geometry.Polygon(polygonGeometry.coordinates);
                    console.log('Using custom polygon from request');
                } else {
                    throw new Error('Invalid polygon geometry format');
                }
            } catch (e: any) {
                console.warn('Failed to parse custom polygon, using default:', e.message);
                // Fallback to default polygon
                const defaultCoords = [[
                    [77.77333199305133, 12.392392446684909],
                    [77.77285377084087, 12.391034719901086],
                    [77.77415744218291, 12.390603704636632],
                    [77.77438732135664, 12.391302225016886],
                    [77.77376792469431, 12.391501801924363],
                    [77.77399141833513, 12.392187846379386],
                    [77.77333199305133, 12.392392446684909]
                ]];
                polygonCoords = defaultCoords;
                poi = ee.Geometry.Polygon(defaultCoords);
            }
        } else {
            // Define default POI polygon (coordinates for the area of interest)
            const defaultCoords = [[
                [77.77333199305133, 12.392392446684909],
                [77.77285377084087, 12.391034719901086],
                [77.77415744218291, 12.390603704636632],
                [77.77438732135664, 12.391302225016886],
                [77.77376792469431, 12.391501801924363],
                [77.77399141833513, 12.392187846379386],
                [77.77333199305133, 12.392392446684909]
            ]];
            polygonCoords = defaultCoords;
            poi = ee.Geometry.Polygon(defaultCoords);
        }

        // Calculate different indices based on selection
        let result;
        switch (index.toLowerCase()) {
            case 'ndvi':
                result = await calculateNDVI(poi, start as string, end as string);
                break;
            case 'evi':
                result = await calculateEVI(poi, start as string, end as string);
                break;
            case 'savi':
                result = await calculateSAVI(poi, start as string, end as string);
                break;
            case 'msavi':
            default:
                result = await calculateMSAVI(poi, start as string, end as string);
                break;
        }

        // Set the polygon coordinates in the result
        if (polygonCoords) {
            result.geojson = {
                type: "Polygon",
                coordinates: polygonCoords
            };
        }

        // Create POI polygon for display
        const poiPolygon = {
            type: "Feature",
            geometry: result.geojson,
            properties: {
                name: "Field Area",
                index: (index as string).toUpperCase()
            }
        };

        // Return the result to the client/browser
        return res.json({
            success: true,
            urlFormat: result.urlFormat,
            mapid: result.mapid,
            token: result.token,
            geojson: result.geojson,
            poiPolygon: poiPolygon,
            metadata: {
                dateRange: { start, end },
                algorithm: (index as string).toUpperCase(),
                dataSource: "Sentinel-2 SR Harmonized",
                cloudFilter: "< 20%",
                calculationMethod: getCalculationMethod(index as string)
            }
        });

    } catch (error: any) {
        console.error("Agricultural Indices Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Unknown error",
            error: error.toString()
        });
    }
}