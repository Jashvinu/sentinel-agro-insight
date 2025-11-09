# Sentinel Agro Insight

A precision agriculture platform that monitors crop health using Sentinel-2 satellite imagery and Google Earth Engine. The platform provides real-time agricultural indices, weather data, and field monitoring capabilities.

## Architecture

This project uses a **separated deployment architecture**:

- **Frontend**: React + TypeScript + Vite deployed on Firebase Hosting
- **Backend**: Node.js + TypeScript API deployed on Vercel

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
- Node.js with TypeScript
- Google Earth Engine API
- Vercel serverless functions
- CORS enabled for cross-origin requests

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 8+
- Google Cloud Project with Earth Engine enabled
- Firebase project for hosting
- Vercel account for API deployment

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

# API Configuration
VITE_API_BASE_URL=https://your-vercel-app.vercel.app
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

### Frontend (Firebase Hosting)

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Firebase**:
   ```bash
   npm run firebase:deploy
   ```

### Backend (Vercel)

1. **Deploy API functions**:
   ```bash
   vercel --prod
   ```

2. **Set environment variables** in Vercel dashboard:
   - `GOOGLE_PROJECT_ID`
   - `GOOGLE_PRIVATE_KEY_ID`
   - `GOOGLE_PRIVATE_KEY`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_X509_CERT_URL`

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Earth Engine
- `GET /api/ee` - Basic Earth Engine data
- `GET /api/agricultural-indices` - Comprehensive agricultural indices

### Query Parameters
- `index`: Type of index (ndvi, evi, savi, msavi, ndwi, nitrogen, phosphorus, potassium, salinity, ph, moisture, carbon)
- `start`: Start date (YYYY-MM-DD)
- `end`: End date (YYYY-MM-DD)

## Project Structure

```
├── api/                    # Vercel API functions
│   ├── ee.ts              # Earth Engine API
│   ├── health.ts          # Health check
│   └── agricultural-indices.ts
├── src/                   # Frontend source code
│   ├── components/        # React components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API services
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── public/               # Static assets
├── dist/                # Built frontend (Firebase hosting)
├── firebase.json        # Firebase configuration
├── vercel.json          # Vercel configuration
└── package.json         # Dependencies and scripts
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