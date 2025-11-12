# Sentinel Agro Insight

A precision agriculture platform that monitors crop health using Sentinel-2 satellite imagery and Google Earth Engine. The platform provides real-time agricultural indices, weather data, and field monitoring capabilities.

## Architecture

This project uses a **separated deployment architecture**:

- **Frontend**: React + TypeScript + Vite deployed on Firebase Hosting (or any static host)
- **Backend**: Deno Edge Functions deployed on Supabase

## Features

- 🌱 **Agricultural Indices**: NDVI, EVI, SAVI, MSAVI, NDWI
- 🌾 **Nutrient Analysis**: Nitrogen, Phosphorus, Potassium content estimation
- 🌍 **Soil Analysis**: pH, Salinity, Moisture, Carbon content
- 📊 **Real-time Monitoring**: Live satellite data processing
- 🗺️ **Interactive Maps**: Field visualization with MapLibre GL
- 📈 **Analytics Dashboard**: Comprehensive data visualization
- 🌤️ **Weather Integration**: OpenMeteo weather data

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Radix UI components
- MapLibre GL for maps
- Recharts for data visualization

### Backend
- Supabase Edge Functions (Deno runtime)
- Google Earth Engine API
- CORS enabled for cross-origin requests
- Express adapter for local development (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+
- Google Cloud Project with Earth Engine enabled
- Supabase account for Edge Functions
- Firebase project for hosting (or any static host)

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# Google Earth Engine Service Account
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com

# API Configuration (for local development)
VITE_API_BASE_URL=http://localhost:54321/functions/v1

# For production, use your Supabase project URL:
# VITE_API_BASE_URL=https://your-project-ref.supabase.co/functions/v1
```

### Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Preview production build**:
   ```bash
   npm run preview
   ```

## Deployment

### Quick Deploy to Supabase (Recommended)

Deploy the backend Edge Functions to Supabase in 3 steps:

```bash
# 1. Setup environment variables
npm run deploy:setup

# 2. Deploy Edge Functions
npm run deploy:supabase

# 3. Build and deploy frontend
npm run build
# Then deploy to Firebase, Netlify, Cloudflare Pages, etc.
```

📖 **Quick Start**: See [SUPABASE_QUICKSTART.md](./SUPABASE_QUICKSTART.md) for step-by-step instructions.

📚 **Full Documentation**: See [docs/SUPABASE_DEPLOYMENT.md](./docs/SUPABASE_DEPLOYMENT.md) for advanced configuration.

### Local Development with Supabase

```bash
# Start Supabase locally (requires Docker)
npm run supabase:start

# In another terminal, start frontend
npm run dev
```

### Deploy Frontend to Firebase Hosting

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Firebase**:
   ```bash
   npm run firebase:deploy
   ```

## API Endpoints

Base URL: `https://your-project-ref.supabase.co/functions/v1`

### Health Check
- `GET /health` - Server health status

### Agricultural Indices
- `GET /agricultural-indices` - Comprehensive agricultural indices

### Query Parameters
- `index`: Type of index (ndvi, evi, savi, msavi) - default: msavi
- `start`: Start date (YYYY-MM-DD) - default: 2024-01-01
- `end`: End date (YYYY-MM-DD) - default: 2024-12-31
- `polygon`: GeoJSON polygon (optional)

## Project Structure

```
├── supabase/                  # Supabase Edge Functions
│   ├── functions/            
│   │   ├── _shared/          # Shared utilities (CORS, response helpers)
│   │   ├── health/           # Health check endpoint
│   │   └── agricultural-indices/  # Main agricultural API
│   └── config.toml           # Supabase configuration
├── api/                      # Legacy Express server for local dev (optional)
├── scripts/                  # Deployment helpers
│   ├── deploy-supabase.sh    # Edge Functions deployment
│   ├── setup-supabase-env.sh # Environment setup
│   ├── supabase-local.sh     # Local development
│   └── deploy-firebase.sh    # Frontend deployment
├── src/                      # Frontend source code
│   ├── components/           # React components
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API services
│   ├── types/               # TypeScript types
│   └── utils/               # Utility functions
├── public/                  # Static assets
├── dist/                   # Built frontend
├── firebase.json           # Firebase configuration
└── package.json            # Dependencies and scripts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please open an issue on GitHub.