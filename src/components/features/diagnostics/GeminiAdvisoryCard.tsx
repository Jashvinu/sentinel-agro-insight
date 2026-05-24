import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdvisoryCrop, AdvisorySeason } from '@/data/agronomyKnowledge';
import {
  AgronomyAdvisory,
  generateAgronomyAdvisory,
} from '@/services/agronomyAdvisorService';
import type { DiagnosticRasterResult } from '@/services/diagnosticService';
import type { WeatherData } from '@/hooks/useWeather';
import {
  AlertCircle,
  Bot,
  BookOpen,
  CloudSun,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface GeminiAdvisoryCardProps {
  crop: AdvisoryCrop;
  season: AdvisorySeason;
  result: DiagnosticRasterResult | null;
  weatherData: WeatherData | null;
  farmName?: string;
}

interface AdvisorySection {
  title?: string;
  body: string;
}

const ADVISORY_HEADINGS = [
  'Priority',
  'Next 3 days',
  'Crop management',
  'Weather timing',
  'Verify locally',
] as const;

function cleanAdvisoryText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAdvisorySections(text: string): AdvisorySection[] {
  const cleaned = cleanAdvisoryText(text);
  const headingPattern = new RegExp(`(^|\\n)(${ADVISORY_HEADINGS.join('|')})\\s*:\\s*`, 'gi');
  const matches = Array.from(cleaned.matchAll(headingPattern));

  if (matches.length === 0) {
    return cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((body) => ({ body }));
  }

  return matches
    .map((match, index) => {
      const bodyStart = (match.index ?? 0) + match[0].length;
      const bodyEnd = matches[index + 1]?.index ?? cleaned.length;
      const body = cleaned.slice(bodyStart, bodyEnd).trim();

      return {
        title: match[2],
        body,
      };
    })
    .filter((section) => section.body.length > 0);
}

export const GeminiAdvisoryCard: React.FC<GeminiAdvisoryCardProps> = ({
  crop,
  season,
  result,
  weatherData,
  farmName,
}) => {
  const [advisory, setAdvisory] = useState<AgronomyAdvisory | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!result) return;

      setLoading(true);
      try {
        const nextAdvisory = await generateAgronomyAdvisory({
          crop,
          season,
          result,
          weather: weatherData,
          farmName,
        });

        if (!cancelled) {
          setAdvisory(nextAdvisory);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [crop, farmName, result, season, weatherData, refreshCount]);

  if (!result) return null;

  const sections = advisory ? parseAdvisorySections(advisory.text) : [];

  return (
    <Card className="overflow-hidden rounded-xl border-primary/30 bg-primary/5 shadow-sm">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Server RAG Advisor
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={advisory?.usedGemini ? 'default' : 'outline'} className="text-[10px]">
                {advisory?.usedGemini ? 'Server Gemini' : 'Local fallback'}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">
                {crop === 'rice' ? 'Rice' : 'Millets'}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">
                {season}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 shrink-0 p-0 sm:h-8 sm:w-8"
            onClick={() => {
              setRefreshCount((count) => count + 1);
            }}
            disabled={loading}
            aria-label="Refresh Gemini advisory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
        {loading && !advisory ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Building advisory from diagnostics, weather, and local sources...
          </div>
        ) : (
          <div className="divide-y divide-border/70 rounded-md bg-background/70 px-3">
            {sections.map((section, index) => (
              <div key={`${section.title || 'advisory'}-${index}`} className="min-w-0 py-3 first:pt-3 last:pb-3">
                {section.title && (
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {section.title}
                  </div>
                )}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {advisory?.warning && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Using local RAG guidance because the server advisor was unavailable: {advisory.warning}</span>
          </div>
        )}

        {advisory && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CloudSun className="h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{advisory.weatherSummary.summary}</span>
            </div>

            <div className="pt-2 border-t">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="w-3 h-3" />
                Retrieved Sources
              </div>
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {advisory.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-primary sm:text-[10px]"
                  >
                    {source.institution}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GeminiAdvisoryCard;
