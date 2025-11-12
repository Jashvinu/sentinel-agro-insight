# Supabase Quick Start

Get Sentinel Agro Insight running on Supabase in about 10 minutes.

## Prerequisites

- Node.js 18+
- Supabase account and project reference
- Google Cloud service account JSON with Earth Engine access
- Docker (optional, for local Supabase development)

## 1. Install the Supabase CLI

```bash
npm install -g supabase
# or
brew install supabase/tap/supabase
```

## 2. Authenticate

```bash
supabase login
```

## 3. Install project dependencies

```bash
git clone <your-repo-url>
cd sentinel-agro-insight-1
npm install
```

## 4. Configure Supabase secrets

Run the helper script and follow the prompts:

```bash
npm run deploy:setup
```

This will link your Supabase project and upload the required Google credentials.

## 5. Deploy Edge Functions

```bash
npm run deploy:supabase
```

On success you can reach your API at:

```
https://<PROJECT_REF>.supabase.co/functions/v1
```

## 6. Configure the frontend

Create `.env` (or `.env.production`) with your project URL and anon key:

```env
VITE_API_BASE_URL=https://<PROJECT_REF>.supabase.co/functions/v1
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## 7. Run locally

```bash
npm run dev
```

## 8. Deploy the frontend

```bash
npm run build
npm run firebase:deploy   # or deploy to your preferred static host
```

## Next Steps

- Review the full deployment guide in `docs/guides/deployment.md`.
- Consult `docs/reference/deployment-checklist.md` before launching to production.

