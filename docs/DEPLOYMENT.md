# 🚀 Sentinel Agro Insight - Complete Deployment Guide

A comprehensive guide for deploying the Sentinel Agro Insight application with separated frontend and backend architecture.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │
│   (Firebase)    │◄───┤   (Vercel)      │
│   React + TS    │    │   Node.js       │
└─────────────────┘    └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Static Files  │    │   Google Earth  │
│   (HTML/CSS/JS) │    │   Engine API    │
└─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **Git**: For version control
- **Vercel Account**: [vercel.com](https://vercel.com)
- **Firebase Account**: [firebase.google.com](https://firebase.google.com)
- **Google Cloud Project**: With Earth Engine API enabled

## 🔧 Environment Setup

### Required Environment Variables

#### Backend (Node.js on Vercel)
```bash
GOOGLE_PROJECT_ID=wrkfarm-415118
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
```
Or use the single JSON payload:
```bash
GOOGLE_CREDENTIALS_JSON='{"type":"service_account", ... }'
```

#### Frontend (Firebase)
```bash
VITE_API_BASE_URL=https://your-vercel-app.vercel.app
```

## 🚀 Deployment Steps

### Step 1: Deploy Backend to Vercel

The backend lives in the `api/` directory and is deployed as serverless Node.js functions using the configuration in `vercel.json`.

#### 1.1 Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

#### 1.2 (Optional) Run the API locally
```bash
# Launch the Express wrapper that adapts the Vercel handlers
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' npm run api:dev
```

#### 1.3 Deploy Serverless Functions
```bash
vercel --prod
```

#### 1.4 Set Environment Variables
In the Vercel project → Settings → Environment Variables, add `GOOGLE_CREDENTIALS_JSON` or the individual `GOOGLE_*` keys.

#### 1.5 Test Backend
```bash
# Health check
curl https://your-vercel-api.vercel.app/api/health

# Agricultural indices
curl "https://your-vercel-api.vercel.app/api/agricultural-indices?index=ndvi"
```

### Step 2: Deploy Frontend to Firebase

#### 2.1 Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

#### 2.2 Initialize Firebase Project
```bash
firebase init hosting
# Select your Firebase project
# Set public directory to "dist"
# Configure as single-page app: Yes
```

#### 2.3 Update API Configuration
Update the API base URL in your frontend:

```typescript
// In src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
```

#### 2.4 Deploy Frontend
```bash
# Quick deploy
./deploy-firebase.sh

# Or manually
npm run build
firebase deploy --only hosting
```

## 🔄 Quick Deploy Commands

```bash
# Deploy backend to Vercel
vercel --prod

# Deploy frontend to Firebase
npm run build && firebase deploy --only hosting

# Deploy both (if scripts exist)
vercel --prod && ./deploy-firebase.sh
```

## 🧪 Testing Your Deployment

### Backend API Tests
```bash
# Health check
curl https://your-vercel-api.vercel.app/api/health

# Earth Engine data
curl "https://your-vercel-api.vercel.app/api/agricultural-indices?index=ndvi&start=2024-01-01&end=2024-12-31"

# All indices
curl "https://your-vercel-api.vercel.app/api/agricultural-indices"
```

### Frontend Tests
1. Visit your Firebase hosting URL
2. Check browser console for API errors
3. Test the agricultural indices functionality
4. Verify map loading and data display

## 🛠️ Troubleshooting

### Common Issues

#### 1. CORS Errors
- Ensure CORS is properly configured in API functions
- Check that Firebase domain is whitelisted
- Verify API base URL is correct

#### 2. API Not Found (404)
- Verify Vercel deployment is successful
- Check that environment variables are set correctly
- Ensure API routes are properly configured

#### 3. Earth Engine Authentication Failed
- Verify Google Cloud credentials are correct
- Check that Earth Engine API is enabled
- Ensure service account has proper permissions

#### 4. Build Failures
- Check Node.js version compatibility
- Verify all dependencies are installed
- Review build logs for specific errors

### Debugging Commands

```bash
# Check Vercel deployment status
vercel ls

# View Vercel logs
vercel logs

# Check Firebase deployment
firebase hosting:channel:list

# Test API locally
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' npm run api:dev
curl http://127.0.0.1:3000/api/health
```

## 📊 Project Structure

```
├── api/                          # Vercel serverless functions (Node.js backend)
├── src/                         # React frontend
│   ├── components/              # React components
│   ├── hooks/                   # Custom React hooks
│   ├── services/                # API services
│   └── types/                   # TypeScript types
├── public/                      # Static assets
├── dist/                        # Built frontend (generated)
├── scripts/                     # Deployment helpers
│   ├── deploy-firebase.sh       # Frontend deployment helper
│   └── deploy-vercel.sh         # Backend deployment helper
└── package.json                 # Dependencies and scripts
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit sensitive credentials
2. **CORS Configuration**: Only allow necessary origins
3. **API Rate Limiting**: Consider implementing rate limiting
4. **HTTPS**: Both platforms provide HTTPS by default

## 💰 Cost Optimization

### Vercel
- Monitor function execution time
- Optimize cold start performance
- Consider Pro plan for production

### Firebase
- Monitor bandwidth usage
- Optimize bundle size
- Use Firebase CDN effectively

## 📈 Monitoring and Maintenance

### Vercel Monitoring
- Check Vercel dashboard for server performance
- Monitor API response times
- Set up alerts for errors

### Firebase Monitoring
- Monitor hosting performance
- Check for build failures
- Review usage analytics

## 🎯 Final Result

- **Frontend**: https://your-firebase-app.web.app (Firebase Hosting)
- **Backend**: https://your-vercel-api.vercel.app (Vercel Node.js functions)
- **Total Cost**: $0 (Free tiers)

## 📞 Support and Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Earth Engine Documentation](https://developers.google.com/earth-engine)
- [Project Repository](https://github.com/your-repo)

---

**Note**: This setup provides a scalable, production-ready architecture with the server and frontend separated for better performance and maintainability.