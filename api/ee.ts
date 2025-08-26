import ee from '@google/earthengine';

function getMissingEnvVars(): string[] {
    const requiredEnvVars = [
        'GOOGLE_PROJECT_ID',
        'GOOGLE_PRIVATE_KEY_ID',
        'GOOGLE_PRIVATE_KEY',
        'GOOGLE_CLIENT_EMAIL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_X509_CERT_URL',
    ];
    return requiredEnvVars.filter((name) => !process.env[name]);
}

function authenticate(serviceAccount: Record<string, string | undefined>) {
    return new Promise<void>((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            serviceAccount,
            () =>
                ee.initialize(
                    null,
                    null,
                    () => resolve(),
                    (error) => reject(new Error(error as string))
                ),
            (error) => reject(new Error(error as string))
        );
    });
}

function getMapId(image: ee.Image, vis: Record<string, unknown>) {
    return new Promise<{ urlFormat: string }>((resolve, reject) => {
        image.getMapId(vis, (obj: any, error: any) =>
            error ? reject(new Error(String(error))) : resolve(obj)
        );
    });
}

function evaluate<T>(obj: ee.ComputedObject): Promise<T> {
    return new Promise<T>((resolve, reject) =>
        obj.evaluate((result: T, error: any) =>
            error ? reject(new Error(String(error))) : resolve(result)
        )
    );
}

function mockPayload() {
    return {
        urlFormat:
            'https://earthengine.googleapis.com/map/{z}/{x}/{y}?token=mock_token&expression=msavi_expression',
        geojson: {
            type: 'Polygon',
            coordinates: [
                [
                    [77.77333199305133, 12.392392446684909],
                    [77.77285377084087, 12.391034719901086],
                    [77.77415744218291, 12.390603704636632],
                    [77.77438732135664, 12.391302225016886],
                    [77.77376792469431, 12.391501801924363],
                    [77.77399141833513, 12.392187846379386],
                    [77.77333199305133, 12.392392446684909],
                ],
            ],
        },
        poiPolygon: {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [77.77333199305133, 12.392392446684909],
                        [77.77285377084087, 12.391034719901086],
                        [77.77415744218291, 12.390603704636632],
                        [77.77438732135664, 12.391302225016886],
                        [77.77376792469431, 12.391501801924363],
                        [77.77399141833513, 12.392187846379386],
                        [77.77333199305133, 12.392392446684909],
                    ],
                ],
            },
            properties: {},
        },
        metadata: {
            dateRange: { start: '2024-01-01', end: '2024-12-31' },
            algorithm: 'MSAVI',
            dataSource: 'Sentinel-2 SR',
            cloudFilter: '< 20%',
        },
    };
}

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req: any, res: any) {
    try {
        // Short-circuit to mock if missing env or malformed private key
        const missing = getMissingEnvVars();
        if (missing.length > 0) {
            console.warn('Missing environment variables:', missing);
            return res.status(200).json(mockPayload());
        }

        const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        if (!privateKey) {
            return res.status(200).json(mockPayload());
        }

        const serviceAccountKey = {
            type: 'service_account',
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: privateKey,
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
            universe_domain: 'googleapis.com',
        } as Record<string, string | undefined>;

        try {
            await authenticate(serviceAccountKey);
        } catch (authError: any) {
            console.error('Earth Engine authentication failed:', authError?.message || authError);
            return res.status(200).json(mockPayload());
        }

        // Geometry (same as Express server)
        const poi = ee.Geometry.Polygon([
            [77.77333199305133, 12.392392446684909],
            [77.77285377084087, 12.391034719901086],
            [77.77415744218291, 12.390603704636632],
            [77.77438732135664, 12.391302225016886],
            [77.77376792469431, 12.391501801924363],
            [77.77399141833513, 12.392187846379386],
            [77.77333199305133, 12.392392446684909],
        ]);

        const start = '2024-01-01';
        const end = '2024-12-31';

        const collection = ee
            .ImageCollection('COPERNICUS/S2_SR')
            .filterBounds(poi)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            .select(['B4', 'B8']);

        const image = collection.median();
        const nir = image.select('B8');
        const red = image.select('B4');

        const msavi = nir
            .multiply(2)
            .add(1)
            .subtract(
                nir
                    .multiply(2)
                    .add(1)
                    .pow(2)
                    .subtract(nir.subtract(red).multiply(8))
                    .sqrt()
            )
            .divide(2)
            .rename('MSAVI');

        const clippedMsavi = msavi.clip(poi);

        const minMax = await evaluate<{ MSAVI_min?: number; MSAVI_max?: number }>(
            clippedMsavi.reduceRegion({
                reducer: ee.Reducer.minMax(),
                geometry: poi,
                scale: 10,
                maxPixels: 1e9,
            })
        );

        const vis = {
            min: (minMax as any).MSAVI_min || 0,
            max: (minMax as any).MSAVI_max || 1,
            palette: ['red', 'yellow', 'green', 'darkgreen'],
        };

        const { urlFormat } = await getMapId(clippedMsavi, vis);

        const imageGeometryGeojson = {
            type: 'Polygon',
            coordinates: [
                [
                    [77.77333199305133, 12.392392446684909],
                    [77.77285377084087, 12.391034719901086],
                    [77.77415744218291, 12.390603704636632],
                    [77.77438732135664, 12.391302225016886],
                    [77.77376792469431, 12.391501801924363],
                    [77.77399141833513, 12.392187846379386],
                    [77.77333199305133, 12.392392446684909],
                ],
            ],
        } as const;

        const poiPolygon = {
            type: 'Feature',
            geometry: imageGeometryGeojson,
            properties: {},
        } as const;

        return res.status(200).json({
            urlFormat,
            geojson: imageGeometryGeojson,
            poiPolygon,
            metadata: {
                dateRange: { start, end },
                algorithm: 'MSAVI',
                dataSource: 'Sentinel-2 SR',
                cloudFilter: '< 20%',
            },
        });
    } catch (error: any) {
        console.error('Earth Engine Error:', error?.message || error);
        return res.status(500).json({ message: error?.message || 'Unknown error' });
    }
}


