import {
  AGRONOMY_KNOWLEDGE,
  AdvisoryCrop,
  AdvisorySeason,
  AgronomyKnowledgeChunk,
  AgronomySource,
} from '@/data/agronomyKnowledge';
import {
  DiagnosticIndex,
  DiagnosticRasterResult,
  getIndexLabel,
} from '@/services/diagnosticService';
import type { WeatherData } from '@/hooks/useWeather';

export interface RetrievedKnowledgeChunk {
  chunk: AgronomyKnowledgeChunk;
  score: number;
  matchedTags: string[];
}

export interface AgronomyAdvisoryInput {
  crop: AdvisoryCrop;
  season: AdvisorySeason;
  result: DiagnosticRasterResult | null;
  weather: WeatherData | null;
  farmName?: string;
}

export interface WeatherAdvisorySummary {
  summary: string;
  tags: string[];
  next72hRainMm?: number;
  maxTempC?: number;
  maxWindKmh?: number;
  avgCloudCover?: number;
}

export interface AgronomyAdvisory {
  text: string;
  usedGemini: boolean;
  generatedAt: string;
  sources: AgronomySource[];
  retrieved: RetrievedKnowledgeChunk[];
  weatherSummary: WeatherAdvisorySummary;
  warning?: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
}

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const DEFAULT_GEMINI_VERSIONS = ['v1beta', 'v1'];

const GEMINI_MODELS = (() => {
  const envModels = (import.meta.env.VITE_GEMINI_MODELS as string | undefined)
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return envModels && envModels.length > 0 ? envModels : DEFAULT_GEMINI_MODELS;
})();

const GEMINI_VERSIONS = (() => {
  const envVersions = (import.meta.env.VITE_GEMINI_API_VERSIONS as string | undefined)
    ?.split(',')
    .map((version) => version.trim())
    .filter(Boolean);
  return envVersions && envVersions.length > 0 ? envVersions : DEFAULT_GEMINI_VERSIONS;
})();

const INDEX_TAGS: Record<DiagnosticIndex, string[]> = {
  nitrogen: ['nitrogen', 'nutrient'],
  phosphorus: ['phosphorus', 'nutrient'],
  potassium: ['potassium', 'nutrient', 'moisture'],
  moisture: ['moisture', 'water', 'drought'],
  ndvi: ['crop-stress', 'weed', 'pest'],
};

const buildGeminiEndpoint = (model: string, version: string) =>
  `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const average = (values: number[]) => {
  if (values.length === 0) return undefined;
  return sum(values) / values.length;
};

function uniqueSources(retrieved: RetrievedKnowledgeChunk[]): AgronomySource[] {
  const seen = new Set<string>();
  const sources: AgronomySource[] = [];

  for (const item of retrieved) {
    if (seen.has(item.chunk.source.url)) continue;
    seen.add(item.chunk.source.url);
    sources.push(item.chunk.source);
  }

  return sources;
}

function getDiagnosticTags(result: DiagnosticRasterResult | null): string[] {
  const tags = new Set<string>(['maharashtra']);

  result?.problems.forEach((problem) => {
    INDEX_TAGS[problem.index].forEach((tag) => tags.add(tag));
    if (problem.confidence === 'low') tags.add('soil');
    if (problem.type === 'trend' || problem.type === 'both') tags.add('weather');
  });

  if (!result || result.problems.length === 0) {
    tags.add('weather');
    tags.add('soil');
  }

  return Array.from(tags);
}

export function summarizeWeatherForAdvisory(data: WeatherData | null): WeatherAdvisorySummary {
  if (!data || data.hourly.time.length === 0) {
    return {
      summary: 'Weather forecast is unavailable for this farm right now.',
      tags: ['weather'],
    };
  }

  const hours = Math.min(72, data.hourly.time.length);
  const precipitation = Array.from(data.hourly.precipitation.slice(0, hours));
  const temperatures = Array.from(data.hourly.temperature_2m.slice(0, hours));
  const windSpeeds = Array.from(data.hourly.wind_speed_10m.slice(0, hours));
  const cloudCover = Array.from(data.hourly.cloud_cover.slice(0, hours));

  const next72hRainMm = sum(precipitation);
  const maxTempC = Math.max(...temperatures);
  const maxWindKmh = Math.max(...windSpeeds);
  const avgCloudCover = average(cloudCover) ?? 0;
  const tags = new Set<string>(['weather']);
  const flags: string[] = [];

  if (next72hRainMm >= 25) {
    tags.add('rain');
    flags.push(`heavy rain risk (${next72hRainMm.toFixed(1)} mm in 72h)`);
  } else if (next72hRainMm < 2) {
    tags.add('drought');
    tags.add('water');
    flags.push(`mostly dry (${next72hRainMm.toFixed(1)} mm in 72h)`);
  } else {
    tags.add('rain');
    flags.push(`${next72hRainMm.toFixed(1)} mm rain expected in 72h`);
  }

  if (maxTempC >= 34) {
    tags.add('heat');
    flags.push(`hot period up to ${Math.round(maxTempC)}C`);
  }

  if (maxWindKmh >= 25) {
    tags.add('wind');
    flags.push(`spray drift risk, wind up to ${Math.round(maxWindKmh)} km/h`);
  }

  if (avgCloudCover >= 70) {
    tags.add('cloud');
    flags.push(`cloudy forecast, average ${Math.round(avgCloudCover)}% cloud cover`);
  }

  return {
    summary: flags.join('; '),
    tags: Array.from(tags),
    next72hRainMm,
    maxTempC,
    maxWindKmh,
    avgCloudCover,
  };
}

export function retrieveAgronomyKnowledge(
  crop: AdvisoryCrop,
  season: AdvisorySeason,
  result: DiagnosticRasterResult | null,
  weather: WeatherData | null,
  limit = 6
): RetrievedKnowledgeChunk[] {
  const diagnosticTags = getDiagnosticTags(result);
  const weatherSummary = summarizeWeatherForAdvisory(weather);
  const requestedTags = new Set([...diagnosticTags, ...weatherSummary.tags, crop, season]);

  return AGRONOMY_KNOWLEDGE
    .filter((chunk) => (chunk.crop === 'all' || chunk.crop === crop) && chunk.seasons.includes(season))
    .map((chunk) => {
      const matchedTags = chunk.tags.filter((tag) => requestedTags.has(tag));
      let score = matchedTags.length * 2;

      if (chunk.crop === crop) score += 6;
      if (chunk.crop === 'all') score += 2;
      if (chunk.seasons.includes(season)) score += 4;
      if (chunk.region === 'maharashtra') score += 4;

      return { chunk, score, matchedTags };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function summarizeDiagnostics(result: DiagnosticRasterResult | null): string {
  if (!result) return 'No satellite diagnostic result is available yet.';

  if (result.problems.length === 0) {
    return [
      `No active satellite diagnostic issues detected across ${result.farmStats.totalCells} grid cells.`,
      `Satellite images analyzed: ${result.imagesAnalyzed}.`,
    ].join(' ');
  }

  const issueLines = result.problems.map((problem) => {
    const confidence = problem.confidence ? `${problem.confidence} confidence` : 'confidence not reported';
    const value = problem.avgValue !== undefined ? `avg ${problem.avgValue.toFixed(1)}` : 'avg unavailable';
    const trend =
      problem.avgDecline !== undefined
        ? `trend ${problem.avgDecline.toFixed(1)} ${problem.avgDeclineUnit === 'points' ? 'points' : '%'}`
        : 'trend unavailable';

    return `${problem.label}: ${problem.cellCount} cells, ${value}, ${trend}, ${confidence}.`;
  });

  return [
    `${result.farmStats.problemCells} of ${result.farmStats.totalCells} cells have diagnostic alerts; ${result.farmStats.overlapCells} cells have overlapping alerts.`,
    `Satellite images analyzed: ${result.imagesAnalyzed}.`,
    `Important: NPK values are 0-100 satellite sufficiency scores, not lab nutrient kg/ha values.`,
    ...issueLines,
  ].join('\n');
}

function buildContextBlock(retrieved: RetrievedKnowledgeChunk[]): string {
  return retrieved
    .map((item, index) => {
      const sourceId = `S${index + 1}`;
      const actions = item.chunk.actions.map((action) => `- ${action}`).join('\n');

      return [
        `[${sourceId}] ${item.chunk.title}`,
        `Institution: ${item.chunk.source.institution}`,
        `Crop: ${item.chunk.crop}; seasons: ${item.chunk.seasons.join(', ')}; region: ${item.chunk.region}`,
        `Summary: ${item.chunk.summary}`,
        `Actions:\n${actions}`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildPrompt(input: AgronomyAdvisoryInput, retrieved: RetrievedKnowledgeChunk[], weatherSummary: WeatherAdvisorySummary): string {
  const cropLabel = input.crop === 'rice' ? 'rice/paddy' : 'millets';
  const seasonLabel = input.season === 'kharif' ? 'Kharif' : 'Rabi';

  return `
You are an agronomy advisor for Maharashtra, India. Use only the retrieved institutional context, satellite diagnostics, and weather forecast below. If the evidence is uncertain, say what to verify locally with the nearest KVK/agriculture officer.

Farm: ${input.farmName || 'selected farm'}
Crop: ${cropLabel}
Season: ${seasonLabel}

Satellite diagnostics:
${summarizeDiagnostics(input.result)}

Weather forecast:
${weatherSummary.summary}

Retrieved Indian agronomy context:
${buildContextBlock(retrieved)}

Return only the advisory. Do not include a preamble, Markdown, bold markers, bullet points, or source labels.

Use exactly this plain-text structure, with complete sentences after every heading:
Priority: ...
Next 3 days: ...
Crop management: ...
Weather timing: ...
Verify locally: ...

Rules:
- Do not invent fertilizer doses, chemical names, or variety names beyond the retrieved context.
- Treat satellite NPK as a sufficiency/risk signal for scouting and soil testing, not as a direct soil lab test.
- Mention crop and season directly.
- Keep the response practical for a Maharashtra farmer and under 220 words.
- Do not stop mid-sentence.
`.trim();
}

function normalizeAdvisoryText(text: string): string {
  const withoutPreamble = text
    .replace(/\r/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();

  const firstHeading = withoutPreamble.search(/(^|\n)(Priority|Next 3 days|Crop management|Weather timing|Verify locally)\s*:/i);
  const advisoryOnly = firstHeading > 0 ? withoutPreamble.slice(firstHeading).trim() : withoutPreamble;

  return advisoryOnly
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function extractGeminiText(data: GeminiResponse): string | null {
  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    return null;
  }

  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return null;

  const text = parts
    .map((part) => part.text)
    .filter((partText): partText is string => Boolean(partText))
    .join('\n')
    .trim();

  return text ? normalizeAdvisoryText(text) : null;
}

async function requestGeminiAdvisory(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  let lastError = 'Gemini request failed.';

  for (const version of GEMINI_VERSIONS) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetch(`${buildGeminiEndpoint(model, version)}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 1600,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        });

        const data = (await response.json().catch(() => ({}))) as GeminiResponse;

        if (!response.ok) {
          throw new Error(data.error?.message || `Gemini returned ${response.status}`);
        }

        const text = extractGeminiText(data);
        if (!text) {
          throw new Error('Gemini response did not include text.');
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        console.warn(`Gemini advisory failed for ${model}/${version}: ${lastError}`);
      }
    }
  }

  throw new Error(lastError);
}

function buildFallbackAdvisory(
  input: AgronomyAdvisoryInput,
  retrieved: RetrievedKnowledgeChunk[],
  weatherSummary: WeatherAdvisorySummary
): string {
  const cropLabel = input.crop === 'rice' ? 'rice/paddy' : 'millets';
  const seasonLabel = input.season === 'kharif' ? 'Kharif' : 'Rabi';
  const topProblem = input.result?.problems[0];
  const topAction = retrieved[0]?.chunk.actions[0] || 'Scout diagnostic zones before changing inputs.';
  const secondAction = retrieved[1]?.chunk.actions[0] || 'Use local KVK guidance for final input decisions.';
  const hasProblems = Boolean(input.result && input.result.problems.length > 0);
  const problemText = topProblem
    ? `${getIndexLabel(topProblem.index)} is the first risk to check in ${topProblem.cellCount} grid cells.`
    : 'No urgent satellite stress pattern is visible right now.';

  return [
    `Priority: For ${seasonLabel} ${cropLabel}, use the diagnostic map for zone scouting first. ${problemText}`,
    `Next 3 days: ${weatherSummary.summary} Time irrigation, top dressing, and spraying around this forecast.`,
    `Crop management: ${hasProblems ? topAction : 'Maintain routine scouting and protect crop establishment moisture.'}`,
    `Weather timing: ${secondAction}`,
    'Verify locally: Satellite NPK is a 0-100 sufficiency signal, not a soil lab value. Confirm fertilizer changes with soil testing, field symptoms, and the nearest KVK/agriculture officer.',
  ].join('\n');
}

export async function generateAgronomyAdvisory(input: AgronomyAdvisoryInput): Promise<AgronomyAdvisory> {
  const weatherSummary = summarizeWeatherForAdvisory(input.weather);
  const retrieved = retrieveAgronomyKnowledge(input.crop, input.season, input.result, input.weather);
  const sources = uniqueSources(retrieved);
  const prompt = buildPrompt(input, retrieved, weatherSummary);

  try {
    const text = await requestGeminiAdvisory(prompt);
    return {
      text,
      usedGemini: true,
      generatedAt: new Date().toISOString(),
      sources,
      retrieved,
      weatherSummary,
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Gemini advisory unavailable.';

    return {
      text: buildFallbackAdvisory(input, retrieved, weatherSummary),
      usedGemini: false,
      generatedAt: new Date().toISOString(),
      sources,
      retrieved,
      weatherSummary,
      warning,
    };
  }
}
