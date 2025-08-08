// Application Types
export interface AppConfig {
    name: string;
    version: string;
    description: string;
}

// Navigation Types
export interface NavigationItem {
    id: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    href?: string;
    children?: NavigationItem[];
}

// Dashboard Types
export interface KPICard {
    id: string;
    title: string;
    value: string | number;
    change?: number;
    changeType?: 'positive' | 'negative' | 'neutral';
    icon?: React.ComponentType<{ className?: string }>;
    description?: string;
}

export interface WeatherData {
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    pressure: number;
    visibility: number;
    description: string;
    icon: string;
    timestamp: string;
}

export interface Alert {
    id: string;
    type: 'warning' | 'error' | 'info' | 'success';
    title: string;
    message: string;
    timestamp: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    isRead: boolean;
}

// Map Types
export interface MapConfig {
    center: [number, number];
    zoom: number;
    style: string;
}

export interface FieldBoundary {
    type: 'Feature';
    geometry: {
        type: 'Polygon';
        coordinates: number[][][];
    };
    properties: {
        fieldId: string;
        area: number;
        cropType?: string;
    };
}

export interface SatelliteData {
    urlFormat: string;
    geojson: Record<string, unknown>;
    poiPolygon: Record<string, unknown>;
    timestamp: string;
    cloudCover: number;
    resolution: string;
}

// Earth Engine Types
export interface EarthEngineConfig {
    projectId: string;
    privateKeyId: string;
    privateKey: string;
    clientEmail: string;
    clientId: string;
    clientX509CertUrl: string;
}

export interface EarthEngineResponse {
    urlFormat: string;
    geojson: Record<string, unknown>;
    poiPolygon: Record<string, unknown>;
}

// API Types
export interface ApiResponse<T> {
    data: T;
    status: 'success' | 'error';
    message?: string;
    timestamp: string;
}

export interface ApiError {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
}

// Form Types
export interface FormField {
    name: string;
    label: string;
    type: 'text' | 'email' | 'password' | 'number' | 'select' | 'textarea';
    required?: boolean;
    placeholder?: string;
    options?: { value: string; label: string }[];
    validation?: Record<string, unknown>;
}

// Theme Types
export interface ThemeConfig {
    mode: 'light' | 'dark' | 'system';
    primaryColor: string;
    accentColor: string;
}

// User Types
export interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user' | 'viewer';
    preferences: {
        theme: ThemeConfig;
        notifications: boolean;
        language: string;
    };
}

// Crop Types
export interface CropData {
    id: string;
    name: string;
    type: string;
    plantedDate: string;
    expectedHarvestDate: string;
    area: number;
    health: number;
    moisture: number;
    ndvi: number;
    status: 'growing' | 'mature' | 'harvested' | 'fallow';
}

// Sensor Types
export interface SensorData {
    id: string;
    type: 'soil' | 'weather' | 'satellite';
    location: [number, number];
    readings: {
        timestamp: string;
        value: number;
        unit: string;
    }[];
}

// Analytics Types
export interface AnalyticsData {
    period: string;
    metrics: {
        ndvi: number;
        moisture: number;
        temperature: number;
        rainfall: number;
    };
    trends: {
        ndvi: 'increasing' | 'decreasing' | 'stable';
        moisture: 'increasing' | 'decreasing' | 'stable';
        temperature: 'increasing' | 'decreasing' | 'stable';
    };
}

// Component Props Types
export interface BaseComponentProps {
    className?: string;
    children?: React.ReactNode;
}

export interface CardProps extends BaseComponentProps {
    title?: string;
    subtitle?: string;
    header?: React.ReactNode;
    footer?: React.ReactNode;
}

export interface ButtonProps extends BaseComponentProps {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
}

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
}; 