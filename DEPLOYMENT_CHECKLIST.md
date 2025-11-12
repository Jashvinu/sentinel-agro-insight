# 🚀 Supabase Deployment Checklist - 12 Agricultural Indices

Use this checklist to ensure a successful deployment of all 12 agricultural indices to Supabase.

## ✅ Pre-Deployment Checklist

### 1. Prerequisites
- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Logged in to Supabase (`supabase login`)
- [ ] Supabase project created (note your project reference)
- [ ] Google Cloud service account JSON ready
- [ ] Google Earth Engine API enabled for your project

### 2. Environment Setup
- [ ] `GOOGLE_CREDENTIALS_JSON` ready (entire JSON as string)
- [ ] OR individual credentials ready:
  - [ ] `GOOGLE_PROJECT_ID`
  - [ ] `GOOGLE_PRIVATE_KEY_ID`
  - [ ] `GOOGLE_PRIVATE_KEY`
  - [ ] `GOOGLE_CLIENT_EMAIL`
  - [ ] `GOOGLE_CLIENT_ID`
  - [ ] `GOOGLE_CLIENT_X509_CERT_URL`

### 3. Code Verification
- [ ] `/supabase/functions/agricultural-indices/index.ts` contains all 12 indices
- [ ] `/supabase/functions/health/index.ts` exists
- [ ] `/supabase/functions/_shared/cors.ts` exists
- [ ] `/supabase/functions/_shared/response.ts` exists

## 🔧 Deployment Steps

### Step 1: Link Project
```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF
```
- [ ] Project linked successfully
- [ ] No error messages

### Step 2: Set Environment Variables

Go to Supabase Dashboard → Your Project → Settings → Edge Functions → Add secrets

```bash
# Add your Google credentials (choose one method)

# Method A: Single JSON (recommended)
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"..."}

# Method B: Individual variables
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-key-id
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/...
```

- [ ] Environment variables added
- [ ] Private key format verified (includes `\n` for newlines)

### Step 3: Deploy Functions

```bash
# Deploy health function
supabase functions deploy health --project-ref YOUR_PROJECT_REF --no-verify-jwt

# Deploy agricultural-indices function
supabase functions deploy agricultural-indices --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Or use the deployment script:
```bash
npm run deploy:supabase
```

- [ ] Health function deployed
- [ ] Agricultural-indices function deployed
- [ ] No deployment errors

### Step 4: Update Frontend

Update `.env` file:
```env
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
```

- [ ] `.env` file updated
- [ ] Project reference is correct

### Step 5: Rebuild Frontend

```bash
npm run build
```

- [ ] Build successful
- [ ] No TypeScript errors
- [ ] Dist folder generated

## 🧪 Testing Checklist

### Basic Tests

```bash
# Set your project ref
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1"

# Test 1: Health check
curl "$SUPABASE_URL/health"
```
- [ ] Health endpoint returns `{"status": "ok"}`

### Test All 12 Indices

```bash
# Test 2-5: Vegetation Indices
curl "$SUPABASE_URL/agricultural-indices?index=ndvi"
curl "$SUPABASE_URL/agricultural-indices?index=evi"
curl "$SUPABASE_URL/agricultural-indices?index=savi"
curl "$SUPABASE_URL/agricultural-indices?index=msavi"
```
- [ ] NDVI works
- [ ] EVI works
- [ ] SAVI works
- [ ] MSAVI works

```bash
# Test 6-8: NPK Indices
curl "$SUPABASE_URL/agricultural-indices?index=nitrogen"
curl "$SUPABASE_URL/agricultural-indices?index=phosphorus"
curl "$SUPABASE_URL/agricultural-indices?index=potassium"
```
- [ ] Nitrogen works
- [ ] Phosphorus works
- [ ] Potassium works

```bash
# Test 9-12: Soil Health Indices
curl "$SUPABASE_URL/agricultural-indices?index=salinity"
curl "$SUPABASE_URL/agricultural-indices?index=ph"
curl "$SUPABASE_URL/agricultural-indices?index=moisture"
curl "$SUPABASE_URL/agricultural-indices?index=carbon"
```
- [ ] Salinity works
- [ ] pH works
- [ ] Moisture works
- [ ] Carbon works

```bash
# Test 13: Water Index
curl "$SUPABASE_URL/agricultural-indices?index=ndwi"
```
- [ ] NDWI works

### Response Validation

For each successful test, verify the response contains:
- [ ] `success: true`
- [ ] `urlFormat` (tile URL)
- [ ] `geojson` (polygon coordinates)
- [ ] `poiPolygon` (feature with properties)
- [ ] `metadata` (algorithm, dateRange, calculationMethod)

### Frontend UI Tests

After deploying frontend:
- [ ] Map loads without errors
- [ ] All 12 index buttons appear
- [ ] Can switch between indices
- [ ] Map tiles load for each index
- [ ] Color legends display correctly
- [ ] Cache system works (fast switching)
- [ ] Draw polygon feature works
- [ ] Save polygon feature works
- [ ] Farm selector dropdown works
- [ ] Export all polygons works

## 🐛 Troubleshooting

### Issue: "Function not found"
- [ ] Verify deployment completed successfully
- [ ] Check project reference in URL
- [ ] Try deploying again

### Issue: "Authentication failed"
- [ ] Verify Google credentials in Supabase dashboard
- [ ] Check private key format (must include `\n` for newlines)
- [ ] Ensure Earth Engine API is enabled
- [ ] Verify service account has proper permissions

### Issue: "No data / empty response"
- [ ] Check date range (default: 2024-01-01 to 2024-12-31)
- [ ] Verify polygon coordinates are valid
- [ ] Check cloud cover filter (< 20%)
- [ ] Try a different date range with `?start=2023-01-01&end=2023-12-31`

### Issue: "Timeout"
- [ ] First request may be slow (cold start)
- [ ] Try again - subsequent requests should be faster
- [ ] Check Supabase function logs in dashboard

### Issue: "CORS error"
- [ ] Verify CORS headers in `_shared/cors.ts`
- [ ] Check `--no-verify-jwt` flag was used in deployment
- [ ] Ensure frontend is using correct API URL

## 📊 Verification Matrix

| Index | API Works | UI Button | Map Renders | Legend Shows | Color Correct |
|-------|-----------|-----------|-------------|--------------|---------------|
| NDVI | ☐ | ☐ | ☐ | ☐ | ☐ |
| EVI | ☐ | ☐ | ☐ | ☐ | ☐ |
| SAVI | ☐ | ☐ | ☐ | ☐ | ☐ |
| MSAVI | ☐ | ☐ | ☐ | ☐ | ☐ |
| NDWI | ☐ | ☐ | ☐ | ☐ | ☐ |
| Nitrogen | ☐ | ☐ | ☐ | ☐ | ☐ |
| Phosphorus | ☐ | ☐ | ☐ | ☐ | ☐ |
| Potassium | ☐ | ☐ | ☐ | ☐ | ☐ |
| Salinity | ☐ | ☐ | ☐ | ☐ | ☐ |
| pH | ☐ | ☐ | ☐ | ☐ | ☐ |
| Moisture | ☐ | ☐ | ☐ | ☐ | ☐ |
| Carbon | ☐ | ☐ | ☐ | ☐ | ☐ |

## 🎉 Post-Deployment

### Documentation
- [ ] Update README with Supabase deployment info
- [ ] Document API endpoints
- [ ] Create user guide for 12 indices

### Monitoring
- [ ] Check Supabase function logs regularly
- [ ] Monitor API usage and costs
- [ ] Track error rates

### Optimization (Optional)
- [ ] Implement caching strategy
- [ ] Add rate limiting
- [ ] Set up monitoring/alerting
- [ ] Consider implementing JWT authentication

## 📝 Success Criteria

Your deployment is successful when:
- ✅ All 12 indices return valid responses
- ✅ Frontend UI displays all indices correctly
- ✅ Map tiles load and render properly
- ✅ No CORS or authentication errors
- ✅ Response times are acceptable (< 30s for first request)
- ✅ Cache system works for fast index switching
- ✅ Custom polygon drawing and saving works

## 🔗 Quick Links

- [Supabase Dashboard](https://app.supabase.com)
- [Function Logs](https://app.supabase.com/project/YOUR_PROJECT_REF/functions)
- [Google Cloud Console](https://console.cloud.google.com)
- [Earth Engine Code Editor](https://code.earthengine.google.com)

## 📞 Support

If you encounter issues:
1. Check function logs in Supabase dashboard
2. Review error messages carefully
3. Verify all environment variables
4. Test with curl before testing UI
5. Check the troubleshooting section above

---

**Date**: _____________  
**Deployed by**: _____________  
**Project Ref**: _____________  
**Status**: ☐ In Progress  ☐ Complete ✅

