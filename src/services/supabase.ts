import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  throw new Error(
    'Supabase is required. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; generated or local-only data is not supported.'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseAvailable = (): boolean => true;

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
  sowing_date?: string | null;
  crop_type?: string | null;
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
