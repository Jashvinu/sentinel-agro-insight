// Application Constants
export const APP_CONFIG = {
    name: 'Sentinel Agro Insight',
    version: '1.0.0',
    description: 'Precision agriculture platform monitoring crop health with Sentinel-2 satellite imagery',
    author: 'Sentinel Agro Insight Team',
    repository: 'https://github.com/sentinel-agro-insight',
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
    bands: ['B4', 'B8'], // Red and NIR bands
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