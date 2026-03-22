/**
 * Health Check Route
 */
import { Router, Request, Response } from 'express';
import { successResponse } from '../utils/response';
import { isEeInitialized } from '../utils/earthEngine';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
    return successResponse(res, {
        status: 'OK',
        message: 'Firebase Cloud Functions API is healthy',
        earthEngineReady: isEeInitialized(),
        timestamp: new Date().toISOString(),
        environment: 'firebase',
    });
});

export default router;
