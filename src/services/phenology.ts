/**
 * Client-side mirror of supabase/functions/_shared/phenology.ts
 * Keep in sync with the edge-function version.
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
  dasMin: number;
  dasMax: number;
}

const STAGE_CALENDAR: Record<CropFamily, StageWindow[]> = {
  rice: [
    { stage: 'pre_emergence', dasMin: 0,   dasMax: 7   },
    { stage: 'seedling',      dasMin: 7,   dasMax: 30  },
    { stage: 'tillering',     dasMin: 30,  dasMax: 60  },
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

export const STAGE_LABELS: Record<GrowthStage, string> = {
  pre_emergence:       'Pre-emergence',
  seedling:            'Seedling / Establishment',
  tillering:           'Tillering',
  panicle_initiation:  'Panicle Initiation',
  heading:             'Heading / Flowering',
  grain_fill:          'Grain Fill',
  maturity:            'Maturity / Harvest',
};

export interface PhenologyResult {
  stage: GrowthStage;
  daysAfterSowing: number;
  sowingDate: string;
  correctedBySatellite: boolean;
  stageName: string;
}

export function deriveGrowthStage(
  sowingDateISO: string,
  crop: CropFamily = 'generic',
  satelliteSoSISO?: string,
  referenceDate?: Date,
): PhenologyResult {
  const ref = referenceDate ?? new Date();
  let effectiveSowingDate = new Date(sowingDateISO);
  let correctedBySatellite = false;

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

export function parseCropFamily(crop: string | null | undefined): CropFamily {
  const c = String(crop ?? '').trim().toLowerCase();
  if (['rice', 'paddy', 'paddy rice'].includes(c)) return 'rice';
  if (['millet', 'jowar', 'sorghum', 'bajra', 'pearl millet', 'ragi', 'finger millet'].includes(c)) return 'millet';
  return 'generic';
}
