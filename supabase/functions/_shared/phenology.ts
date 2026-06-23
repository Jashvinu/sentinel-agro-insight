/**
 * Phenology engine — maps sowing/transplant date → days-after-sowing → BBCH growth stage.
 *
 * Primary source: sowing_date (persisted on farm/zone record).
 * Validation: satellite start-of-season (50%-of-amplitude NDVI rule) when cloud-free
 *             imagery is available; otherwise trusts the sowing date as-is.
 *
 * Stage vocabulary mirrors parseGrowthStage() in disease-models.ts so thresholds,
 * disease susceptibility tables, and advisories all share the same enum.
 *
 * Typical day-ranges are derived from IRRI (rice) and ICAR-IIMR (millet/sorghum)
 * crop calendars for kharif India. Adapt per variety if sowing_date + satellite
 * phenology diverge by >14 days.
 */

export type GrowthStage =
  | 'pre_emergence'
  | 'seedling'
  | 'tillering'
  | 'panicle_initiation'
  | 'heading'
  | 'grain_fill'
  | 'maturity';

export type CropFamily = 'rice' | 'millet' | 'generic';

interface StageWindow {
  stage: GrowthStage;
  dasMin: number; // days-after-sowing (inclusive)
  dasMax: number; // days-after-sowing (exclusive)
}

/**
 * BBCH-derived DAS windows per crop family.
 * Rice: transplanted kharif variety ~120d total season.
 * Millet (bajra/jowar): ~100d kharif season.
 * Generic: coarse proxy usable for wheat/other.
 */
const STAGE_CALENDAR: Record<CropFamily, StageWindow[]> = {
  rice: [
    { stage: 'pre_emergence', dasMin: 0,   dasMax: 7   },
    { stage: 'seedling',      dasMin: 7,   dasMax: 30  }, // nursery/establishment
    { stage: 'tillering',     dasMin: 30,  dasMax: 60  }, // active tiller
    { stage: 'panicle_initiation', dasMin: 60, dasMax: 80 },
    { stage: 'heading',       dasMin: 80,  dasMax: 95  },
    { stage: 'grain_fill',    dasMin: 95,  dasMax: 115 },
    { stage: 'maturity',      dasMin: 115, dasMax: 999 },
  ],
  millet: [
    { stage: 'pre_emergence', dasMin: 0,   dasMax: 5   },
    { stage: 'seedling',      dasMin: 5,   dasMax: 20  },
    { stage: 'tillering',     dasMin: 20,  dasMax: 45  },
    { stage: 'panicle_initiation', dasMin: 45, dasMax: 65 },
    { stage: 'heading',       dasMin: 65,  dasMax: 80  },
    { stage: 'grain_fill',    dasMin: 80,  dasMax: 95  },
    { stage: 'maturity',      dasMin: 95,  dasMax: 999 },
  ],
  generic: [
    { stage: 'pre_emergence', dasMin: 0,   dasMax: 7   },
    { stage: 'seedling',      dasMin: 7,   dasMax: 25  },
    { stage: 'tillering',     dasMin: 25,  dasMax: 55  },
    { stage: 'panicle_initiation', dasMin: 55, dasMax: 75 },
    { stage: 'heading',       dasMin: 75,  dasMax: 90  },
    { stage: 'grain_fill',    dasMin: 90,  dasMax: 110 },
    { stage: 'maturity',      dasMin: 110, dasMax: 999 },
  ],
};

export interface PhenologyResult {
  stage: GrowthStage;
  daysAfterSowing: number;
  sowingDate: string;          // ISO date used (primary or corrected)
  correctedBySatellite: boolean;
  stageName: string;           // human-readable
}

/** Human-readable stage labels */
const STAGE_LABELS: Record<GrowthStage, string> = {
  pre_emergence:       'Pre-emergence',
  seedling:            'Seedling / Establishment',
  tillering:           'Tillering',
  panicle_initiation:  'Panicle Initiation',
  heading:             'Heading / Flowering',
  grain_fill:          'Grain Fill',
  maturity:            'Maturity / Harvest',
};

/**
 * Derive current crop growth stage from sowing date.
 *
 * @param sowingDateISO   ISO date string of sowing / transplanting (e.g. "2026-06-01")
 * @param crop            Crop family
 * @param satelliteSoSISO Optional satellite start-of-season date (cloud-free images only).
 *                        When provided and within 21 days of sowingDate, it validates
 *                        the sowing date. When it diverges by more than 21 days, the
 *                        satellite date wins (delayed establishment or misreported sowing).
 * @param referenceDate   Date to evaluate stage against (defaults to today)
 */
export function deriveGrowthStage(
  sowingDateISO: string,
  crop: CropFamily = 'generic',
  satelliteSoSISO?: string,
  referenceDate?: Date,
): PhenologyResult {
  const ref = referenceDate ?? new Date();
  let effectiveSowingDate = new Date(sowingDateISO);
  let correctedBySatellite = false;

  // Satellite start-of-season correction: if we have a cloud-free SoS estimate,
  // use it when it diverges meaningfully from the reported sowing date.
  if (satelliteSoSISO) {
    const satSoS = new Date(satelliteSoSISO);
    const diffDays = Math.abs((satSoS.getTime() - effectiveSowingDate.getTime()) / 86_400_000);
    if (diffDays > 21) {
      effectiveSowingDate = satSoS;
      correctedBySatellite = true;
    }
  }

  const das = Math.max(0, Math.floor((ref.getTime() - effectiveSowingDate.getTime()) / 86_400_000));
  const calendar = STAGE_CALENDAR[crop] ?? STAGE_CALENDAR.generic;
  const window = calendar.find(w => das >= w.dasMin && das < w.dasMax);
  const stage: GrowthStage = window?.stage ?? 'maturity';

  return {
    stage,
    daysAfterSowing: das,
    sowingDate: effectiveSowingDate.toISOString().split('T')[0],
    correctedBySatellite,
    stageName: STAGE_LABELS[stage],
  };
}

/** Convert a free-text growth-stage string to the GrowthStage enum (mirrors disease-models.ts) */
export function parseGrowthStageText(input: string | undefined): GrowthStage {
  if (!input) return 'tillering';
  const lower = input.toLowerCase();
  if (lower.includes('pre') || lower.includes('emergence')) return 'pre_emergence';
  if (lower.includes('seedling') || lower.includes('transplant')) return 'seedling';
  if (lower.includes('tiller')) return 'tillering';
  if (lower.includes('panicle') || lower.includes('pi')) return 'panicle_initiation';
  if (lower.includes('head') || lower.includes('flower') || lower.includes('silk')) return 'heading';
  if (lower.includes('grain') || lower.includes('dough') || lower.includes('dent') || lower.includes('milk')) return 'grain_fill';
  if (lower.includes('matur') || lower.includes('harvest')) return 'maturity';
  return 'tillering';
}

/** Normalize a crop string to CropFamily */
export function parseCropFamily(crop: string | null | undefined): CropFamily {
  const c = String(crop ?? '').trim().toLowerCase();
  if (['rice', 'paddy', 'paddy rice'].includes(c)) return 'rice';
  if (['millet', 'jowar', 'sorghum', 'bajra', 'pearl millet', 'ragi', 'finger millet'].includes(c)) return 'millet';
  return 'generic';
}
