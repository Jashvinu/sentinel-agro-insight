# AI Studio Prompt: Sentinel Agro Insight - Precision Agriculture Platform

## Project Overview

Build a comprehensive precision agriculture web application called **Sentinel Agro Insight** that monitors crop health using multi-satellite imagery (Sentinel-2, Landsat 8/9, Sentinel-1 SAR) and Google Earth Engine. The platform provides real-time agricultural indices, weather data, field monitoring, and yield prediction capabilities.

## Architecture Requirements

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom theme
- **UI Components**: Radix UI primitives (tabs, dialogs, tooltips, toasts, separators, dropdown menus)
- **Maps**: React Leaflet with Leaflet Draw for polygon drawing
- **Data Visualization**: Recharts for charts and analytics
- **State Management**: TanStack React Query for server state
- **Routing**: React Router DOM v6
- **Icons**: Lucide React
- **Notifications**: Sonner for toast notifications
- **Font**: Inter font family for modern typography
- **Deployment**: Firebase Hosting (or any static host)

### Backend Stack
- **Runtime**: Deno Edge Functions
- **Platform**: Supabase Edge Functions
- **APIs**: Google Earth Engine API for satellite data processing
- **Database**: Supabase PostgreSQL (for farms, satellite dates, indices data)
- **Authentication**: Supabase Auth
- **CORS**: Enabled for cross-origin requests

## Core Features to Implement

### 1. User Authentication & Authorization
- Login/Signup pages with Supabase Auth
- Protected routes requiring authentication
- Farm-based access control (users must have a farm to access main dashboard)
- Auto-sync functionality on app load

### 2. Dashboard (Main Page)
**Layout Components:**
- Navigation bar with responsive design
- Header with app name and field location coordinates
- "Draw New Farm Polygon" button linking to polygon drawing page

**Dashboard Sections:**
- **KPI Dashboard**: 4 key performance indicator cards:
  - Water Management (usage, efficiency)
  - Inputs Optimization (fertilizer, pesticides)
  - Pest & Disease Alerts
  - Weather Impact (temperature, rainfall effects)
  
- **AI Field Report**: Main feature card displaying:
  - AI-generated field brief/analysis
  - Key insights and recommendations
  - Visual indicators for field health

- **Interactive Field Map** (3-column layout on large screens):
  - MapLibre GL or React Leaflet map
  - Field boundary visualization
  - Satellite imagery overlay
  - Date timeline selector for viewing historical data
  - Agricultural indices tiles overlay
  - Support for both Polygon and MultiPolygon geometries

- **Weather Summary Sidebar** (1-column on large screens):
  - Current temperature, humidity, wind speed
  - Weather description and icon
  - OpenMeteo API integration
  - Real-time weather updates

- **Quick Field Stats Card**:
  - Crop Coverage percentage
  - Growing Degree Days (last 7 days)
  - Soil Moisture percentage
  - Clear Days count
  - "View Detailed Analytics" button

- **Compact Cards Row** (3-column grid):
  - Alerts Overview card
  - Farm Timeline card (requires farm selection)
  - Additional feature cards

- **Agricultural Indices Section** (collapsible):
  - Support for 12 agricultural indices:
    - **Vegetation**: NDVI, EVI, SAVI, MSAVI
    - **Water**: NDWI
    - **NPK Nutrients**: Nitrogen, Phosphorus, Potassium
    - **Soil Health**: Salinity, pH, Moisture, Carbon
    - **SAR**: SAR Moisture (from Sentinel-1)
  - Index calculation with color-coded visualization
  - Statistics: min, max, mean, standard deviation
  - Time-series data visualization

- **Data Sources Footer**:
  - Badges showing data sources (Sentinel-2, Landsat 8, Landsat 9, Sentinel-1, OpenMeteo)
  - Last updated timestamp
  - System status indicator

### 3. Draw Polygon Page
- Interactive map with drawing tools
- Leaflet Draw integration for polygon creation
- Save polygon as farm boundary
- Support for both single Polygon and MultiPolygon
- Area calculation in hectares
- Farm name and metadata input

### 4. Yield Prediction Page
**Input Form Sections:**
- **Field Information**:
  - Crop Type dropdown (Corn, Wheat, Soybean, Rice)
  - Variety input
  - Planting Date (required)
  - Field Area in hectares (auto-filled from farm data, required)

- **Soil Data**:
  - Soil pH (4-9 range)
  - Organic Matter percentage (0-10%)
  - Nitrogen, Phosphorus, Potassium (kg/ha)
    - Auto-fetched from satellite data via agricultural-indices API
    - Badge indicators showing "From Satellite"
  - Loading state while fetching NPK data

**Prediction Results Display:**
- **Predicted Yield Card**:
  - Large display of predicted yield in Mg/ha (Metric Tons per Hectare)
  - Confidence interval (lower-upper range)
  - Confidence percentage badge
  - Model accuracy (R²) badge

- **Season Progress Card**:
  - Current growth stage
  - Days since planting
  - Days to harvest (if applicable)
  - Progress bar with percentage

- **Feature Importance Card**:
  - Top 5 features contributing to prediction
  - Contribution percentage bars
  - Visual indicators

- **Recommendations Card**:
  - List of actionable recommendations
  - Checkmark icons for each recommendation

- **Risk Factors Card** (if applicable):
  - Risk factors with severity levels (low/medium/high)
  - Impact descriptions
  - Color-coded badges

**Features:**
- "Load Evergreen Farm Data" button for dummy data
- Auto-fetch NPK values from satellite when farm is selected
- Form validation
- Loading states during prediction
- Toast notifications for success/error

### 5. Backend API Endpoints (Supabase Edge Functions)

**Base URL**: `https://{project-ref}.supabase.co/functions/v1`

1. **Health Check** (`GET /health`)
   - Returns server status, version, platform info
   - Response time: ~250ms

2. **Agricultural Indices** (`GET /agricultural-indices`)
   - Query parameters:
     - `index`: Type (ndvi, evi, savi, msavi, ndwi, nitrogen, phosphorus, potassium, salinity, ph, moisture, carbon, sar_moisture)
     - `start`: Start date (YYYY-MM-DD)
     - `end`: End date (YYYY-MM-DD)
     - `polygon`: GeoJSON polygon string (optional, for custom areas)
     - `farm_id`: Farm ID (optional, uses farm geometry)
   - Returns:
     - Tile URL format for map visualization
     - GeoJSON polygon
     - Cloud cover percentage
     - Statistics (min, max, mean, std_dev)
     - Multi-satellite support (Sentinel-2, Landsat 8, Landsat 9)
     - Response time: ~10-15s (includes Earth Engine processing)

3. **Get Available Dates** (`GET /get-available-dates`)
   - Query parameters:
     - `farm_id`: Farm ID
     - `polygon`: GeoJSON polygon (alternative to farm_id)
   - Returns: Array of available satellite observation dates
   - Supports multi-satellite queries

4. **Farm Timeline** (`GET /farm-timeline`)
   - Query parameters:
     - `farm_id`: Farm ID
     - `index`: Index type (optional)
   - Returns: Time-series data for selected farm and index

5. **Sync Satellite Dates** (`POST /sync-satellite-dates`)
   - Syncs available satellite observation dates to database
   - Supports all integrated satellites

### 6. Multi-Satellite Integration
- **Sentinel-2** (COPERNICUS/S2_SR): 10-20m resolution, since 2015-06-23
- **Landsat 8** (LANDSAT/LC08/C02/T1_L2): 30m resolution, since 2013-03-18
- **Landsat 9** (LANDSAT/LC09/C02/T1_L2): 30m resolution, since 2021-10-31
- **Sentinel-1 SAR** (COPERNICUS/S1_GRD): 10m resolution, since 2014-10-03

**Features:**
- Automatic band harmonization (Landsat → Sentinel-2 naming)
- Surface reflectance harmonization with scale factors
- Merged collections for maximum temporal coverage
- Best available data selection (highest resolution, lowest cloud cover)
- 2-3 day revisit time (vs 5 days for single satellite)
- 12+ years of historical data

### 7. Database Schema (Supabase PostgreSQL)

**Tables:**
- `farms`: Farm boundaries and metadata
  - `id` (UUID, primary key)
  - `name` (text)
  - `geometry` (PostGIS geometry, supports Polygon and MultiPolygon)
  - `area_hectares` (numeric)
  - `user_id` (UUID, foreign key to auth.users)
  - `created_at`, `updated_at` (timestamps)

- `satellite_observations`: Available observation dates
  - `id` (UUID, primary key)
  - `farm_id` (UUID, foreign key)
  - `observation_date` (date)
  - `satellite` (text: 'Sentinel-2', 'Landsat-8', 'Landsat-9', 'Sentinel-1')
  - `cloud_cover` (numeric)
  - `created_at` (timestamp)

- `agricultural_indices`: Calculated index values
  - `id` (UUID, primary key)
  - `farm_id` (UUID, foreign key)
  - `index_type` (text)
  - `observation_date` (date)
  - `mean_value` (numeric)
  - `min_value` (numeric)
  - `max_value` (numeric)
  - `std_dev` (numeric)
  - `satellite` (text)
  - `created_at` (timestamp)

### 8. UI/UX Requirements

**Design System:**
- Modern, clean interface with Inter font
- Responsive design (mobile-first approach)
- Dark/light theme support (using next-themes)
- Consistent color palette:
  - Primary, secondary, accent colors
  - Success, warning, error, info colors
  - Gradient backgrounds for cards
- Smooth animations and transitions
- Loading skeletons for async data
- Error boundaries for graceful error handling

**Component Library:**
- Reusable UI components (Button, Card, Input, Badge, Dialog, Toast, Tooltip, Tabs, Separator)
- Consistent spacing and typography
- Accessible components (ARIA labels, keyboard navigation)

**User Experience:**
- Auto-sync satellite observations on app load
- Toast notifications for user actions
- Loading states for all async operations
- Error messages with actionable guidance
- Optimistic UI updates where appropriate
- Query caching (5-minute stale time, 10-minute garbage collection)

### 9. Environment Configuration

**Frontend (.env):**
```env
VITE_API_BASE_URL=https://{project-ref}.supabase.co/functions/v1
VITE_SUPABASE_URL=https://{project-ref}.supabase.co
VITE_SUPABASE_ANON_KEY={anon-key}
```

**Backend (Supabase Secrets):**
```env
GOOGLE_PROJECT_ID={project-id}
GOOGLE_PRIVATE_KEY_ID={private-key-id}
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL={service-account@project.iam.gserviceaccount.com}
GOOGLE_CLIENT_ID={client-id}
GOOGLE_CLIENT_X509_CERT_URL={cert-url}
```

### 10. Key Technical Implementation Details

**Satellite Data Processing:**
- Use Google Earth Engine API for satellite imagery processing
- Implement band harmonization for multi-satellite support
- Cloud masking and filtering
- Temporal compositing for best available data
- Statistical calculations (min, max, mean, std_dev) per polygon

**Agricultural Index Calculations:**
- NDVI: (NIR - Red) / (NIR + Red)
- EVI: 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1))
- SAVI: ((NIR - Red) / (NIR + Red + L)) * (1 + L), where L = 0.5
- MSAVI: (2*NIR + 1 - sqrt((2*NIR + 1)^2 - 8*(NIR - Red))) / 2
- NDWI: (Green - NIR) / (Green + NIR)
- NPK indices: Custom formulas based on spectral bands
- Soil indices: pH, Salinity, Moisture, Carbon calculations

**Map Integration:**
- Support for GeoJSON Polygon and MultiPolygon
- Tile layer integration with Earth Engine tiles
- Interactive date selection for time-series viewing
- Index overlay visualization with color-coded maps

**Performance Optimizations:**
- React Query for intelligent caching
- Lazy loading for heavy components
- Code splitting with React.lazy and Suspense
- Debounced API calls where appropriate
- Optimistic updates for better UX

### 11. Deployment

**Frontend:**
1. Build: `npm run build`
2. Deploy to Firebase Hosting (or Netlify, Cloudflare Pages, Vercel)
3. Configure environment variables

**Backend:**
1. Deploy Edge Functions to Supabase: `supabase functions deploy`
2. Set secrets in Supabase dashboard
3. Configure CORS policies

### 12. Testing & Validation

- Health check endpoint for backend status
- Test all 12 agricultural indices
- Verify multi-satellite data availability
- Test polygon and multi-polygon support
- Validate authentication flow
- Test yield prediction with dummy data
- Verify responsive design on mobile/tablet/desktop

## Success Criteria

The application should:
1. ✅ Display real-time agricultural indices from multiple satellites
2. ✅ Support interactive field mapping with polygon drawing
3. ✅ Provide accurate yield predictions based on satellite and field data
4. ✅ Show weather data integrated with field monitoring
5. ✅ Handle multi-polygon farm boundaries correctly
6. ✅ Process and visualize 12+ years of historical satellite data
7. ✅ Provide responsive, accessible UI with modern design
8. ✅ Handle errors gracefully with user-friendly messages
9. ✅ Support authentication and farm-based access control
10. ✅ Auto-sync satellite observations on app load

## Additional Notes

- Use TypeScript for type safety throughout
- Follow React best practices (hooks, functional components)
- Implement proper error boundaries
- Add comprehensive error handling
- Use semantic HTML for accessibility
- Optimize images and assets
- Implement proper SEO meta tags
- Add loading states for all async operations
- Use toast notifications for user feedback
- Implement proper form validation

---

**Build this precision agriculture platform with attention to detail, modern UI/UX, and robust backend processing capabilities. The platform should be production-ready, scalable, and user-friendly for farmers and agricultural professionals.**
