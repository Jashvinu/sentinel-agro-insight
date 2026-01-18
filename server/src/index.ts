// Express Server Entry Point
// Sentinel Agro Insight - Local Development Server

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeEarthEngine } from './utils/earthEngine.js';
import routes from './routes/index.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Sentinel Agro Insight API Server',
    version: '1.0.0',
    endpoints: [
      'GET /health',
      'GET /agricultural-indices',
      'GET /get-observation-dates',
      'GET|POST /sync-satellite-dates'
    ]
  });
});

// Serve static files if dist exists (for production)
app.use(express.static('dist'));

// Catch-all for SPA routing
app.get('*', (req, res) => {
  // If not an API route, serve index.html
  if (!req.path.startsWith('/health') &&
      !req.path.startsWith('/agricultural-indices') &&
      !req.path.startsWith('/get-observation-dates') &&
      !req.path.startsWith('/sync-satellite-dates')) {
    res.sendFile('dist/index.html', { root: '..' });
  } else {
    res.status(404).json({ success: false, error: 'Not found' });
  }
});

// Start server
async function startServer() {
  console.log('========================================');
  console.log('  Sentinel Agro Insight API Server');
  console.log('========================================');
  console.log('');
  console.log('[Server] Initializing...');

  // Initialize Earth Engine
  try {
    console.log('[Server] Authenticating with Google Earth Engine...');
    await initializeEarthEngine();
    console.log('[Server] Earth Engine ready');
  } catch (error: any) {
    console.error('[Server] Failed to initialize Earth Engine:', error.message);
    console.warn('[Server] Continuing without Earth Engine - some endpoints may fail');
  }

  // Start listening
  app.listen(PORT, () => {
    console.log('');
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  - GET  http://localhost:${PORT}/health`);
    console.log(`  - GET  http://localhost:${PORT}/agricultural-indices`);
    console.log(`  - GET  http://localhost:${PORT}/get-observation-dates`);
    console.log(`  - GET  http://localhost:${PORT}/sync-satellite-dates`);
    console.log('');
    console.log('Example requests:');
    console.log(`  curl http://localhost:${PORT}/health`);
    console.log(`  curl "http://localhost:${PORT}/agricultural-indices?index=ndvi"`);
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('========================================');
  });
}

startServer().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
