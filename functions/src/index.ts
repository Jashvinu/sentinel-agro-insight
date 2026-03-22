/**
 * Firebase Cloud Functions Entry Point
 * Exports the Express app as an HTTPS Cloud Function
 */

import * as functions from 'firebase-functions';
import app from './app';

// Export the Express app as a single Cloud Function
// This handles all API routes under /api/*
export const api = functions
    .runWith({
        timeoutSeconds: 540,  // 9 minutes (max for HTTP functions)
        memory: '1GB',        // For Earth Engine processing
    })
    .https.onRequest(app);
