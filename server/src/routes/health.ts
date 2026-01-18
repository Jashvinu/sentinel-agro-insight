// Health Check Endpoint
import { Router, Request, Response } from 'express';
import { isEeInitialized } from '../utils/earthEngine.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    platform: 'Express.js (Local Development)',
    earthEngine: {
      initialized: isEeInitialized(),
    },
  });
});

export default router;
