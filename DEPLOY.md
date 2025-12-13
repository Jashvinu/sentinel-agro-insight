# 🚀 Quick Deployment Guide

This guide will help you deploy your wrkFarm application to production.

## Option 1: Deploy to Vercel (Recommended - Easiest)

Vercel is the easiest option for React/Vite applications with automatic deployments.

### Steps:

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Confirm settings (should auto-detect Vite)

4. **Set Environment Variables** in Vercel Dashboard:
   - Go to your project → Settings → Environment Variables
   - Add these variables:
     ```
     VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1
     VITE_SUPABASE_URL=https://your-project-ref.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     VITE_GEMINI_API_KEY=your-gemini-key (optional)
     ```

5. **Redeploy** after adding environment variables:
   ```bash
   vercel --prod
   ```

Your app will be live at: `https://your-project.vercel.app`

---

## Option 2: Deploy to Firebase Hosting

You already have Firebase configured. Here's how to deploy:

### Steps:

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase** (if not done already):
   ```bash
   firebase init hosting
   ```
   - Select your Firebase project
   - Public directory: `dist`
   - Single-page app: Yes
   - Overwrite index.html: No

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Deploy**:
   ```bash
   npm run deploy:hosting
   ```
   Or use the script:
   ```bash
   npm run deploy:frontend
   ```

Your app will be live at: `https://your-project.web.app`

---

## Option 3: Deploy to Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login**:
   ```bash
   netlify login
   ```

3. **Deploy**:
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

4. **Set Environment Variables** in Netlify Dashboard:
   - Site settings → Environment variables
   - Add the same variables as Vercel

---

## Backend Deployment (Supabase Edge Functions)

Before deploying the frontend, make sure your backend is deployed:

1. **Deploy Supabase Functions**:
   ```bash
   npm run deploy:supabase
   ```

2. **Set Supabase Secrets** (for Google Earth Engine):
   ```bash
   supabase secrets set GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
   ```

---

## Environment Variables Checklist

Make sure these are set in your hosting platform:

### Frontend Variables:
- `VITE_API_BASE_URL` - Your Supabase Edge Functions URL
- `VITE_SUPABASE_URL` - Your Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `VITE_GEMINI_API_KEY` - (Optional) For AI Field Brief

### Backend Variables (Supabase Secrets):
- `GOOGLE_CREDENTIALS_JSON` - Complete Google Earth Engine service account JSON

---

## Quick Deploy Commands

```bash
# Build locally first to test
npm run build

# Deploy to Vercel
vercel --prod

# Deploy to Firebase
npm run deploy:frontend

# Deploy backend (Supabase)
npm run deploy:supabase
```

---

## Post-Deployment Checklist

- [ ] Backend Edge Functions deployed to Supabase
- [ ] Frontend deployed to hosting platform
- [ ] Environment variables set correctly
- [ ] Test the health endpoint: `https://your-api-url/functions/v1/health`
- [ ] Test the frontend loads correctly
- [ ] Test polygon drawing functionality
- [ ] Test weather data loading
- [ ] Test agricultural indices API calls

---

## Troubleshooting

### Build Errors
- Make sure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run type-check`
- Check for linting errors: `npm run lint`

### API Connection Issues
- Verify `VITE_API_BASE_URL` is set correctly
- Check Supabase Edge Functions are deployed
- Test API endpoint directly in browser

### Environment Variables Not Working
- Make sure variables start with `VITE_` for Vite
- Redeploy after adding new variables
- Check variable names match exactly

---

## Need Help?

Check the detailed deployment docs:
- `docs/DEPLOYMENT.md` - Full deployment guide
- `docs/guides/deployment.md` - Step-by-step guide
- `SUPABASE_QUICKSTART.md` - Supabase setup













