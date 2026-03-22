/**
 * Express Application for Firebase Cloud Functions
 * Sentinel Agro Insight - Agricultural Monitoring API
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initializeEarthEngine } from './utils/earthEngine';
import routes from './routes';

const app = express();

// Track Earth Engine initialization status
let eeInitialized = false;
let eeInitializing = false;

// CORS configuration - allow requests from Firebase Hosting and localhost
const corsOptions = {
    origin: [
        'https://farmview-1uako.web.app',
        'https://farmview-1uako.firebaseapp.com',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey'],
    credentials: true,
};

app.use(cors(corsOptions) as any);
app.use(express.json());

// Lazy Earth Engine initialization middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
    // Skip for health check
    if (req.path === '/health') {
        return next();
    }

    // Initialize Earth Engine on first request (not health check)
    if (!eeInitialized && !eeInitializing) {
        eeInitializing = true;
        try {
            console.log('[Firebase] Initializing Earth Engine...');
            await initializeEarthEngine();
            eeInitialized = true;
            console.log('[Firebase] Earth Engine ready');
        } catch (error: any) {
            console.error('[Firebase] Earth Engine initialization failed:', error.message);
            eeInitializing = false;
            // Continue anyway - some endpoints may not need EE
        }
    }

    // Wait for initialization if in progress
    if (eeInitializing && !eeInitialized) {
        let attempts = 0;
        while (eeInitializing && !eeInitialized && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
    }

    next();
});

// Mount API routes
app.use('/', routes);

// Root route
app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Sentinel Agro Insight API (Firebase Cloud Functions)',
        version: '1.0.0',
        earthEngineReady: eeInitialized,
        endpoints: [
            'GET /health',
            'GET /agricultural-indices',
            'POST /advanced-monitoring',
            'GET /get-observation-dates',
            'GET|POST /sync-satellite-dates',
            'GET /diagnostics',
        ],
    });
});

export default app;
