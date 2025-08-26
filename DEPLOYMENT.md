# wrkFarm Deployment Guide

This guide will help you deploy your wrkFarm application to Google Cloud.

## 📋 Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud SDK** installed on your machine
3. **Docker** installed (for local testing)

## 🔧 Setup Steps

### 1. Install Google Cloud SDK

```bash
# macOS (using Homebrew)
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### 2. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 3. Create a New Project (or use existing)

```bash
# Create new project
gcloud projects create wrkfarm-[YOUR_NAME]

# Set as default project
gcloud config set project wrkfarm-[YOUR_NAME]

# Enable billing (required for Cloud Run)
# Go to: https://console.cloud.google.com/billing
```

### 4. Configure Environment Variables

```bash
# Copy the example file
cp env.production.example .env.production

# Edit with your actual values
nano .env.production
```

## 🚀 Deployment Options

### Option A: Automated Deployment (Recommended)

```bash
# Make sure you're in the project directory
cd wrkfarm-1

# Run the deployment script
./deploy.sh
```

### Option B: Manual Deployment

```bash
# 1. Build and push Docker image
gcloud builds submit --tag gcr.io/$PROJECT_ID/wrkfarm .

# 2. Deploy to Cloud Run
gcloud run deploy wrkfarm \
  --image gcr.io/$PROJECT_ID/wrkfarm \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3001 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

## 🌐 Access Your Application

After deployment, you'll get a URL like:
```
https://wrkfarm-[hash]-uc.a.run.app
```

## 📊 Monitoring and Scaling

### View Logs
```bash
gcloud logs read --project=$PROJECT_ID --limit=50
```

### Scale Manually
```bash
gcloud run services update wrkfarm \
  --region=us-central1 \
  --max-instances=20
```

### View Metrics
- Go to Google Cloud Console
- Navigate to Cloud Run > wrkfarm
- Check the "Metrics" tab

## 🔄 Continuous Deployment

### Connect to GitHub (Optional)

1. Go to Cloud Build > Triggers
2. Create a new trigger
3. Connect your GitHub repository
4. Set up automatic deployment on push to main branch

## 💰 Cost Optimization

- **Cloud Run**: Pay only for requests (scales to zero)
- **Estimated cost**: $5-20/month for moderate usage
- **Free tier**: 2 million requests/month

## 🛠️ Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   gcloud auth application-default login
   ```

2. **Build Fails**
   ```bash
   # Check build logs
   gcloud builds log [BUILD_ID]
   ```

3. **Service Won't Start**
   ```bash
   # Check service logs
   gcloud logs read --project=$PROJECT_ID --limit=100
   ```

### Get Help

- [Google Cloud Documentation](https://cloud.google.com/docs)
- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting)
- [Cloud Build Issues](https://cloud.google.com/build/docs/troubleshooting)

## 🔐 Security Best Practices

1. **Environment Variables**: Never commit `.env.production` to git
2. **Service Accounts**: Use least privilege principle
3. **HTTPS**: Cloud Run provides HTTPS by default
4. **CORS**: Configure CORS properly for production

## 📈 Next Steps

1. **Custom Domain**: Set up a custom domain
2. **SSL Certificate**: Automatically managed by Cloud Run
3. **CDN**: Consider Cloud CDN for global performance
4. **Monitoring**: Set up alerts and dashboards

