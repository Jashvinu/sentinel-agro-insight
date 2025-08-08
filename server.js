import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ee from '@google/earthengine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('dist')); // Serve the built React app

// Earth Engine authentication function
function authenticate(serviceAccount) {
    return new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            serviceAccount,
            () =>
                ee.initialize(
                    null,
                    null,
                    () => resolve(),
                    (error) => reject(new Error(error))
                ),
            (error) => reject(new Error(error))
        );
    });
}

// Function to get the image tile url
function getMapId(image, vis) {
    return new Promise((resolve, reject) => {
        image.getMapId(vis, (obj, error) =>
            error ? reject(new Error(error)) : resolve(obj)
        );
    });
}

// Function to get an actual value of an ee object
function evaluate(obj) {
    return new Promise((resolve, reject) =>
        obj.evaluate((result, error) =>
            error ? reject(new Error(error)) : resolve(result)
        )
    );
}

// Earth Engine API endpoint
app.get('/api/ee', async (req, res) => {
    try {
        // Check if required environment variables are set
        const requiredEnvVars = [
            'GOOGLE_PROJECT_ID',
            'GOOGLE_PRIVATE_KEY_ID',
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_CLIENT_EMAIL',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_X509_CERT_URL'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            console.warn('Missing environment variables:', missingVars);
            // Return mock data instead of failing
            return res.json({
                urlFormat: "https://earthengine.googleapis.com/map/{z}/{x}/{y}?token=mock_token&expression=msavi_expression",
                geojson: {
                    type: "Polygon",
                    coordinates: [[
                        [77.77333199305133, 12.392392446684909],
                        [77.77285377084087, 12.391034719901086],
                        [77.77415744218291, 12.390603704636632],
                        [77.77438732135664, 12.391302225016886],
                        [77.77376792469431, 12.391501801924363],
                        [77.77399141833513, 12.392187846379386],
                        [77.77333199305133, 12.392392446684909]
                    ]]
                },
                poiPolygon: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [77.77333199305133, 12.392392446684909],
                            [77.77285377084087, 12.391034719901086],
                            [77.77415744218291, 12.390603704636632],
                            [77.77438732135664, 12.391302225016886],
                            [77.77376792469431, 12.391501801924363],
                            [77.77399141833513, 12.392187846379386],
                            [77.77333199305133, 12.392392446684909]
                        ]]
                    },
                    properties: {}
                }
            });
        }

        // Service account credentials from environment variables
        const serviceAccountKey = {
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

        // Authenticate earth engine
        try {
            await authenticate(serviceAccountKey);
        } catch (authError) {
            console.error('Earth Engine authentication failed:', authError.message);
            // Return mock data instead of failing
            return res.json({
                urlFormat: "https://earthengine.googleapis.com/map/{z}/{x}/{y}?token=mock_token&expression=msavi_expression",
                geojson: {
                    type: "Polygon",
                    coordinates: [[
                        [77.77333199305133, 12.392392446684909],
                        [77.77285377084087, 12.391034719901086],
                        [77.77415744218291, 12.390603704636632],
                        [77.77438732135664, 12.391302225016886],
                        [77.77376792469431, 12.391501801924363],
                        [77.77399141833513, 12.392187846379386],
                        [77.77333199305133, 12.392392446684909]
                    ]]
                },
                poiPolygon: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [77.77333199305133, 12.392392446684909],
                            [77.77285377084087, 12.391034719901086],
                            [77.77415744218291, 12.390603704636632],
                            [77.77438732135664, 12.391302225016886],
                            [77.77376792469431, 12.391501801924363],
                            [77.77399141833513, 12.392187846379386],
                            [77.77333199305133, 12.392392446684909]
                        ]]
                    },
                    properties: {}
                }
            });
        }

        // Define POI polygon (coordinates from your code)
        const poi = ee.Geometry.Polygon([
            [77.77333199305133, 12.392392446684909],
            [77.77285377084087, 12.391034719901086],
            [77.77415744218291, 12.390603704636632],
            [77.77438732135664, 12.391302225016886],
            [77.77376792469431, 12.391501801924363],
            [77.77399141833513, 12.392187846379386],
            [77.77333199305133, 12.392392446684909]
        ]);

        // Date range (2024 as specified)
        const start = "2024-01-01";
        const end = "2024-12-31";

        // Load Sentinel-2 SR imagery and SELECT ONLY NEEDED BANDS
        const collection = ee.ImageCollection("COPERNICUS/S2_SR")
            .filterBounds(poi)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            .select(["B4", "B8"]); // SELECT ONLY RED AND NIR BANDS

        // Compute median image
        const image = collection.median();

        // MSAVI calculation
        const nir = image.select("B8");
        const red = image.select("B4");

        const msavi = nir.multiply(2).add(1)
            .subtract((nir.multiply(2).add(1)).pow(2).subtract(nir.subtract(red).multiply(8)).sqrt())
            .divide(2).rename("MSAVI");

        // Clip MSAVI to only show within the POI polygon
        const clippedMsavi = msavi.clip(poi);

        // Reduce region to get min/max for visualization (only within POI)
        const minMax = await evaluate(clippedMsavi.reduceRegion({
            reducer: ee.Reducer.minMax(),
            geometry: poi,
            scale: 10,
            maxPixels: 1e9
        }));

        console.log("MSAVI min and max:", minMax);

        // Image visualization parameter for MSAVI
        const vis = {
            min: minMax.MSAVI_min || 0,
            max: minMax.MSAVI_max || 1,
            palette: [
                "red", "yellow", "green", "darkgreen"
            ]
        };

        // Get url format of the clipped MSAVI image
        const { urlFormat } = await getMapId(clippedMsavi, vis);

        // Also get the image geometry - use POI polygon instead of full data extent
        const imageGeometryGeojson = {
            type: "Polygon",
            coordinates: [[
                [77.77333199305133, 12.392392446684909],
                [77.77285377084087, 12.391034719901086],
                [77.77415744218291, 12.390603704636632],
                [77.77438732135664, 12.391302225016886],
                [77.77376792469431, 12.391501801924363],
                [77.77399141833513, 12.392187846379386],
                [77.77333199305133, 12.392392446684909]
            ]]
        };

        // Create POI polygon for display
        const poiPolygon = {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [77.77333199305133, 12.392392446684909],
                    [77.77285377084087, 12.391034719901086],
                    [77.77415744218291, 12.390603704636632],
                    [77.77438732135664, 12.391302225016886],
                    [77.77376792469431, 12.391501801924363],
                    [77.77399141833513, 12.392187846379386],
                    [77.77333199305133, 12.392392446684909]
                ]]
            },
            properties: {}
        };

        // Return the result to the client/browser
        res.json({
            urlFormat,
            geojson: imageGeometryGeojson,
            poiPolygon: poiPolygon
        });

    } catch (error) {
        console.error("Earth Engine Error:", error);
        res.status(500).json({ message: error.message || "Unknown error" });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile('dist/index.html', { root: '.' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 