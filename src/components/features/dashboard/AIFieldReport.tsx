import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Loader2 } from 'lucide-react';
import { FIELD_BOUNDARIES } from '@/constants';
import { DASHBOARD_INSIGHTS } from './DashboardKPIs';

const GEMINI_API_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const GEMINI_API_KEY =
    (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined) ??
    'AIzaSyA8ZnhK4bKe1qbFLQI72ZzBEBx34vOhH5s';

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

    const prompt = useMemo(() => buildPrompt(), []);

    useEffect(() => {
        let isMounted = true;

        const generateReport = async () => {
            if (!GEMINI_API_KEY) {
                setError('Missing Gemini API key');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
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
                });

                if (!response.ok) {
                    throw new Error(`Gemini request failed with status ${response.status}`);
                }

                const data = await response.json();
                const generatedText = extractText(data);

                if (generatedText && isMounted) {
                    setReport(enforceWordLimit(generatedText));
                    setError(null);
                } else if (isMounted) {
                    setError('Gemini response missing text');
                    setReport(enforceWordLimit(FALLBACK_REPORT));
                }
            } catch (err) {
                console.error('Gemini report error:', err);
                if (isMounted) {
                    setError('update');
                    setReport(enforceWordLimit(FALLBACK_REPORT));
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        generateReport();

        return () => {
            isMounted = false;
        };
    }, [prompt]);

    return (
        <Card className="border-primary/20 bg-muted/20">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                    <Bot className="w-5 h-5 text-primary" />
                    <span>AI Field Brief</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {loading ? (
                    <div className="flex items-center space-x-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating satellite summary…</span>
                    </div>
                ) : (
                    <p className="text-sm leading-6 text-foreground">{report}</p>
                )}
                {error && (
                    <p className="text-xs text-warning">
                        {error}
                    </p>
                )}
            </CardContent>
        </Card>
    );
};


