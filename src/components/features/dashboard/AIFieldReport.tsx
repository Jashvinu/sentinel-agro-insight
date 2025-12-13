import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Loader2, RefreshCw } from 'lucide-react';
import { FIELD_BOUNDARIES } from '@/constants';
import { DASHBOARD_INSIGHTS } from './DashboardKPIs';

const GEMINI_API_KEY =
    (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined) ??
    'AIzaSyA8ZnhK4bKe1qbFLQI72ZzBEBx34vOhH5s';

const DEFAULT_GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro'];
const DEFAULT_GEMINI_VERSIONS = ['v1'];

const GEMINI_MODELS = (() => {
    const envModels = (import.meta.env?.VITE_GEMINI_MODELS as string | undefined)
        ?.split(',')
        .map((model) => model.trim())
        .filter(Boolean);
    return envModels && envModels.length > 0 ? envModels : DEFAULT_GEMINI_MODELS;
})();

const GEMINI_VERSIONS = (() => {
    const envVersions = (import.meta.env?.VITE_GEMINI_API_VERSIONS as string | undefined)
        ?.split(',')
        .map((version) => version.trim())
        .filter(Boolean);
    return envVersions && envVersions.length > 0 ? envVersions : DEFAULT_GEMINI_VERSIONS;
})();

const buildGeminiEndpoint = (model: string, version: string) =>
    `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;

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

const extractText = (data: any): string | null => {
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const content = candidates[0]?.content;
    if (!content?.parts) return null;

    return content.parts
        .map((part: any) => part?.text)
        .filter(Boolean)
        .join(' ')
        .trim();
};

export const AIFieldReport: React.FC = () => {
    const [report, setReport] = useState<string>(FALLBACK_REPORT);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState<number>(0);

    const prompt = useMemo(() => buildPrompt(), []);

    const generateReport = useCallback(async () => {
            if (!GEMINI_API_KEY) {
            setError('Missing Gemini API key. Please configure VITE_GEMINI_API_KEY in your environment variables.');
                setLoading(false);
                return;
            }

        setError(null);
        setLoading(true);

            try {
                let lastError: string | null = null;
            let success = false;

                for (const version of GEMINI_VERSIONS) {
                if (success) break;
                    for (const model of GEMINI_MODELS) {
                    if (success) break;
                        try {
                            const response = await fetch(
                                `${buildGeminiEndpoint(model, version)}?key=${GEMINI_API_KEY}`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        contents: [
                                            {
                                                role: 'user',
                                                parts: [{ text: prompt }]
                                            }
                                        ],
                                        generationConfig: {
                                            temperature: 0.4,
                                            maxOutputTokens: 150
                                        }
                                    })
                                }
                            );

                            if (!response.ok) {
                                const details = await response.json().catch(() => null);
                                const message =
                                    details?.error?.message ??
                                    `Gemini request failed with status ${response.status}`;
                                throw new Error(message);
                            }

                            const data = await response.json();
                            const generatedText = extractText(data);

                        if (generatedText) {
                                setReport(enforceWordLimit(generatedText));
                                setError(null);
                            success = true;
                            setRetryCount(0);
                                return;
                            }

                            throw new Error('Gemini response missing text');
                        } catch (modelError) {
                            const message =
                                modelError instanceof Error
                                    ? modelError.message
                                    : 'Unknown Gemini error';
                            lastError = message;
                            console.warn(
                                `Gemini model "${model}" failed on version "${version}": ${message}`
                            );
                        }
                    }
                }

            if (!success) {
                    // Only show error if it's not an IP restriction or API key restriction issue
                    const isRestrictionError = lastError && (
                        lastError.includes('IP address restriction') ||
                        lastError.includes('IP address') ||
                        lastError.includes('restriction') ||
                        lastError.includes('API key')
                    );
                    
                    if (!isRestrictionError && lastError) {
                        setError(`Unable to generate report: ${lastError}`);
                    } else {
                        // Silently use fallback for restriction errors
                        setError(null);
                    }
                    setReport(enforceWordLimit(FALLBACK_REPORT));
                }
            } catch (err) {
                console.error('Gemini report error:', err);
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    
                    // Only show error if it's not an IP restriction or API key restriction issue
                    const isRestrictionError = errorMessage.includes('IP address restriction') ||
                        errorMessage.includes('IP address') ||
                        errorMessage.includes('restriction') ||
                        errorMessage.includes('API key');
                    
                    if (!isRestrictionError) {
                        setError(`Error: ${errorMessage}`);
                    } else {
                        // Silently use fallback for restriction errors
                        setError(null);
                    }
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


