import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(204).end();
}

