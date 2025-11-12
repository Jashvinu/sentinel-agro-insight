import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sentinel Agro Insight API</title>
<style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:3rem;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
    main{max-width:32rem}
    h1{font-size:2.5rem;margin-bottom:1rem}
    p{margin:0.75rem 0;line-height:1.6}
    a{color:#38bdf8;text-decoration:none}
    a:hover{text-decoration:underline}
</style>
</head>
<body>
<main>
    <h1>Sentinel Agro Insight API</h1>
    <p>The backend is running. Use the API endpoints to retrieve data.</p>
    <p><a href="/api/health">Check API health</a></p>
    <p><code>/api/agricultural-indices?index=ndvi&amp;start=2024-01-01&amp;end=2024-12-31</code></p>
</main>
</body>
</html>`);
}

