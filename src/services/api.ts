import { API_ENDPOINTS, ERROR_MESSAGES } from '@/constants';
import { ApiResponse, ApiError, EarthEngineResponse } from '@/types';
import { retry } from '@/utils';

const VALID_PROTOCOLS = new Set(['http:', 'https:']);
const URL_MATCHER = /^https?:\/\//i;
const SUPABASE_FUNCTIONS_PATH = '/functions/v1';

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const validateApiBaseUrl = (value: string, source: string): string => {
    const parsed = new URL(value);
    if (!VALID_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`${source} must use http or https.`);
    }
    const normalised = stripTrailingSlash(parsed.toString());
    if (!normalised.endsWith(SUPABASE_FUNCTIONS_PATH)) {
        throw new Error(`${source} must point to a Supabase Edge Functions URL ending in ${SUPABASE_FUNCTIONS_PATH}.`);
    }
    return normalised;
};

const resolveApiBaseUrl = (): string => {
    const envValue = import.meta.env.VITE_API_BASE_URL?.trim();
    if (envValue) {
        return validateApiBaseUrl(envValue, 'VITE_API_BASE_URL');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL is required. Diagnostics only support Supabase Edge Functions.');
    }

    const parsed = new URL(supabaseUrl);
    if (!VALID_PROTOCOLS.has(parsed.protocol)) {
        throw new Error('VITE_SUPABASE_URL must use http or https.');
    }
    return `${stripTrailingSlash(parsed.toString())}${SUPABASE_FUNCTIONS_PATH}`;
};

export const API_BASE_URL = resolveApiBaseUrl();

export const getSupabaseFunctionHeaders = (): Record<string, string> => {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
    const headers: Record<string, string> = {};

    if (!anonKey) {
        throw new Error('VITE_SUPABASE_ANON_KEY is required for Supabase Edge Function requests.');
    }

    headers['apikey'] = anonKey;
    headers['Authorization'] = `Bearer ${anonKey}`;
    return headers;
};

export const buildApiUrl = (path = ''): string => {
    // For all endpoints, use the resolved API base URL (Supabase Edge Functions)
    if (!path) {
        return API_BASE_URL;
    }

    if (URL_MATCHER.test(path)) {
        return stripTrailingSlash(path);
    }

    const normalisedPath = path.startsWith('/') ? path : `/${path}`;
    return `${stripTrailingSlash(API_BASE_URL)}${normalisedPath}`;
};

// Custom error class for API errors
export class ApiException extends Error {
    constructor(
        message: string,
        public status: number,
        public code?: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ApiException';
    }
}

// HTTP client class
class HttpClient {
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = buildApiUrl(endpoint);

        // Include Supabase auth headers for all requests
        const supabaseHeaders = getSupabaseFunctionHeaders();

        const config: RequestInit = {
            headers: {
                'Content-Type': 'application/json',
                ...supabaseHeaders,
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new ApiException(
                    errorData.message || `HTTP ${response.status}`,
                    response.status,
                    errorData.code,
                    errorData.details
                );
            }

            return await response.json();
        } catch (error) {
            if (error instanceof ApiException) {
                throw error;
            }

            // Network or other errors
            throw new ApiException(
                ERROR_MESSAGES.networkError,
                0,
                'NETWORK_ERROR'
            );
        }
    }

    async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET', ...options });
    }

    async post<T>(endpoint: string, data?: Record<string, unknown>, options?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
            ...options,
        });
    }

    async put<T>(endpoint: string, data?: Record<string, unknown>, options?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
            ...options,
        });
    }

    async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE', ...options });
    }
}

// Create HTTP client instance
const httpClient = new HttpClient();

// API service class
export class ApiService {
    // Earth Engine API
    static async getEarthEngineData(): Promise<EarthEngineResponse> {
        return retry(
            () => httpClient.get<EarthEngineResponse>(API_ENDPOINTS.earthEngine),
            3,
            1000
        );
    }

    // Agricultural Indices API
    static async getAgriculturalIndices(
        index: string = 'msavi',
        start: string = '2024-01-01',
        end: string = '2024-12-31'
    ): Promise<EarthEngineResponse> {
        const params = new URLSearchParams({
            index,
            start,
            end,
        });

        return retry(
            () => httpClient.get<EarthEngineResponse>(`${API_ENDPOINTS.agriculturalIndices}?${params}`),
            3,
            1000
        );
    }

    // Weather API
    static async getWeatherData(lat: number, lon: number): Promise<Record<string, unknown>> {
        const params = new URLSearchParams({
            latitude: lat.toString(),
            longitude: lon.toString(),
        });

        return retry(
            () => httpClient.get<Record<string, unknown>>(`${API_ENDPOINTS.weather}?${params}`),
            3,
            1000
        );
    }

    // Health check
    static async healthCheck(): Promise<{ status: string; message: string }> {
        return httpClient.get<{ status: string; message: string }>(API_ENDPOINTS.health);
    }

    // Alerts API
    static async getAlerts(): Promise<Record<string, unknown>[]> {
        return retry(
            () => httpClient.get<Record<string, unknown>[]>(API_ENDPOINTS.alerts),
            3,
            1000
        );
    }

    // Analytics API
    static async getAnalytics(period: string): Promise<Record<string, unknown>> {
        const params = new URLSearchParams({ period });
        return retry(
            () => httpClient.get<Record<string, unknown>>(`${API_ENDPOINTS.analytics}?${params}`),
            3,
            1000
        );
    }

    // Generic data fetch with caching
    static async fetchWithCache<T>(
        endpoint: string,
        cacheKey: string,
        cacheDuration: number = 5 * 60 * 1000 // 5 minutes default
    ): Promise<T> {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < cacheDuration) {
                return data;
            }
        }

        const data = await httpClient.get<T>(endpoint);

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));

        return data;
    }

    // Upload file
    static async uploadFile(
        endpoint: string,
        file: File,
        onProgress?: (progress: number) => void
    ): Promise<Record<string, unknown>> {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable && onProgress) {
                    const progress = (event.loaded / event.total) * 100;
                    onProgress(progress);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText) as Record<string, unknown>;
                        resolve(response);
                    } catch {
                        resolve({ raw: xhr.responseText });
                    }
                } else {
                    reject(new ApiException(
                        `Upload failed: ${xhr.status}`,
                        xhr.status
                    ));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new ApiException(
                    ERROR_MESSAGES.networkError,
                    0,
                    'UPLOAD_ERROR'
                ));
            });

            xhr.open('POST', buildApiUrl(endpoint));
            xhr.send(formData);
        });
    }
}

// Export default instance
export default ApiService; 
