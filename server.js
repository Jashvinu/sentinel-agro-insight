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

// Function to get the image tile url with proper return structure
function getMapId(image, vis) {
    return new Promise((resolve, reject) => {
        image.getMapId(vis, (obj, error) => {
            if (error) {
                reject(new Error(error));
            } else {
                // Return the complete mapid object with urlFormat, mapid, and token
                resolve({
                    urlFormat: obj.urlFormat,
                    mapid: obj.mapid,
                    token: obj.token
                });
            }
        });
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

// Function to get calculation method description for each index
function getCalculationMethod(index) {
    switch (index) {
        case 'ndvi':
            return 'NDVI = (NIR - Red) / (NIR + Red) - Normalized Difference Vegetation Index';
        case 'evi':
            return 'EVI = 2.5 × (NIR - Red) / (NIR + 6×Red - 7.5×Blue + 1) - Enhanced Vegetation Index';
        case 'savi':
            return 'SAVI = (NIR - Red) × (1 + L) / (NIR + Red + L) - Soil Adjusted Vegetation Index';
        case 'msavi':
            return 'MSAVI = (2×NIR + 1 - √((2×NIR + 1)² - 8×(NIR - Red))) / 2 - Modified Soil Adjusted Vegetation Index';
        case 'ndwi':
            return 'NDWI = (NIR - SWIR) / (NIR + SWIR) - Normalized Difference Water Index for Water Detection';
        case 'nitrogen':
            return 'N = 259.4 × NDVI - 58.6 (R²=0.90) - Nitrogen content in kg N/ha';
        case 'phosphorus':
            return 'P₂O₅ = 180 × EVI - 25 - Phosphorus content in kg P₂O₅/ha';
        case 'potassium':
            return 'K₂O = 250 × SAVI - 40 - Potassium content in kg K₂O/ha';
        case 'salinity':
            return 'ECe = 0.0045 × SI + 1.2 - Electrical Conductivity in dS/m';
        case 'ph':
            return 'pH = 0.023×Blue - 0.015×SWIR + 7.2 (±0.35) - Soil pH estimation';
        case 'moisture':
            return 'Moisture % = 45.2 × NDMI - 8.7 - Volumetric moisture content';
        case 'carbon':
            return 'SOC % = 12.5 × NDVI - 3.2 (R²=0.79) - Soil Organic Carbon percentage';
        default:
            return 'Standard vegetation index calculation';
    }
}

// Calculate NDVI (Normalized Difference Vegetation Index)
async function calculateNDVI(poi, startDate, endDate) {
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

    console.log("NDVI min and max:", minMax);

    const vis = {
        min: minMax.NDVI_min || 0,
        max: minMax.NDVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedNdvi, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate EVI (Enhanced Vegetation Index)
async function calculateEVI(poi, startDate, endDate) {
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

    console.log("EVI min and max:", minMax);

    const vis = {
        min: minMax.EVI_min || 0,
        max: minMax.EVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedEvi, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate SAVI (Soil Adjusted Vegetation Index)
async function calculateSAVI(poi, startDate, endDate) {
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

    console.log("SAVI min and max:", minMax);

    const vis = {
        min: minMax.SAVI_min || 0,
        max: minMax.SAVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedSavi, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate MSAVI (Modified Soil Adjusted Vegetation Index)
async function calculateMSAVI(poi, startDate, endDate) {
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

    const minMax = await evaluate(clippedMsavi.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("MSAVI min and max:", minMax);

    const vis = {
        min: minMax.MSAVI_min || 0,
        max: minMax.MSAVI_max || 1,
        palette: ["red", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedMsavi, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate NDWI (Normalized Difference Water Index)
async function calculateNDWI(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B8", "B11"]);

    const image = collection.median();
    const nir = image.select("B8");
    const swir = image.select("B11");

    const ndwi = nir.subtract(swir).divide(nir.add(swir)).rename("NDWI");

    const clippedNdwi = ndwi.clip(poi);

    const minMax = await evaluate(clippedNdwi.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("NDWI min and max:", minMax);

    const vis = {
        min: minMax.NDWI_min || -1,
        max: minMax.NDWI_max || 1,
        palette: ["red", "yellow", "blue", "darkblue"]
    };

    const mapIdResult = await getMapId(clippedNdwi, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Nitrogen content (kg N/ha)
async function calculateNitrogen(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");

    // Calculate NDVI first, then convert to Nitrogen
    const ndvi = nir.subtract(red).divide(nir.add(red));
    const nitrogen = ndvi.multiply(259.4).subtract(58.6).rename("Nitrogen_kgN_ha");

    const clippedNitrogen = nitrogen.clip(poi);

    const minMax = await evaluate(clippedNitrogen.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Nitrogen min and max:", minMax);

    const vis = {
        min: 0,
        max: 300,
        palette: ["red", "orange", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedNitrogen, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Phosphorus content (kg P₂O₅/ha)
async function calculatePhosphorus(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B2", "B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");
    const blue = image.select("B2");

    // Calculate EVI first, then convert to Phosphorus
    const G = 2.5;
    const L = 1;
    const C1 = 6;
    const C2 = 7.5;

    const evi = ee.Image(G).multiply(
        nir.subtract(red).divide(
            nir.add(ee.Image(C1).multiply(red)).subtract(ee.Image(C2).multiply(blue)).add(L)
        )
    );

    const phosphorus = evi.multiply(180).subtract(25).rename("Phosphorus_kgP2O5_ha");

    const clippedPhosphorus = phosphorus.clip(poi);

    const minMax = await evaluate(clippedPhosphorus.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Phosphorus min and max:", minMax);

    const vis = {
        min: 0,
        max: 200,
        palette: ["red", "orange", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedPhosphorus, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Potassium content (kg K₂O/ha)
async function calculatePotassium(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");

    // Calculate SAVI first, then convert to Potassium
    const L = 0.5;
    const savi = nir.subtract(red).multiply(1 + L).divide(
        nir.add(red).add(L)
    );

    const potassium = savi.multiply(250).subtract(40).rename("Potassium_kgK2O_ha");

    const clippedPotassium = potassium.clip(poi);

    const minMax = await evaluate(clippedPotassium.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Potassium min and max:", minMax);

    const vis = {
        min: 0,
        max: 250,
        palette: ["red", "orange", "yellow", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedPotassium, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Salinity (ECe dS/m)
async function calculateSalinity(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B2", "B4"]);

    const image = collection.median();
    const blue = image.select("B2");
    const red = image.select("B4");

    // Salinity Index: SI = B2 × B4
    // Conversion: ECe = 0.0045 × SI + 1.2
    const si = blue.multiply(red);
    const salinity = si.multiply(0.0045).add(1.2).rename("Salinity_ECe_dS_m");

    const clippedSalinity = salinity.clip(poi);

    const minMax = await evaluate(clippedSalinity.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Salinity min and max:", minMax);

    const vis = {
        min: 0,
        max: 16,
        palette: ["green", "yellow", "orange", "red", "darkred"]
    };

    const mapIdResult = await getMapId(clippedSalinity, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate pH
async function calculatePH(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B2", "B11"]);

    const image = collection.median();
    const blue = image.select("B2");
    const swir = image.select("B11");

    // Simple model: pH = 0.023×B2 - 0.015×B11 + 7.2 (±0.35)
    const ph = blue.multiply(0.023).subtract(swir.multiply(0.015)).add(7.2).rename("pH");

    const clippedPH = ph.clip(poi);

    const minMax = await evaluate(clippedPH.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("pH min and max:", minMax);

    const vis = {
        min: 4.5,
        max: 9.0,
        palette: ["red", "orange", "yellow", "green", "blue"]
    };

    const mapIdResult = await getMapId(clippedPH, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Moisture (Volumetric %)
async function calculateMoisture(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B8", "B11"]);

    const image = collection.median();
    const nir = image.select("B8");
    const swir = image.select("B11");

    // NDMI = (B8 - B11) / (B8 + B11)
    // Volumetric Moisture (%) = 45.2 × NDMI - 8.7
    const ndmi = nir.subtract(swir).divide(nir.add(swir));
    const moisture = ndmi.multiply(45.2).subtract(8.7).rename("Moisture_Volumetric_Percent");

    const clippedMoisture = moisture.clip(poi);

    const minMax = await evaluate(clippedMoisture.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Moisture min and max:", minMax);

    const vis = {
        min: 0,
        max: 50,
        palette: ["brown", "yellow", "lightblue", "blue", "darkblue"]
    };

    const mapIdResult = await getMapId(clippedMoisture, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Calculate Carbon (SOC %)
async function calculateCarbon(poi, startDate, endDate) {
    const collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(poi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .select(["B4", "B8"]);

    const image = collection.median();
    const nir = image.select("B8");
    const red = image.select("B4");

    // Simple: SOC (%) = 12.5 × NDVI - 3.2 (R²=0.79)
    const ndvi = nir.subtract(red).divide(nir.add(red));
    const carbon = ndvi.multiply(12.5).subtract(3.2).rename("Carbon_SOC_Percent");

    const clippedCarbon = carbon.clip(poi);

    const minMax = await evaluate(clippedCarbon.reduceRegion({
        reducer: ee.Reducer.minMax(),
        geometry: poi,
        scale: 10,
        maxPixels: 1e9
    }));

    console.log("Carbon min and max:", minMax);

    const vis = {
        min: 0,
        max: 10,
        palette: ["brown", "yellow", "orange", "green", "darkgreen"]
    };

    const mapIdResult = await getMapId(clippedCarbon, vis);

    return {
        urlFormat: mapIdResult.urlFormat,
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
        }
    };
}

// Earth Engine API endpoint
app.get('/api/ee', async (req, res) => {
    try {
        // Extract query parameters from the URL
        const { index = 'msavi', start = '2024-01-01', end = '2024-12-31' } = req.query;

        console.log(`Processing request for index: ${index}, date range: ${start} to ${end}`);

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
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
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
        await authenticate(serviceAccountKey);
        console.log('Earth Engine authentication successful');

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

        // Use the query parameters for date range

        let result;

        // Calculate different indices based on selection
        switch (index) {
            case 'ndvi':
                result = await calculateNDVI(poi, start, end);
                break;
            case 'evi':
                result = await calculateEVI(poi, start, end);
                break;
            case 'savi':
                result = await calculateSAVI(poi, start, end);
                break;
            case 'msavi':
                result = await calculateMSAVI(poi, start, end);
                break;
            case 'ndwi':
                result = await calculateNDWI(poi, start, end);
                break;
            case 'nitrogen':
                result = await calculateNitrogen(poi, start, end);
                break;
            case 'phosphorus':
                result = await calculatePhosphorus(poi, start, end);
                break;
            case 'potassium':
                result = await calculatePotassium(poi, start, end);
                break;
            case 'salinity':
                result = await calculateSalinity(poi, start, end);
                break;
            case 'ph':
                result = await calculatePH(poi, start, end);
                break;
            case 'moisture':
                result = await calculateMoisture(poi, start, end);
                break;
            case 'carbon':
                result = await calculateCarbon(poi, start, end);
                break;
            default:
                result = await calculateNDVI(poi, start, end);
        }

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
            urlFormat: result.urlFormat,
            geojson: result.geojson,
            poiPolygon: poiPolygon,
            metadata: {
                dateRange: { start, end },
                algorithm: index.toUpperCase(),
                dataSource: 'Sentinel-2 SR Harmonized',
                cloudFilter: '< 20%',
                indexType: index,
                calculationMethod: getCalculationMethod(index)
            }
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

// Comprehensive Agricultural Indices API endpoint (Next.js style)
app.get('/api/agricultural-indices', async (req, res) => {
    try {
        // Extract query parameters from the URL
        const { index = 'msavi', start = '2024-01-01', end = '2024-12-31' } = req.query;

        console.log(`Processing agricultural indices request for index: ${index}, date range: ${start} to ${end}`);

        // Get service account credentials from environment variables
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

        // Validate required environment variables
        if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
            throw new Error("Missing required Google Cloud credentials in environment variables");
        }

        // Authenticate earth engine
        await authenticate(serviceAccountKey);
        console.log('Earth Engine authenticated successfully');

        // Define POI polygon (coordinates for the area of interest)
        const poi = ee.Geometry.Polygon([[
            [77.77333199305133, 12.392392446684909],
            [77.77285377084087, 12.391034719901086],
            [77.77415744218291, 12.390603704636632],
            [77.77438732135664, 12.391302225016886],
            [77.77376792469431, 12.391501801924363],
            [77.77399141833513, 12.392187846379386],
            [77.77333199305133, 12.392392446684909]
        ]]);

        // Calculate different indices based on selection
        let result;
        switch (index.toLowerCase()) {
            case 'msavi':
                result = await calculateMSAVI(poi, start, end);
                break;
            case 'ndvi':
                result = await calculateNDVI(poi, start, end);
                break;
            case 'evi':
                result = await calculateEVI(poi, start, end);
                break;
            case 'savi':
                result = await calculateSAVI(poi, start, end);
                break;
            case 'ndwi':
                result = await calculateNDWI(poi, start, end);
                break;
            case 'nitrogen':
                result = await calculateNitrogen(poi, start, end);
                break;
            case 'phosphorus':
                result = await calculatePhosphorus(poi, start, end);
                break;
            case 'potassium':
                result = await calculatePotassium(poi, start, end);
                break;
            case 'salinity':
                result = await calculateSalinity(poi, start, end);
                break;
            case 'ph':
                result = await calculatePH(poi, start, end);
                break;
            case 'moisture':
                result = await calculateMoisture(poi, start, end);
                break;
            case 'carbon':
                result = await calculateCarbon(poi, start, end);
                break;
            default:
                result = await calculateMSAVI(poi, start, end);
        }

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
            properties: {
                name: "Field Area",
                index: index.toUpperCase()
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
                algorithm: index.toUpperCase(),
                dataSource: "Sentinel-2 SR Harmonized",
                cloudFilter: "< 20%",
                calculationMethod: getCalculationMethod(index)
            }
        });

    } catch (error) {
        console.error("Agricultural Indices Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Unknown error",
            error: error.toString()
        });
    }
});

// Earth Engine test endpoint
app.get('/api/ee-test', async (req, res) => {
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
            return res.json({
                status: 'ERROR',
                message: 'Missing environment variables',
                missing: missingVars
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

        // Test Earth Engine authentication
        try {
            await authenticate(serviceAccountKey);
            console.log('Earth Engine authentication successful');

            // Test basic Earth Engine functionality
            const testImage = ee.Image.constant(1).rename('test');
            const testMapId = await getMapId(testImage, { min: 0, max: 1, palette: ['red'] });

            res.json({
                status: 'OK',
                message: 'Earth Engine is working',
                testMapId: testMapId,
                auth: 'successful'
            });
        } catch (authError) {
            console.error('Earth Engine authentication failed:', authError.message);
            res.json({
                status: 'ERROR',
                message: 'Earth Engine authentication failed',
                error: authError.message
            });
        }
    } catch (error) {
        console.error("Earth Engine test error:", error);
        res.status(500).json({
            status: 'ERROR',
            message: error.message || "Unknown error"
        });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile('dist/index.html', { root: '.' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 