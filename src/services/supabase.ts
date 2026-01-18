import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

// Check if Supabase is configured
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Not configured - using local Express server instead. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase.'
  );
}

// Create Supabase client only if configured, otherwise create a mock
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Helper to check if Supabase is available
export const isSupabaseAvailable = (): boolean => supabase !== null;

// Database types
export type Geometry = 
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface Farm {
  id: string;
  name: string;
  geometry: Geometry;
  bounds?: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
  area_hectares?: number | null;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FarmInsert {
  name: string;
  geometry: Geometry;
  bounds?: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  area_hectares?: number;
  user_id?: string;
}


