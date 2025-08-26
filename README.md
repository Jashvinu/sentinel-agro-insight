# wrkFarm

A precision agriculture platform that monitors crop health using Sentinel-2 satellite imagery and Earth Engine integration.

## 🌱 Features

- **Real-time Satellite Monitoring**: Track crop health using Sentinel-2 L2A imagery
- **Earth Engine Integration**: Advanced geospatial analysis with Google Earth Engine
- **Weather Integration**: Real-time weather data and forecasts
- **Field Analytics**: Comprehensive field health metrics and trends
- **Alert System**: Proactive notifications for crop issues
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Earth Engine account (for satellite data)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/wrkfarm.git
   cd wrkfarm
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file:
   ```env
   # Google Earth Engine Service Account
   GOOGLE_PROJECT_ID=your-project-id
   GOOGLE_PRIVATE_KEY_ID=your-private-key-id
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com
   
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Start the backend server**
   ```bash
   npm run server
   ```

The application will be available at `http://localhost:5173`

## 📁 Project Structure

```
wrkfarm/
├── src/
│   ├── components/
│   │   ├── features/           # Feature-specific components
│   │   │   ├── dashboard/      # Dashboard components
│   │   │   ├── map/           # Map components
│   │   │   └── weather/       # Weather components
│   │   ├── layout/            # Layout components
│   │   │   └── navigation/    # Navigation components
│   │   ├── common/            # Shared components
│   │   └── ui/               # UI components (shadcn/ui)
│   ├── hooks/                # Custom React hooks
│   ├── pages/                # Page components
│   ├── services/             # API services
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions
│   ├── constants/            # Application constants
│   ├── assets/               # Static assets
│   └── lib/                  # Library configurations
├── public/                   # Public assets
└── server.js                 # Express server
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run server` - Start backend server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run type-check` - Run TypeScript type checking

### Code Organization

#### Components
- **Features**: Domain-specific components organized by feature
- **Layout**: Reusable layout components
- **UI**: Base UI components from shadcn/ui
- **Common**: Shared components used across features

#### Services
- **API Service**: Centralized HTTP client with error handling
- **Earth Engine Service**: Satellite data processing
- **Weather Service**: Weather data integration

#### Types
- Comprehensive TypeScript definitions for all data structures
- Strict typing for better development experience

#### Constants
- Application configuration
- API endpoints
- Map configurations
- Validation rules

## 🌐 API Endpoints

### Earth Engine
- `GET /api/ee` - Get satellite imagery data

### Weather
- `GET /api/weather` - Get weather data for coordinates

### Health
- `GET /api/health` - Server health check

### Alerts
- `GET /api/alerts` - Get system alerts

### Analytics
- `GET /api/analytics` - Get analytics data

## 🗺️ Map Configuration

The application uses MapLibre GL for interactive maps with:

- **Tile Server**: OpenStreetMap
- **Field Boundaries**: Configurable polygon coordinates
- **Satellite Overlay**: Sentinel-2 imagery via Earth Engine
- **Interactive Features**: Zoom, pan, layer toggles

## 📊 Data Sources

- **Sentinel-2 L2A**: ESA satellite imagery (10m resolution)
- **ERA5-Land**: ECMWF weather reanalysis (9km resolution)
- **CHIRPS v2**: Precipitation data (5km resolution)

## 🎨 Styling

Built with:
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality React components
- **Custom Design System**: Consistent theming and components

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_PROJECT_ID` | Google Cloud Project ID | Yes |
| `GOOGLE_PRIVATE_KEY` | Service account private key | Yes |
| `GOOGLE_CLIENT_EMAIL` | Service account email | Yes |
| `PORT` | Server port | No (default: 3001) |

### Field Configuration

Update field boundaries in `src/constants/index.ts`:

```typescript
export const FIELD_BOUNDARIES = {
  coordinates: [
    [longitude, latitude],
    // ... more coordinates
  ],
  area: 0.15, // hectares
  location: 'Your Location',
};
```

## 🚀 Deployment

### Production Build

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm start
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Google Earth Engine](https://earthengine.google.com/) for satellite data
- [Sentinel-2](https://sentinel.esa.int/web/sentinel/missions/sentinel-2) for satellite imagery
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [MapLibre GL](https://maplibre.org/) for mapping

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation

---

**Built with ❤️ for precision agriculture**
