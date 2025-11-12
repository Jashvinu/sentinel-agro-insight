import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import agriculturalIndices from './agricultural-indices';
import health from './health';
import root from './root';

type VercelHandler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

const adaptHandler = (handler: VercelHandler) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    } catch (error) {
      next(error);
    }
  };
};

const app = express();
const port = process.env.LOCAL_API_PORT ? Number(process.env.LOCAL_API_PORT) : 3000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.options('*', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.status(204).send('');
});

app.get('/', adaptHandler(root));
app.get('/api/health', adaptHandler(health));
app.get('/api/agricultural-indices', adaptHandler(agriculturalIndices));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api/server] Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: error instanceof Error ? error.message : 'Internal server error',
  });
});

app.listen(port, () => {
  console.log(`Local API server running at http://127.0.0.1:${port}`);
});

