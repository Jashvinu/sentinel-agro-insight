/**
 * Health Check Endpoint for Vercel
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allowCors } from './_lib/cors';
import { successResponse } from './_lib/response';
import { isEeInitialized } from './_lib/earthEngine';

async function handler(_req: VercelRequest, res: VercelResponse) {
    return successResponse(res, {
        status: 'OK',
        message: 'FarmView API is running on Vercel',
        earthEngineReady: isEeInitialized(),
        timestamp: new Date().toISOString(),
        environment: 'vercel',
    });
}

export default allowCors(handler);
