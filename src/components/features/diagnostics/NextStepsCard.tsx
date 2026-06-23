import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DiagnosticIndex, DiagnosticResult, getIndexColor } from '@/services/diagnosticService';
import { CheckCircle2, ChevronRight, AlertCircle, Droplets, Leaf, FlaskConical, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GrowthStage } from '@/services/phenology';

/** What matters most at each growth stage — shown as a contextual banner. */
const STAGE_FOCUS: Partial<Record<GrowthStage, { headline: string; detail: string }>> = {
  pre_emergence: {
    headline: 'Pre-emergence: ensure good seedbed',
    detail: 'Focus on soil temperature, moisture and seed placement. No leaf-area metrics are meaningful yet.',
  },
  seedling: {
    headline: 'Seedling / Establishment: water and stand count',
    detail: 'Prioritise uniform water availability and check germination/transplant survival. N uptake is low — wait for tillering before N decisions.',
  },
  tillering: {
    headline: 'Tillering: nitrogen and early disease watch',
    detail: 'This is the key N window for cereals. Monitor for sheath blight and early blast. Water stress here directly cuts tiller count.',
  },
  panicle_initiation: {
    headline: 'Panicle initiation: protect the yield',
    detail: 'PI is the most stress-sensitive stage. Any N, water or disease pressure now cuts yield potential sharply.',
  },
  heading: {
    headline: 'Heading / Flowering: blast and water',
    detail: 'Neck blast risk peaks at heading. Keep soil moist; water deficit at anthesis causes spikelet sterility.',
  },
  grain_fill: {
    headline: 'Grain fill: stay green, avoid water stress',
    detail: 'Leaf area must stay green until ~10 days before maturity for maximum grain weight. Watch for charcoal rot and late blight.',
  },
  maturity: {
    headline: 'Maturity: plan harvest timing',
    detail: 'Satellite indices are less actionable at maturity. Focus on harvest timing to avoid field losses.',
  },
};

interface NextStepsCardProps {
  result: DiagnosticResult | null;
}

interface ActionableInsight {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: React.ReactNode;
  color: string;
}

export const NextStepsCard: React.FC<NextStepsCardProps> = ({ result }) => {
  const insights = useMemo(() => {
    if (!result || result.problems.length === 0) return [];
    
    const generated: ActionableInsight[] = [];
    const { cells } = result;
    
    // Group problems by index
    const indexCounts = new Map<DiagnosticIndex, { count: number; urgentCount: number; avgValue: number }>();
    
    cells.forEach(cell => {
      cell.problems.forEach(p => {
        const existing = indexCounts.get(p.index) || { count: 0, urgentCount: 0, avgValue: 0 };
        existing.count += 1;
        if (p.urgent) existing.urgentCount += 1;
        existing.avgValue += p.currentValue;
        indexCounts.set(p.index, existing);
      });
    });

    // Generate insights based on the aggregates
    indexCounts.forEach((stats, index) => {
      const avgValue = stats.avgValue / stats.count;
      const coveragePercent = Math.round((stats.count / result.farmStats.totalCells) * 100);
      const isWidespread = coveragePercent > 20; // If affects more than 20% of farm
      
      const color = getIndexColor(index);
      
      if (index === 'nitrogen') {
        generated.push({
          id: `nitrogen-${stats.urgentCount > 0 ? 'urgent' : 'standard'}`,
          title: 'Verify Nitrogen Stress',
          description: `Prioritize ${stats.count} low-score areas (${coveragePercent}% of farm). Confirm with soil testing and crop-stage scouting before changing nitrogen inputs.`,
          priority: stats.urgentCount > 0 ? 'high' : 'medium',
          icon: <Leaf className="w-4 h-4" />,
          color
        });
      }
      
      if (index === 'moisture') {
        generated.push({
          id: `moisture-${stats.urgentCount > 0 ? 'urgent' : 'standard'}`,
          title: 'Immediate Irrigation Needed',
          description: `Schedule irrigation for ${stats.count} dry cells. Soil moisture drops are critical in ${stats.urgentCount} key areas.`,
          priority: stats.urgentCount > 0 ? 'high' : 'medium',
          icon: <Droplets className="w-4 h-4" />,
          color
        });
      }
      
      if (index === 'ndvi') {
        generated.push({
          id: `ndvi-${isWidespread ? 'widespread' : 'focal'}`,
          title: 'Scout for Crop Stress',
          description: isWidespread 
            ? `Widespread crop health decline detected across ${coveragePercent}% of the farm. Schedule a full field scouting tomorrow.`
            : `Focal crop stress in ${stats.count} areas. Check those specific coordinates for pests or disease.`,
          priority: isWidespread ? 'high' : 'medium',
          icon: <AlertCircle className="w-4 h-4" />,
          color
        });
      }
      
    });
    
    // Sort by priority
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    return generated.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
  }, [result]);

  if (!result) return null;

  const advisoryItems = result.advisory ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          Recommended Actions
        </CardTitle>
        <CardDescription className="text-xs">
          {insights.length > 0 ? "Prioritized steps based on current analysis" : "No immediate actions required."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stage focus banner */}
        {result.growthStage && STAGE_FOCUS[result.growthStage] && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-primary mb-0.5">
              <Sprout className="w-3.5 h-3.5" />
              {STAGE_FOCUS[result.growthStage]!.headline}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {STAGE_FOCUS[result.growthStage]!.detail}
            </p>
          </div>
        )}

        {/* Low data quality banner */}
        {result.lowDataQuality && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
            <span className="font-semibold">Limited satellite data.</span> High cloud cover or few clear observations this period — flagging is suppressed. Results will improve once cloud-free imagery is available.
          </div>
        )}

        {insights.length === 0 && !result.lowDataQuality ? (
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
             <p className="text-sm text-green-700 font-medium">No critical issues detected.</p>
             <p className="text-xs text-green-600 mt-1">Keep up your current management routine.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`p-3 rounded-lg border relative overflow-hidden`}
                style={{
                  borderColor: insight.priority === 'high' ? `${insight.color}50` : 'var(--border)',
                  backgroundColor: insight.priority === 'high' ? `${insight.color}05` : 'transparent'
                }}
              >
                {/* Visual indicator bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: insight.color }}
                />

                <div className="pl-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      <span style={{ color: insight.color }}>{insight.icon}</span>
                      {insight.title}
                    </div>
                    {insight.priority === 'high' && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-red-100 text-red-700">
                        Priority
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {insight.description}
                  </p>

                  <Button variant="ghost" size="sm" className="h-6 px-2 mt-2 text-xs -ml-2 text-muted-foreground hover:text-primary">
                    View Areas <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Advisory / soil-test section — P, K, pH, salinity */}
        {advisoryItems.length > 0 && (
          <div className="mt-2 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
              <FlaskConical className="w-3.5 h-3.5" />
              Soil test recommended for accurate readings
            </div>
            <div className="flex flex-wrap gap-2">
              {advisoryItems.map(item => (
                <span
                  key={item.index}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border"
                  style={{ borderColor: `${item.color}50`, color: item.color, backgroundColor: `${item.color}08` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                  {item.label}: {item.value.toFixed(item.index === 'ph' ? 1 : 0)}
                  <span className="text-muted-foreground ml-0.5">({item.confidence})</span>
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
              Phosphorus, Potassium, pH and Salinity have low satellite retrievability. These values are context only — confirm with a lab or rapid soil test before applying inputs.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
