import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Loader2, RefreshCw } from 'lucide-react';
import { FIELD_BOUNDARIES } from '@/constants';
import { DASHBOARD_INSIGHTS } from './DashboardKPIs';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';

const FALLBACK_REPORT =
    'Satellite review shows moisture slipping six percent in the northwest drip row at 12.3910°N 77.7742°E. Flush lines, verify emitter pressure, and hold irrigation schedule steady. Nutrient balance holds, though nitrogen drifted two percent week on week. Pest pressure remains low; scout borders. Monitor nightly gust alerts against sudden squalls tomorrow.';

const enforceWordLimit = (text: string, limit = 50) => {
    const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length <= limit) {
        return words.join(' ');
    }
    return words.slice(0, limit).join(' ');
};

const buildPrompt = () => {
    const { water, inputs, pests, weather } = DASHBOARD_INSIGHTS;
    const focusLat = FIELD_BOUNDARIES.coordinates[0][1];
    const focusLon = FIELD_BOUNDARIES.coordinates[0][0];

    return `
You are an agronomic advisor. Using the supplied satellite-derived insights, write a single paragraph that is exactly 50 words. Highlight the most urgent action, specify the latitude and longitude that growers should inspect, and include concise guidance.

Water distribution: ${water.value}, trend ${water.trend?.value}% (${water.trend?.label}). Focus note: ${water.focus.note}.
Soil inputs: ${inputs.value}, trend ${inputs.trend?.value}% (${inputs.trend?.label}). Focus note: ${inputs.focus.note}.
Pest outlook: ${pests.value}. Focus note: ${pests.focus.note}.
Weather alerts: ${weather.value}, trend ${weather.trend?.value}% (${weather.trend?.label}). Focus note: ${weather.focus.note}.

Field centroid: ${focusLat.toFixed(6)}°N, ${focusLon.toFixed(6)}°E.
Respond with only the paragraph and no bullet points.
`.trim();
};

export const AIFieldReport: React.FC = () => {
    const [report, setReport] = useState<string>(FALLBACK_REPORT);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState<number>(0);

    const prompt = useMemo(() => buildPrompt(), []);

    const generateReport = useCallback(async () => {
        setError(null);
        setLoading(true);

        try {
            const response = await fetch(buildApiUrl('/rag-advisor'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getSupabaseFunctionHeaders(),
                },
                body: JSON.stringify({
                    question: prompt,
                    crop: 'rice',
                    season: 'kharif',
                    region: 'maharashtra',
                    geometry: FIELD_BOUNDARIES,
                    constraints: ['dashboard', 'field-brief', 'water', 'nutrient', 'weather'],
                    top_k: 4,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.answer) {
                throw new Error(data.error || `Server advisor failed with status ${response.status}`);
            }

            setReport(enforceWordLimit(data.answer));
            setError(null);
            setRetryCount(0);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown server advisor error';
            console.error('Server field brief error:', err);
            setError(`Using local fallback because the server advisor was unavailable: ${errorMessage}`);
            setReport(enforceWordLimit(FALLBACK_REPORT));
        } finally {
            setLoading(false);
        }
    }, [prompt]);

    useEffect(() => {
        generateReport();
    }, [generateReport, retryCount]);

    const handleRefresh = () => {
        setRetryCount(prev => prev + 1);
        };

    return (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-muted/20 to-muted/10 shadow-lg">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-3 text-2xl">
                    <Bot className="w-6 h-6 text-primary" />
                    <span>AI Field Brief</span>
                </CardTitle>
                    {!loading && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            className="flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="relative">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-lg font-medium text-foreground">Generating satellite summary…</p>
                            <p className="text-sm text-muted-foreground">Analyzing field data and weather patterns</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-lg leading-relaxed text-foreground font-medium tracking-wide">{report}</p>
                        {error && (
                            <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
                                <p className="font-medium mb-1">Note:</p>
                                <p>{error}</p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

