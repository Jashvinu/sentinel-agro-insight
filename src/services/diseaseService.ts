import { supabase } from './supabase';
import { API_BASE_URL } from './api';

export interface ScoutZone {
  id: string;
  farm_id: string;
  scan_date: string;
  zone_rank: number;
  centroid_lat: number;
  centroid_lng: number;
  radius_meters: number;
  disease_candidates: string[];
  max_risk_score: number;
  cell_count: number;
  crop: string;
  growth_stage: string | null;
  status: 'pending' | 'scouted' | 'confirmed' | 'cleared';
  created_at: string;
}

export interface DiseaseScreenResult {
  scan_date: string;
  crop: string;
  growth_stage: string;
  season: string;
  images_analyzed: number;
  risk_cells_count: number;
  high_risk_cells: number;
  scout_zones: ScoutZone[];
  weather_context: {
    hours_blast_temp_window: number;
    leaf_wetness_hours: number;
    total_rain_mm: number;
    mean_temp_c: number;
  };
  top_disease_risks: Record<string, number>;
}

export interface PhotoSubmission {
  id: string;
  farm_id: string;
  scout_zone_id: string | null;
  storage_path: string;
  taken_lat: number | null;
  taken_lng: number | null;
  crop: string;
  growth_stage: string | null;
  satellite_context: Record<string, unknown> | null;
  diagnosis_result: DiagnosisResult | null;
  diagnosis_model: string | null;
  diagnosis_at: string | null;
  submitted_at: string;
}

export interface DiagnosisResult {
  confirmed_diagnosis: string;
  confidence: number;
  severity_pct: number | null;
  differential: Array<{ disease: string; likelihood: string; distinguishing_feature: string }>;
  visual_evidence: string[];
  scout_action: string;
  requires_lab_confirmation: boolean;
  safe_to_spray: boolean | null;
  notes?: string;
}

/** Run satellite disease pre-screen for a farm */
export async function runDiseaseScreen(params: {
  farmId: string;
  crop: 'rice' | 'millet';
  growthStage?: string;
  season?: 'kharif' | 'rabi';
  geometry?: unknown;
}): Promise<DiseaseScreenResult> {
  const base = API_BASE_URL;
  const res = await fetch(`${base}/disease-risk-screen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      farm_id: params.farmId,
      crop: params.crop,
      growth_stage: params.growthStage,
      season: params.season ?? 'kharif',
      geometry: params.geometry,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`disease-risk-screen failed: ${err}`);
  }

  const data = await res.json();
  return data.data ?? data;
}

/** Get scout zones for a farm (latest scan) */
export async function getScoutZones(farmId: string): Promise<ScoutZone[]> {
  const { data, error } = await supabase
    .from('disease_scout_zones')
    .select('*')
    .eq('farm_id', farmId)
    .order('scan_date', { ascending: false })
    .order('zone_rank', { ascending: true })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as ScoutZone[];
}

/** Upload a farmer photo to Supabase Storage and create a submission record */
export async function uploadDiseasePhoto(params: {
  farmId: string;
  scoutZoneId: string | null;
  imageBlob: Blob;
  lat: number | null;
  lng: number | null;
  crop: string;
  growthStage: string;
  satelliteContext: Record<string, unknown> | null;
}): Promise<PhotoSubmission> {
  const timestamp  = Date.now();
  const ext        = params.imageBlob.type.includes('png') ? 'png' : 'jpg';
  const zonePart   = params.scoutZoneId ? params.scoutZoneId.slice(0, 8) : 'manual';
  const objectPath = `${params.farmId}/${zonePart}/${timestamp}.${ext}`;
  const storagePath = `disease-photos/${objectPath}`;

  // Upload to storage
  const { error: uploadErr } = await supabase.storage
    .from('disease-photos')
    .upload(objectPath, params.imageBlob, { contentType: params.imageBlob.type, upsert: false });

  if (uploadErr) throw uploadErr;

  // Create submission record
  const { data: sub, error: insertErr } = await supabase
    .from('farmer_photo_submissions')
    .insert({
      farm_id:          params.farmId,
      scout_zone_id:    params.scoutZoneId,
      storage_path:     storagePath,
      taken_lat:        params.lat,
      taken_lng:        params.lng,
      crop:             params.crop,
      growth_stage:     params.growthStage,
      satellite_context: params.satelliteContext,
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  return sub as PhotoSubmission;
}

/** Trigger VLM diagnosis for a submission (async) */
export async function triggerImageDiagnosis(submissionId: string): Promise<{ diagnosis: DiagnosisResult; model: string }> {
  const base = API_BASE_URL;
  const res = await fetch(`${base}/disease-image-diagnose`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ submission_id: submissionId }),
  });

  if (!res.ok) throw new Error(`disease-image-diagnose failed: ${await res.text()}`);
  const data = await res.json();
  return { diagnosis: data.data?.diagnosis ?? data.diagnosis, model: data.data?.model ?? data.model };
}

/** Poll for diagnosis result on a submission */
export async function getDiagnosisResult(submissionId: string): Promise<PhotoSubmission | null> {
  const { data } = await supabase
    .from('farmer_photo_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  return data as PhotoSubmission | null;
}

export function diseaseDisplayName(key: string): string {
  const map: Record<string, string> = {
    rice_blast:           'Rice Blast',
    sheath_blight:        'Sheath Blight',
    bacterial_leaf_blight: 'Bacterial Leaf Blight',
    downy_mildew:         'Downy Mildew',
    leaf_spot:            'Leaf Spot',
    charcoal_rot:         'Charcoal Rot',
    abiotic_stress:       'Abiotic Stress',
    healthy:              'Healthy',
    uncertain:            'Uncertain',
    unclear_image:        'Unclear Image',
  };
  return map[key] ?? key.replace(/_/g, ' ');
}

export function riskColor(score: number): string {
  if (score >= 0.65) return '#ef4444';  // red
  if (score >= 0.40) return '#f97316';  // orange
  if (score >= 0.20) return '#eab308';  // yellow
  return '#22c55e';                      // green
}
