# AI Studio Prompt: Sentinel Agro Insight - UI & Features

Build **Sentinel Agro Insight** - a precision agriculture web platform for monitoring crop health using satellite imagery. The platform uses **Google Earth Engine** to process multi-satellite data (Sentinel-2, Landsat 8/9, Sentinel-1 SAR).

## Website Pages & UI

### 1. Login/Signup Page
- Clean authentication forms
- Email/password login and registration
- User-friendly error messages

### 2. Main Dashboard

**Header:**
- App name: "Sentinel Agro Insight"
- Field location coordinates
- "Draw New Farm Polygon" button

**KPI Cards (4 in a row):**
- Water Management (usage, efficiency)
- Inputs Optimization (fertilizer, pesticides)
- Pest & Disease Alerts (count, severity)
- Weather Impact (temperature, rainfall effects)

**AI Field Report Card:**
- Large prominent card with AI-generated field analysis
- Key insights and recommendations
- Visual health indicators

**Main Grid:**
- **Left (3 cols)**: Interactive Field Map
  - Farm boundaries with satellite imagery overlay
  - Date timeline selector
  - Toggle buttons for 12 agricultural indices
  - Color-coded visualization
  
- **Right (1 col)**: Weather Summary
  - Current temperature, humidity, wind speed
  - Weather icon and description
  - Quick stats: Crop Coverage %, Growing Degree Days, Soil Moisture %, Clear Days
  - "View Detailed Analytics" button

**Bottom:**
- Alerts Overview card
- Farm Timeline card
- Additional feature cards

**Collapsible Agricultural Indices:**
- 12 indices: NDVI, EVI, SAVI, MSAVI, NDWI, Nitrogen, Phosphorus, Potassium, Salinity, pH, Moisture, Carbon, SAR Moisture
- Each shows: value, status, statistics (min, max, mean, std dev)
- Time-series charts

**Footer:**
- Data sources badges
- Last updated timestamp
- System status indicator

### 3. Draw Polygon Page
- Full-screen interactive map
- Drawing tools (polygon, rectangle, circle)
- Form: Farm name, crop type, area (auto-calculated)
- Save button
- Support for multi-polygon fields

### 4. Yield Prediction Page

**Left - Input Form:**
- Field Information: Crop type dropdown, variety, planting date, field area
- Soil Data: pH (4-9), organic matter (0-10%), NPK (kg/ha) with "From Satellite" badges
- Auto-fetch NPK button
- Predict button

**Right - Results:**
- Predicted Yield card: Large number (Mg/ha), confidence interval, confidence badge, R² badge
- Season Progress: Growth stage, days since planting, days to harvest, progress bar
- Feature Importance: Top 5 features with contribution bars
- Recommendations: Actionable list with checkmarks
- Risk Factors: Severity badges, impact descriptions

## Design Requirements

- Modern, clean interface with Inter font
- Responsive (mobile, tablet, desktop)
- Dark/light theme toggle
- Smooth animations
- Loading skeletons
- Toast notifications
- Accessible (keyboard nav, ARIA labels)
- Color-coded: success green, warning yellow, error red

## Google Earth Engine Integration

Must use **Google Earth Engine** to:
- Process satellite imagery (Sentinel-2, Landsat 8/9, Sentinel-1 SAR)
- Calculate 12 agricultural indices for any polygon/field
- Generate map tiles for visualization
- Provide statistics (min, max, mean, std dev)
- Handle cloud masking and temporal compositing
- Support date range queries
- Process single and multi-polygon fields

## Key Features

- Multi-satellite support (best available data)
- Historical data (12+ years)
- Real-time weather updates
- Field management (create, view, manage farms)
- Time-series analysis with charts
- ML-based yield prediction
- Alerts system for field health

Build a beautiful, intuitive precision agriculture platform that makes satellite-based field monitoring accessible for farmers.
