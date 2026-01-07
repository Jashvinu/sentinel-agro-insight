# AI Studio Prompt: Sentinel Agro Insight - UI & Features

Build **Sentinel Agro Insight** - a precision agriculture web platform for monitoring crop health using satellite imagery. The platform uses **Google Earth Engine** to process multi-satellite data (Sentinel-2, Landsat 8/9, Sentinel-1 SAR).

## Website Pages & UI Features

### 1. Login/Signup Page
- Clean authentication forms
- Email/password login and registration
- User-friendly error messages
- Redirect to dashboard after login

### 2. Main Dashboard Page

**Header Section:**
- App name: "Sentinel Agro Insight"
- Field location coordinates display
- "Draw New Farm Polygon" button (top right)

**KPI Dashboard Cards (4 cards in a row):**
- **Water Management**: Usage percentage, efficiency metrics
- **Inputs Optimization**: Fertilizer and pesticide usage stats
- **Pest & Disease Alerts**: Alert count with severity indicators
- **Weather Impact**: Temperature and rainfall effects summary

**AI Field Report Card (Main Feature):**
- Large prominent card displaying AI-generated field analysis
- Key insights and recommendations
- Visual health indicators (color-coded)
- Actionable recommendations list

**Main Content Grid:**
- **Left Side (3 columns)**: Interactive Field Map
  - Large map showing farm boundaries
  - Satellite imagery overlay
  - Date timeline slider/selector at bottom
  - Toggle buttons for different agricultural indices
  - Color-coded visualization based on selected index
  - Support for viewing historical data by date
  
- **Right Side (1 column)**: Weather Summary
  - Current temperature, humidity, wind speed
  - Weather description with icon
  - Real-time weather updates
  - Quick stats below:
    - Crop Coverage percentage
    - Growing Degree Days (last 7 days)
    - Soil Moisture percentage
    - Clear Days count
  - "View Detailed Analytics" button

**Bottom Section:**
- **Alerts Overview Card**: List of field health alerts
- **Farm Timeline Card**: Timeline visualization (requires farm selection)
- **Additional Feature Cards**: Placeholder for future features

**Collapsible Agricultural Indices Section:**
- Expandable/collapsible card
- Support for 12 agricultural indices:
  - **Vegetation Indices**: NDVI, EVI, SAVI, MSAVI
  - **Water Index**: NDWI
  - **NPK Nutrients**: Nitrogen, Phosphorus, Potassium
  - **Soil Health**: Salinity, pH, Moisture, Carbon
  - **SAR**: SAR Moisture (from Sentinel-1)
- Each index shows: value, status, color-coded visualization, statistics (min, max, mean, std dev)
- Time-series charts for historical trends

**Footer:**
- Data sources badges (Sentinel-2, Landsat 8, Landsat 9, Sentinel-1, OpenMeteo)
- Last updated timestamp
- System status indicator (green dot = operational)

### 3. Draw Polygon Page
- Full-screen interactive map
- Drawing tools toolbar (polygon, rectangle, circle)
- Draw farm boundaries on the map
- Form to enter:
  - Farm name
  - Crop type
  - Area (auto-calculated from polygon)
- Save button to store farm boundary
- Support for complex shapes (multi-polygon fields)

### 4. Yield Prediction Page

**Left Side - Input Form:**

**Field Information Section:**
- Crop Type dropdown (Corn, Wheat, Soybean, Rice)
- Variety input field
- Planting Date picker (required)
- Field Area in hectares (auto-filled from farm data, required)

**Soil Data Section:**
- Soil pH slider/input (range 4-9)
- Organic Matter percentage input (0-10%)
- Nitrogen, Phosphorus, Potassium inputs (kg/ha)
  - "From Satellite" badges indicating auto-fetched data
  - Loading indicator while fetching from Google Earth Engine
- Auto-fetch button to get NPK values from satellite data

**Predict Button:**
- Large, prominent button
- Loading state with spinner
- Disabled state when form incomplete

**Right Side - Results Display:**

**Predicted Yield Card:**
- Large number display (e.g., "8.45 Mg/ha")
- Subtitle: "Metric Tons per Hectare"
- Confidence interval range below
- Confidence percentage badge (color-coded: green >75%, yellow >50%, gray <50%)
- Model accuracy badge (R² score)

**Season Progress Card:**
- Current growth stage name
- Days since planting
- Days to harvest (if applicable)
- Progress bar showing season completion percentage
- Percentage text below bar

**Feature Importance Card:**
- Top 5 features contributing to prediction
- Horizontal bars showing contribution percentage
- Feature names with percentages

**Recommendations Card:**
- List of actionable recommendations
- Checkmark icons for each item
- Clean, readable list format

**Risk Factors Card** (if applicable):
- Risk factors with severity badges (low/medium/high)
- Impact descriptions
- Color-coded by severity (red=high, yellow=medium, gray=low)

**Empty State:**
- When no prediction yet: Icon, message "Fill in the form and click 'Predict Yield' to see predictions"

## Design Requirements

### Visual Style
- **Modern, clean interface** with professional agricultural theme
- **Inter font family** for typography
- **Responsive design**: Works on mobile, tablet, and desktop
- **Dark/Light theme** toggle support
- **Color palette**:
  - Primary colors for main actions
  - Success green for positive metrics
  - Warning yellow/orange for alerts
  - Error red for critical issues
  - Muted grays for secondary text
  - Gradient backgrounds for cards

### User Experience
- **Smooth animations** for page transitions and interactions
- **Loading states**: Skeleton loaders while data fetches
- **Toast notifications** for success/error messages
- **Error handling**: User-friendly error messages with clear actions
- **Accessibility**: Keyboard navigation, screen reader support, ARIA labels
- **Form validation**: Real-time validation with helpful error messages

### Interactive Elements
- **Maps**: Clickable, zoomable, draggable
- **Charts**: Interactive tooltips, hover states
- **Buttons**: Clear hover and active states
- **Cards**: Subtle hover effects
- **Dropdowns**: Smooth open/close animations

## Google Earth Engine Integration

The platform must use **Google Earth Engine** to:
- Process satellite imagery from multiple sources (Sentinel-2, Landsat 8/9, Sentinel-1 SAR)
- Calculate 12 agricultural indices for any given polygon/field
- Generate map tiles for visualization
- Provide statistical data (min, max, mean, standard deviation) for each index
- Handle cloud masking and temporal compositing
- Support date range queries for historical data
- Process both single polygons and multi-polygon fields

## Key Features

1. **Multi-Satellite Support**: Automatically uses best available satellite data (highest resolution, lowest cloud cover)
2. **Historical Data**: View field data going back 12+ years
3. **Real-time Updates**: Weather data and recent satellite observations
4. **Field Management**: Create, view, and manage multiple farm boundaries
5. **Time-Series Analysis**: View how indices change over time with interactive charts
6. **Yield Prediction**: ML-based predictions using satellite-derived soil data
7. **Alerts System**: Notifications for field health issues, weather impacts, pest risks

## User Flow

1. **Login** → User authenticates
2. **Dashboard** → View field overview, map, weather, KPIs
3. **Draw Polygon** → Create new farm boundary (if needed)
4. **Select Date** → Choose historical date to view on map
5. **Select Index** → Toggle between different agricultural indices
6. **Yield Prediction** → Enter field data, get yield prediction
7. **View Alerts** → Check field health notifications

Build a beautiful, intuitive, and functional precision agriculture platform that makes satellite-based field monitoring accessible and actionable for farmers.
