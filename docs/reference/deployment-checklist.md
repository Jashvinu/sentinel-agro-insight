# Supabase Deployment Checklist

Use this list before deploying Sentinel Agro Insight to Supabase Edge Functions.

## 1. Prerequisites

- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Logged in to Supabase (`supabase login`)
- [ ] Supabase project reference noted
- [ ] Google Cloud service account JSON with Earth Engine access

## 2. Secrets

Store credentials via the Supabase dashboard or CLI:

- [ ] `GOOGLE_CREDENTIALS_JSON` (recommended)
  - or individual keys:
    - [ ] `GOOGLE_PROJECT_ID`
    - [ ] `GOOGLE_PRIVATE_KEY_ID`
    - [ ] `GOOGLE_PRIVATE_KEY`
    - [ ] `GOOGLE_CLIENT_EMAIL`
    - [ ] `GOOGLE_CLIENT_ID`
    - [ ] `GOOGLE_CLIENT_X509_CERT_URL`

## 3. Functions in Source Control

- [ ] `supabase/functions/agricultural-indices/index.ts`
- [ ] `supabase/functions/health/index.ts`
- [ ] `supabase/functions/_shared/cors.ts`
- [ ] `supabase/functions/_shared/response.ts`
- [ ] Update or remove any temporary/test functions

## 4. Deploy

```bash
supabase link --project-ref <PROJECT_REF>
npm run deploy:supabase
```

- [ ] Health function deploy succeeds
- [ ] Agricultural indices function deploy succeeds

## 5. Frontend Configuration

- [ ] `.env` (or `.env.production`) contains:

```env
VITE_API_BASE_URL=https://<PROJECT_REF>.supabase.co/functions/v1
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

- [ ] Frontend rebuilt: `npm run build`

## 6. Sanity Checks

```bash
curl https://<PROJECT_REF>.supabase.co/functions/v1/health
curl "https://<PROJECT_REF>.supabase.co/functions/v1/agricultural-indices?index=ndvi"
```

- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Agricultural indices respond without errors

## 7. Optional Checks

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run build`

## 8. Post-Deployment

- [ ] Update monitoring/alerting for Supabase functions
- [ ] Rotate credentials on a regular schedule
- [ ] Document deployed project reference and API URL

