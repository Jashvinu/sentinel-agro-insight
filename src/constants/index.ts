// Application Constants
export const APP_CONFIG = {
    name: 'wrkFarm',
    version: '1.0.0',
    description: 'Precision agriculture platform monitoring crop health with Sentinel-2 satellite imagery',
    author: 'wrkFarm Team',
    repository: 'https://github.com/wrkfarm',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
    earthEngine: '/api/ee',
    weather: '/api/weather',
    health: '/api/health',
    alerts: '/api/alerts',
    analytics: '/api/analytics',
} as const;

// Map Configuration
export const MAP_CONFIG = {
    defaultCenter: [77.77333199305133, 12.392392446684909] as [number, number],
    defaultZoom: 15,
    maxZoom: 20,
    minZoom: 10,
    tileServer: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
} as const;

// Field Boundaries (POI)
export const FIELD_BOUNDARIES = {
    coordinates: [
        [77.77333199305133, 12.392392446684909],
        [77.77285377084087, 12.391034719901086],
        [77.77415744218291, 12.390603704636632],
        [77.77438732135664, 12.391302225016886],
        [77.77376792469431, 12.391501801924363],
        [77.77399141833513, 12.392187846379386],
        [77.77333199305133, 12.392392446684909],
    ],
    area: 0.15, // hectares
    location: 'Bangalore, Karnataka, India',
} as const;

// Satellite Data Configuration
export const SATELLITE_CONFIG = {
    collection: 'COPERNICUS/S2_SR',
    cloudCoverThreshold: 20,
    resolution: '10m',
    bands: ['B2', 'B3', 'B4', 'B5', 'B6', 'B8', 'B11', 'B12'], // All bands for agricultural indices
    dateRange: {
        start: '2024-01-01',
        end: '2024-12-31',
    },
} as const;

// Weather Configuration
export const WEATHER_CONFIG = {
    updateInterval: 300000, // 5 minutes
    defaultLocation: {
        lat: 12.392392446684909,
        lon: 77.77333199305133,
    },
    units: 'metric',
} as const;

// Dashboard Configuration
export const DASHBOARD_CONFIG = {
    refreshInterval: 60000, // 1 minute
    maxAlerts: 10,
    kpiCards: [
        {
            id: 'ndvi',
            title: 'NDVI Index',
            description: 'Vegetation health index',
            unit: '',
            minValue: 0,
            maxValue: 1,
        },
        {
            id: 'moisture',
            title: 'Soil Moisture',
            description: 'Soil moisture content',
            unit: '%',
            minValue: 0,
            maxValue: 100,
        },
        {
            id: 'temperature',
            title: 'Temperature',
            description: 'Current temperature',
            unit: '°C',
            minValue: -20,
            maxValue: 50,
        },
        {
            id: 'rainfall',
            title: 'Rainfall',
            description: 'Daily rainfall',
            unit: 'mm',
            minValue: 0,
            maxValue: 100,
        },
    ],
} as const;

// Agricultural Indices Configuration
export const AGRICULTURAL_INDICES = {
    // NPK Nutrient Indices
    nitrogen: {
        id: 'nitrogen',
        name: 'Nitrogen (N)',
        category: 'NPK',
        unit: 'kg N/ha',
        description: 'Soil nitrogen content for crop nutrition',
        formulas: {
            primary: 'NDVI = (B8 - B4) / (B8 + B4)',
            conversion: 'N = 259.4 × NDVI - 58.6 (R²=0.90)',
            alternative: 'N = 300 × (NDVI - 0.3) / 0.55',
            lateSeason: 'NDRE = (B6 - B5) / (B6 + B5)',
            lateSeasonConversion: 'N = 45.2 × NDRE + 125.8 (R²=0.91)'
        },
        ranges: {
            low: { min: 0, max: 100, color: '#ef4444', status: 'Deficient' },
            medium: { min: 100, max: 200, color: '#f59e0b', status: 'Adequate' },
            high: { min: 200, max: 300, color: '#10b981', status: 'Optimal' }
        },
        accuracy: 'R² = 0.85-0.95',
        requiresCalibration: true
    },
    phosphorus: {
        id: 'phosphorus',
        name: 'Phosphorus (P₂O₅)',
        category: 'NPK',
        unit: 'kg P₂O₅/ha',
        description: 'Soil phosphorus content for root development',
        formulas: {
            primary: 'EVI = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)',
            conversion: 'P₂O₅ = 180 × EVI - 25',
            alternative: 'P₂O₅ = 220 × NDRE + 35'
        },
        ranges: {
            low: { min: 0, max: 50, color: '#ef4444', status: 'Deficient' },
            medium: { min: 50, max: 100, color: '#f59e0b', status: 'Adequate' },
            high: { min: 100, max: 200, color: '#10b981', status: 'Optimal' }
        },
        accuracy: 'R² = 0.70-0.85',
        requiresCalibration: true
    },
    potassium: {
        id: 'potassium',
        name: 'Potassium (K₂O)',
        category: 'NPK',
        unit: 'kg K₂O/ha',
        description: 'Soil potassium content for disease resistance',
        formulas: {
            primary: 'SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5',
            conversion: 'K₂O = 250 × SAVI - 40',
            alternative: 'K₂O = 180 × NDMI + 60'
        },
        ranges: {
            low: { min: 0, max: 100, color: '#ef4444', status: 'Deficient' },
            medium: { min: 100, max: 200, color: '#f59e0b', status: 'Adequate' },
            high: { min: 200, max: 300, color: '#10b981', status: 'Optimal' }
        },
        accuracy: 'R² = 0.70-0.85',
        requiresCalibration: true
    },

    // Salinity Indices
    salinity: {
        id: 'salinity',
        name: 'Soil Salinity',
        category: 'Salinity',
        unit: 'dS/m (ECe)',
        description: 'Electrical conductivity for salt content assessment',
        formulas: {
            primary: 'SI = B2 × B4',
            ndsi: 'NDSI = (B4 - B8) / (B4 + B8)',
            conversion: 'ECe = 0.0045 × SI + 1.2',
            advanced: 'ECe = 2.1×SI + 0.8×NDSI - 0.6×BI + 3.2',
            tds: 'TDS = EC × 800 (for EC < 5 dS/m)',
            saltContent: 'Salt Content (%) = ECe × 0.064 / 100'
        },
        ranges: {
            low: { min: 0, max: 2, color: '#10b981', status: 'Normal' },
            medium: { min: 2, max: 8, color: '#f59e0b', status: 'Moderate' },
            high: { min: 8, max: 16, color: '#ef4444', status: 'High' },
            critical: { min: 16, max: 25, color: '#dc2626', status: 'Critical' }
        },
        accuracy: 'R² = 0.70-0.85',
        requiresCalibration: true
    },

    // pH Indices
    ph: {
        id: 'ph',
        name: 'Soil pH',
        category: 'pH',
        unit: 'pH units',
        description: 'Soil acidity/alkalinity for nutrient availability',
        formulas: {
            simple: 'pH = 0.023×B2 - 0.015×B11 + 7.2 (±0.35)',
            advanced: 'pH = 5.8 + 0.12×BI - 0.08×SI₂ + 0.05×B8',
            brightnessIndex: 'BI = √(B4² + B8²)',
            salinityIndex2: 'SI₂ = B3² + B4²'
        },
        ranges: {
            acidic: { min: 4.0, max: 6.0, color: '#ef4444', status: 'Acidic' },
            neutral: { min: 6.0, max: 7.5, color: '#10b981', status: 'Neutral' },
            alkaline: { min: 7.5, max: 9.0, color: '#f59e0b', status: 'Alkaline' }
        },
        accuracy: 'R² = 0.70-0.87',
        requiresCalibration: true
    },

    // Moisture Indices
    moisture: {
        id: 'moisture',
        name: 'Soil Moisture',
        category: 'Moisture',
        unit: '% (volumetric)',
        description: 'Soil water content for irrigation planning',
        formulas: {
            primary: 'NDMI = (B8 - B11) / (B8 + B11)',
            conversion: 'Volumetric Moisture (%) = 45.2 × NDMI - 8.7',
            ndwi: 'NDWI = (B3 - B8) / (B3 + B8)',
            waterStress: 'NMDI = (B8 - (B11 - B12)) / (B8 + (B11 - B12))'
        },
        ranges: {
            dry: { min: 5, max: 15, color: '#ef4444', status: 'Dry' },
            moderate: { min: 15, max: 25, color: '#f59e0b', status: 'Moderate' },
            moist: { min: 25, max: 35, color: '#10b981', status: 'Moist' },
            wet: { min: 35, max: 45, color: '#3b82f6', status: 'Wet' }
        },
        accuracy: 'R² = 0.65-0.80',
        requiresCalibration: true
    },

    // Carbon Indices
    carbon: {
        id: 'carbon',
        name: 'Soil Organic Carbon',
        category: 'Carbon',
        unit: '% (SOC)',
        description: 'Soil organic matter content for fertility',
        formulas: {
            simple: 'SOC (%) = 12.5 × NDVI - 3.2 (R²=0.79)',
            enhanced: 'SOC (%) = 8.5 × EVI + 2.1 × SAVI - 1.8',
            multiIndex: 'SOC (%) = 15×NDVI + 8×EVI + 5×OSAVI - 7.5',
            carbonStock: 'SOC (Mg/ha) = 85 × EVI - 15 (0-30cm depth)'
        },
        ranges: {
            low: { min: 0.5, max: 2.0, color: '#ef4444', status: 'Low' },
            medium: { min: 2.0, max: 5.0, color: '#f59e0b', status: 'Medium' },
            high: { min: 5.0, max: 10.0, color: '#10b981', status: 'High' },
            veryHigh: { min: 10.0, max: 15.0, color: '#059669', status: 'Very High' }
        },
        accuracy: 'R² = 0.75-0.90',
        requiresCalibration: true
    },

    // Vegetation Indices
    ndvi: {
        id: 'ndvi',
        name: 'NDVI',
        category: 'Vegetation',
        unit: 'Index',
        description: 'Normalized Difference Vegetation Index',
        formulas: {
            primary: 'NDVI = (B8 - B4) / (B8 + B4)'
        },
        ranges: {
            low: { min: 0, max: 0.3, color: '#ef4444', status: 'Low' },
            medium: { min: 0.3, max: 0.6, color: '#f59e0b', status: 'Medium' },
            high: { min: 0.6, max: 1.0, color: '#10b981', status: 'High' }
        },
        accuracy: 'R² = 0.85-0.95',
        requiresCalibration: false
    },
    evi: {
        id: 'evi',
        name: 'EVI',
        category: 'Vegetation',
        unit: 'Index',
        description: 'Enhanced Vegetation Index',
        formulas: {
            primary: 'EVI = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)'
        },
        ranges: {
            low: { min: 0, max: 0.3, color: '#ef4444', status: 'Low' },
            medium: { min: 0.3, max: 0.6, color: '#f59e0b', status: 'Medium' },
            high: { min: 0.6, max: 1.0, color: '#10b981', status: 'High' }
        },
        accuracy: 'R² = 0.80-0.90',
        requiresCalibration: false
    },
    savi: {
        id: 'savi',
        name: 'SAVI',
        category: 'Vegetation',
        unit: 'Index',
        description: 'Soil Adjusted Vegetation Index',
        formulas: {
            primary: 'SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5'
        },
        ranges: {
            low: { min: 0, max: 0.3, color: '#ef4444', status: 'Low' },
            medium: { min: 0.3, max: 0.6, color: '#f59e0b', status: 'Medium' },
            high: { min: 0.6, max: 1.0, color: '#10b981', status: 'High' }
        },
        accuracy: 'R² = 0.80-0.90',
        requiresCalibration: false
    },
    msavi: {
        id: 'msavi',
        name: 'MSAVI',
        category: 'Vegetation',
        unit: 'Index',
        description: 'Modified Soil Adjusted Vegetation Index',
        formulas: {
            primary: 'MSAVI = (2×B8 + 1 - √((2×B8 + 1)² - 8×(B8 - B4))) / 2'
        },
        ranges: {
            low: { min: 0, max: 0.3, color: '#ef4444', status: 'Low' },
            medium: { min: 0.3, max: 0.6, color: '#f59e0b', status: 'Medium' },
            high: { min: 0.6, max: 1.0, color: '#10b981', status: 'High' }
        },
        accuracy: 'R² = 0.80-0.90',
        requiresCalibration: false
    },
    ndwi: {
        id: 'ndwi',
        name: 'NDWI',
        category: 'Water',
        unit: 'Index',
        description: 'Normalized Difference Water Index',
        formulas: {
            primary: 'NDWI = (B3 - B8) / (B3 + B8)'
        },
        ranges: {
            dry: { min: -1, max: 0, color: '#ef4444', status: 'Dry' },
            moist: { min: 0, max: 0.2, color: '#f59e0b', status: 'Moist' },
            wet: { min: 0.2, max: 0.5, color: '#10b981', status: 'Wet' },
            water: { min: 0.5, max: 1, color: '#3b82f6', status: 'Water' }
        },
        accuracy: 'R² = 0.70-0.85',
        requiresCalibration: false
    }
} as const;

// Alert Severity Levels
export const ALERT_SEVERITY = {
    low: {
        color: 'bg-blue-500',
        textColor: 'text-blue-500',
        icon: 'info',
    },
    medium: {
        color: 'bg-yellow-500',
        textColor: 'text-yellow-500',
        icon: 'warning',
    },
    high: {
        color: 'bg-orange-500',
        textColor: 'text-orange-500',
        icon: 'alert-triangle',
    },
    critical: {
        color: 'bg-red-500',
        textColor: 'text-red-500',
        icon: 'alert-circle',
    },
} as const;

// Navigation Items
export const NAVIGATION_ITEMS = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/',
    },
    {
        id: 'map',
        label: 'Field Map',
        href: '/map',
    },
    {
        id: 'analytics',
        label: 'Analytics',
        href: '/analytics',
    },
    {
        id: 'alerts',
        label: 'Alerts',
        href: '/alerts',
    },
    {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
    },
] as const;

// Data Sources
export const DATA_SOURCES = [
    {
        name: 'Sentinel-2 L2A',
        description: 'ESA Sentinel-2 Level-2A product',
        resolution: '10m',
        updateFrequency: '5 days',
    },
    {
        name: 'ERA5-Land',
        description: 'ECMWF ERA5-Land reanalysis',
        resolution: '9km',
        updateFrequency: '1 hour',
    },
    {
        name: 'CHIRPS v2',
        description: 'Climate Hazards Group InfraRed Precipitation',
        resolution: '5km',
        updateFrequency: 'Daily',
    },
] as const;

// Color Palettes
export const COLOR_PALETTES = {
    ndvi: ['red', 'yellow', 'green', 'darkgreen'],
    moisture: ['#ff0000', '#ffff00', '#00ff00', '#008000'],
    temperature: ['#0000ff', '#00ffff', '#ffff00', '#ff0000'],
    rainfall: ['#ffffff', '#00ffff', '#0080ff', '#0000ff'],
} as const;

// Time Intervals
export const TIME_INTERVALS = {
    realtime: 30000, // 30 seconds
    frequent: 60000, // 1 minute
    normal: 300000, // 5 minutes
    slow: 900000, // 15 minutes
    daily: 86400000, // 24 hours
} as const;

// Error Messages
export const ERROR_MESSAGES = {
    networkError: 'Network error. Please check your connection.',
    serverError: 'Server error. Please try again later.',
    earthEngineError: 'Earth Engine service unavailable.',
    weatherError: 'Weather data unavailable.',
    mapError: 'Map loading failed.',
    genericError: 'An unexpected error occurred.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    dataUpdated: 'Data updated successfully.',
    settingsSaved: 'Settings saved successfully.',
    exportComplete: 'Export completed successfully.',
    syncComplete: 'Data sync completed.',
} as const;

// Validation Rules
export const VALIDATION_RULES = {
    email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Please enter a valid email address.',
    },
    password: {
        minLength: 8,
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number.',
    },
    coordinates: {
        lat: {
            min: -90,
            max: 90,
            message: 'Latitude must be between -90 and 90.',
        },
        lon: {
            min: -180,
            max: 180,
            message: 'Longitude must be between -180 and 180.',
        },
    },
} as const; 