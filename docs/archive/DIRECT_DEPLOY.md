# Direct Deployment Commands

If the setup script has issues, use these direct commands instead.

## Step 1: Login to Supabase

```bash
supabase login
```

## Step 2: Set Your Project Reference

```bash
# Replace with your actual project reference
export SUPABASE_PROJECT_REF="your-project-ref"
```

## Step 3: Set Credentials (Choose One Method)

### Method A: Using the JSON file directly

```bash
# This reads your JSON file and sets it as a secret
CREDS=$(cat wrkfarm-415118-8bd4bb22e26c.json | tr -d '\n' | tr -s ' ' ' ')
echo "GOOGLE_CREDENTIALS_JSON=$CREDS" | supabase secrets set --project-ref "$SUPABASE_PROJECT_REF"
```

### Method B: Using stdin

```bash
# This allows you to paste the JSON content
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" << EOF
GOOGLE_CREDENTIALS_JSON=$(cat wrkfarm-415118-8bd4bb22e26c.json | tr -d '\n')
EOF
```

### Method C: Using Supabase Dashboard (Easiest!)

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/functions
2. Click "Add new secret"
3. Name: `GOOGLE_CREDENTIALS_JSON`
4. Value: Copy and paste the **entire contents** of `wrkfarm-415118-8bd4bb22e26c.json` (minified on one line)

## Step 4: Deploy Edge Functions

```bash
supabase functions deploy health --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
supabase functions deploy agricultural-indices --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
```

## Step 5: Test Deployment

```bash
# Replace YOUR_PROJECT_REF with your actual project reference
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/health

curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agricultural-indices?index=msavi&start=2024-01-01&end=2024-01-31"
```

## Quick Copy-Paste Commands

Here's everything in one block (just replace YOUR_PROJECT_REF):

```bash
# Set variables
export SUPABASE_PROJECT_REF="YOUR_PROJECT_REF"

# Set credentials
CREDS=$(cat wrkfarm-415118-8bd4bb22e26c.json | jq -c .)
supabase secrets set GOOGLE_CREDENTIALS_JSON="$CREDS" --project-ref "$SUPABASE_PROJECT_REF"

# Deploy functions
supabase functions deploy health --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
supabase functions deploy agricultural-indices --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

# Test
curl https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/health
```

## Alternative: Use Supabase Dashboard (Recommended if CLI has issues)

1. **Go to Supabase Dashboard**
   - https://supabase.com/dashboard

2. **Select Your Project**

3. **Navigate to Edge Functions**
   - Left sidebar → Edge Functions

4. **Set Secret**
   - Go to "Secrets" tab
   - Click "Add new secret"
   - Name: `GOOGLE_CREDENTIALS_JSON`
   - Value: Paste the minified JSON (see below)

5. **Minify Your JSON**
   ```bash
   cat wrkfarm-415118-8bd4bb22e26c.json | jq -c .
   ```
   Copy the output and paste it as the secret value.

6. **Deploy Functions**
   ```bash
   supabase functions deploy --project-ref YOUR_PROJECT_REF
   ```

---

**Need Help?**

If you're still having issues, you can:
1. Use the Supabase Dashboard to set secrets manually
2. Or run: `npm run deploy:setup` again (the script is now fixed)


