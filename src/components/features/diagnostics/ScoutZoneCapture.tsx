/**
 * ScoutZoneCapture
 *
 * Three-step flow:
 *   1. GPS validation — confirms farmer is within ~100m of scout zone
 *   2. Camera capture — rear-facing camera, full-res photo
 *   3. Processing — uploads photo, triggers Qwen-VL diagnosis, shows result
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, MapPin, Loader2, CheckCircle, AlertTriangle, X, RefreshCw } from 'lucide-react';
import {
  type ScoutZone,
  type DiagnosisResult,
  uploadDiseasePhoto,
  triggerImageDiagnosis,
  diseaseDisplayName,
  riskColor,
} from '@/services/diseaseService';

interface ScoutZoneCaptureProps {
  zone: ScoutZone;
  farmId: string;
  crop: string;
  growthStage: string;
  satelliteContext?: Record<string, unknown> | null;
  onClose: () => void;
  onDiagnosed: (zone: ScoutZone, diagnosis: DiagnosisResult) => void;
}

type Step = 'location' | 'camera' | 'processing' | 'result' | 'error';

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function confidenceColor(c: number) {
  if (c >= 0.75) return 'text-red-600';
  if (c >= 0.50) return 'text-orange-500';
  return 'text-slate-500';
}

export default function ScoutZoneCapture({
  zone,
  farmId,
  crop,
  growthStage,
  satelliteContext,
  onClose,
  onDiagnosed,
}: ScoutZoneCaptureProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);

  const [step, setStep]             = useState<Step>('location');
  const [userLat, setUserLat]       = useState<number | null>(null);
  const [userLng, setUserLng]       = useState<number | null>(null);
  const [gpsError, setGpsError]     = useState<string | null>(null);
  const [distance, setDistance]     = useState<number | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [diagnosis, setDiagnosis]   = useState<DiagnosisResult | null>(null);
  const [diagModel, setDiagModel]   = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  // --- GPS validation ---
  useEffect(() => {
    if (step !== 'location') return;
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported on this browser.');
      return;
    }
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
        setGpsError(null);
        const d = distanceM(lat, lng, zone.centroid_lat, zone.centroid_lng);
        setDistance(Math.round(d));
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, [step, zone]);

  // --- Camera setup ---
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setErrorMsg(`Camera access denied: ${err instanceof Error ? err.message : String(err)}`);
      setStep('error');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (step === 'camera') startCamera();
    return () => { if (step === 'camera') stopCamera(); };
  }, [step, startCamera, stopCamera]);

  // cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  // --- Capture photo ---
  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStep('processing');
      handleUploadAndDiagnose(blob);
    }, 'image/jpeg', 0.92);
  }, [stopCamera]);

  // --- Upload + diagnose ---
  const handleUploadAndDiagnose = useCallback(async (blob: Blob) => {
    try {
      const satCtx: Record<string, unknown> = {
        ...(satelliteContext ?? {}),
        disease_candidates: zone.disease_candidates,
        composite_risk: zone.max_risk_score,
        zone_rank: zone.zone_rank,
      };

      const submission = await uploadDiseasePhoto({
        farmId,
        scoutZoneId: zone.id,
        imageBlob: blob,
        lat: userLat,
        lng: userLng,
        crop,
        growthStage,
        satelliteContext: satCtx,
      });

      const { diagnosis: diag, model } = await triggerImageDiagnosis(submission.id);
      setDiagnosis(diag);
      setDiagModel(model);
      setStep('result');
      onDiagnosed(zone, diag);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [farmId, zone, userLat, userLng, crop, growthStage, satelliteContext, onDiagnosed]);

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setDiagnosis(null);
    setErrorMsg(null);
    setStep('camera');
  }, [previewUrl]);

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 flex items-end sm:items-center justify-center p-2">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border-b border-orange-100">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: riskColor(zone.max_risk_score) }}
          >
            {zone.zone_rank}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">Scout Zone {zone.zone_rank}</p>
            <p className="text-xs text-slate-500 truncate">
              {zone.disease_candidates.map(diseaseDisplayName).join(' · ') || 'Disease risk detected'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-orange-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* --- Step: location --- */}
        {step === 'location' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-orange-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-slate-800">Walk to this zone first</p>
                <p className="text-sm text-slate-500">
                  {distance !== null
                    ? `You are ${distance}m from the flagged spot`
                    : gpsError ?? 'Getting your location…'}
                </p>
              </div>
            </div>

            {distance !== null && distance > 200 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                You are {distance}m away. Walk closer for the most accurate diagnosis.
              </p>
            )}

            <p className="text-sm text-slate-600">
              Satellite signals suggest{' '}
              <span className="font-medium text-orange-700">
                {zone.disease_candidates.map(diseaseDisplayName).join(', ') || 'disease risk'}
              </span>{' '}
              in this area. Take a close-up photo of a symptomatic leaf or stem.
            </p>

            <button
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              disabled={gpsError !== null && userLat === null}
              onClick={() => setStep('camera')}
            >
              <Camera className="w-5 h-5" />
              {userLat !== null ? 'Open Camera' : gpsError ? 'Open Camera Anyway' : 'Getting location…'}
            </button>
          </div>
        )}

        {/* --- Step: camera --- */}
        {step === 'camera' && (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              className="w-full max-h-80 object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-6">
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-white border-4 border-orange-500 shadow-lg active:scale-95 transition-transform"
              />
            </div>

            <button
              onClick={() => { stopCamera(); setStep('location'); }}
              className="absolute top-3 right-3 p-2 bg-black/50 rounded-full"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        )}

        {/* --- Step: processing --- */}
        {step === 'processing' && (
          <div className="p-8 flex flex-col items-center gap-4">
            {previewUrl && (
              <img src={previewUrl} alt="captured" className="w-full max-h-40 object-cover rounded-xl" />
            )}
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-600 text-center">
              Uploading photo and running Qwen-VL disease analysis…
            </p>
            <p className="text-xs text-slate-400 text-center">
              Checking for {zone.disease_candidates.map(diseaseDisplayName).join(', ')}
            </p>
          </div>
        )}

        {/* --- Step: result --- */}
        {step === 'result' && diagnosis && (
          <div className="p-5 space-y-4">
            {previewUrl && (
              <img src={previewUrl} alt="field photo" className="w-full max-h-40 object-cover rounded-xl" />
            )}

            {/* Diagnosis header */}
            <div className="flex items-center gap-3">
              {diagnosis.confirmed_diagnosis === 'healthy' ? (
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              )}
              <div>
                <p className="font-bold text-slate-800">
                  {diseaseDisplayName(diagnosis.confirmed_diagnosis)}
                </p>
                <p className={`text-sm font-medium ${confidenceColor(diagnosis.confidence)}`}>
                  {(diagnosis.confidence * 100).toFixed(0)}% confidence
                  {diagnosis.severity_pct != null ? ` · ~${diagnosis.severity_pct}% severity` : ''}
                </p>
              </div>
            </div>

            {/* Visual evidence */}
            {diagnosis.visual_evidence.length > 0 && (
              <ul className="text-sm text-slate-600 list-disc list-inside space-y-0.5">
                {diagnosis.visual_evidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}

            {/* Scout action */}
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-800">
              <span className="font-medium">Next step: </span>{diagnosis.scout_action}
            </div>

            {/* Differential */}
            {diagnosis.differential.length > 1 && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-medium text-slate-600">Also consider…</summary>
                <ul className="mt-1 space-y-0.5 pl-2">
                  {diagnosis.differential.slice(1, 4).map((d, i) => (
                    <li key={i}>
                      <span className="font-medium">{diseaseDisplayName(d.disease)}</span>
                      {' '}({d.likelihood}) — {d.distinguishing_feature}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Warnings */}
            {diagnosis.requires_lab_confirmation && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                ⚠ Lab or KVK confirmation recommended before applying chemical treatment.
              </p>
            )}

            <p className="text-xs text-slate-400">Model: {diagModel}</p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={retake}
                className="flex-1 flex items-center justify-center gap-1 border border-slate-200 text-slate-600 text-sm py-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Retake
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-xl hover:bg-orange-600 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* --- Step: error --- */}
        {step === 'error' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <p className="font-medium">Something went wrong</p>
            </div>
            <p className="text-sm text-slate-600">{errorMsg ?? 'Unknown error'}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setErrorMsg(null); setStep('location'); }}
                className="flex-1 border border-slate-200 text-slate-600 text-sm py-2 rounded-xl"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-slate-700 text-white text-sm py-2 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
