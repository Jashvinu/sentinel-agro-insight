# Deploy to Supabase NOW! 🚀

Your code is ready. Let's deploy!

## Your Current Setup

✅ Frontend: Points to `https://udbnskydigoqpxmmduvr.supabase.co/functions/v1`  
❌ Backend: Functions not deployed yet (404 errors)

## Deploy in 3 Commands

### 1. Make sure Supabase CLI is installed

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

This will open a browser for authentication.

### 3. Deploy the functions

```bash
cd /Users/jashvinuyeshwanth/Desktop/wrkfarm/sentinel-agro-insight-1
export SUPABASE_PROJECT_REF=udbnskydigoqpxmmduvr
./scripts/deploy-supabase.sh
```

## Set Environment Secrets

After deploying, you need to add your Google Cloud credentials as Supabase secrets:

```bash
# Add secrets one by one
supabase secrets set GOOGLE_PROJECT_ID="your-project-id" --project-ref udbnskydigoqpxmmduvr
supabase secrets set GOOGLE_PRIVATE_KEY_ID="your-key-id" --project-ref udbnskydigoqpxmmduvr
supabase secrets set GOOGLE_CLIENT_EMAIL="your-email@project.iam.gserviceaccount.com" --project-ref udbnskydigoqpxmmduvr
supabase secrets set GOOGLE_CLIENT_ID="your-client-id" --project-ref udbnskydigoqpxmmduvr
supabase secrets set GOOGLE_CLIENT_X509_CERT_URL="your-cert-url" --project-ref udbnskydigoqpxmmduvr
```

**For GOOGLE_PRIVATE_KEY** (needs special handling):
```bash
# Read from your service account JSON file
supabase secrets set GOOGLE_PRIVATE_KEY="$(cat your-service-account.json | jq -r '.private_key')" --project-ref udbnskydigoqpxmmduvr
```

**OR use the JSON format (easier):**
```bash
# Set all credentials at once
supabase secrets set GOOGLE_CREDENTIALS_JSON="$(cat wrkfarm-415118-8bd4bb22e26c.json)" --project-ref udbnskydigoqpxmmduvr
```

## Test Your Deployment

```bash
# Test health endpoint
curl https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/health

# Test agricultural indices
curl "https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices?index=ndvi"
```

## Troubleshooting

### If you get "function not found":
```bash
# List deployed functions
supabase functions list --project-ref udbnskydigoqpxmmduvr

# Redeploy if needed
supabase functions deploy health --project-ref udbnskydigoqpxmmduvr --no-verify-jwt
supabase functions deploy agricultural-indices --project-ref udbnskydigoqpxmmduvr --no-verify-jwt
```

### If you get authentication errors:
```bash
# Check secrets are set
supabase secrets list --project-ref udbnskydigoqpxmmduvr
```

### View function logs:
```bash
supabase functions logs health --project-ref udbnskydigoqpxmmduvr
supabase functions logs agricultural-indices --project-ref udbnskydigoqpxmmduvr
```

## Done! 🎉

Once deployed and secrets are set, reload your frontend and it should work!

Your API will be live at:
- 🟢 Health: https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/health
- 🌿 Ag Indices: https://udbnskydigoqpxmmduvr.supabase.co/functions/v1/agricultural-indices

---

**Need help?** Check [SUPABASE_QUICKSTART.md](./SUPABASE_QUICKSTART.md) for more details.

