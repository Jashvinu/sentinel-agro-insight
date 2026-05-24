import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { DiagnosticLike, FarmTelemetryContext } from './rag-core.ts';

type Geometry = unknown;

function getLatestBy<T extends Record<string, unknown>>(rows: T[], key: string): Record<string, T> {
  const latest: Record<string, T> = {};
  for (const row of rows) {
    const value = String(row[key] ?? '');
    if (!value || latest[value]) continue;
    latest[value] = row;
  }
  return latest;
}

function normalizeDiagnosticsCache(row: Record<string, any> | null): DiagnosticLike | null {
  if (!row) return null;
  const summary = row.analysis_summary ?? {};
  const problems = summary.problems ?? [];
  const metadata = summary.metadata ?? {};
  const farmStats = Array.isArray(row.cell_stats)
    ? {
        totalCells: row.cell_stats.length,
        problemCells: row.cell_stats.filter((cell: any) => Array.isArray(cell.problems) && cell.problems.length > 0).length,
        healthyCells: row.cell_stats.filter((cell: any) => !Array.isArray(cell.problems) || cell.problems.length === 0).length,
        overlapCells: row.cell_stats.filter((cell: any) => Array.isArray(cell.problems) && cell.problems.length > 1).length,
      }
    : undefined;

  return {
    problems,
    farmStats,
    imagesAnalyzed: metadata.imagesAnalyzed ?? metadata.daysAnalyzed,
    cloudCover: metadata.cloudCover ?? metadata.cloud_cover,
    nutrientModel: metadata.nutrientModel,
    cached: true,
    expiresAt: row.expires_at,
  };
}

export async function loadFarmContext(
  supabase: SupabaseClient,
  input: { farmId?: string; geometry?: Geometry; diagnosticResult?: DiagnosticLike | null },
): Promise<FarmTelemetryContext> {
  const warnings: string[] = [];
  let farm: FarmTelemetryContext['farm'] = input.geometry ? { geometry: input.geometry } : null;
  let diagnostics = input.diagnosticResult ?? null;
  const latest_indices: FarmTelemetryContext['latest_indices'] = {};
  const water_metrics: FarmTelemetryContext['water_metrics'] = {};
  const advanced_monitoring: FarmTelemetryContext['advanced_monitoring'] = {};

  if (input.farmId) {
    const { data: farmData, error: farmError } = await supabase
      .from('farms')
      .select('id,name,geometry,bounds,area_hectares')
      .eq('id', input.farmId)
      .maybeSingle();

    if (farmError) warnings.push(`Farm lookup failed: ${farmError.message}`);
    if (farmData) {
      farm = {
        id: farmData.id,
        name: farmData.name,
        geometry: farmData.geometry,
        bounds: farmData.bounds,
        area_hectares: farmData.area_hectares,
      };
    }

    if (!diagnostics) {
      const { data: diagnosticsRow, error: diagnosticsError } = await supabase
        .from('diagnostics_cache')
        .select('*')
        .eq('farm_id', input.farmId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (diagnosticsError) warnings.push(`Diagnostics cache lookup failed: ${diagnosticsError.message}`);
      diagnostics = normalizeDiagnosticsCache(diagnosticsRow);
    }

    const { data: indexRows, error: indexError } = await supabase
      .from('agricultural_index_timeseries')
      .select('algorithm,observation_date,mean_value,cloud_cover,satellite')
      .eq('farm_id', input.farmId)
      .order('observation_date', { ascending: false })
      .limit(80);

    if (indexError) warnings.push(`Agricultural index lookup failed: ${indexError.message}`);
    for (const [algorithm, row] of Object.entries(getLatestBy(indexRows ?? [], 'algorithm'))) {
      latest_indices[algorithm] = {
        value: Number(row.mean_value),
        observation_date: String(row.observation_date ?? ''),
        satellite: String(row.satellite ?? ''),
        cloud_cover: typeof row.cloud_cover === 'number' ? row.cloud_cover : null,
      };
    }

    const { data: waterRows, error: waterError } = await supabase
      .from('water_metrics_cache')
      .select('index_type,observation_date,mean_value')
      .eq('farm_id', input.farmId)
      .order('observation_date', { ascending: false })
      .limit(42);

    if (waterError) warnings.push(`Water metrics lookup failed: ${waterError.message}`);
    for (const [indexType, row] of Object.entries(getLatestBy(waterRows ?? [], 'index_type'))) {
      water_metrics[indexType] = {
        value: Number(row.mean_value),
        observation_date: String(row.observation_date ?? ''),
      };
    }

    const { data: monitoringRows, error: monitoringError } = await supabase
      .from('advanced_monitoring_timeseries')
      .select('algorithm,window_start_date,window_end_date,mean_value')
      .eq('farm_id', input.farmId)
      .order('window_end_date', { ascending: false })
      .limit(60);

    if (monitoringError) warnings.push(`Advanced monitoring lookup failed: ${monitoringError.message}`);
    for (const [algorithm, row] of Object.entries(getLatestBy(monitoringRows ?? [], 'algorithm'))) {
      advanced_monitoring[algorithm] = {
        value: Number(row.mean_value),
        window_start_date: String(row.window_start_date ?? ''),
        window_end_date: String(row.window_end_date ?? ''),
      };
    }
  }

  if (!input.farmId && input.geometry) {
    warnings.push('Geometry-only context provided; stored farm telemetry and caches were not queried.');
  }

  warnings.push('Satellite NPK values are sufficiency/risk scores and must be verified with soil tests.');

  return {
    farm,
    diagnostics,
    latest_indices,
    water_metrics,
    advanced_monitoring,
    weather_summary: null,
    warnings,
  };
}
