import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DiagnosticIndex, DiagnosticResult, getIndexColor } from '@/services/diagnosticService';
import { CheckCircle2, ChevronRight, AlertCircle, Droplets, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        const amount = stats.urgentCount > 0 ? '70-100' : '40-60';
        generated.push({
          id: `nitrogen-${stats.urgentCount > 0 ? 'urgent' : 'standard'}`,
          title: 'Verify Nitrogen Stress',
          description: `Prioritize ${stats.count} low-score areas (${coveragePercent}% of farm). If field scouting confirms N stress, use a split ${amount} kg N/ha correction.`,
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
      
      if (index === 'phosphorus') {
         generated.push({
          id: 'phosphorus-standard',
          title: 'Phosphorus Alignment',
          description: `Low-confidence phosphorus signal in ${stats.count} areas. Confirm with a soil test before applying 30-50 kg P2O5/ha.`,
          priority: 'low',
          icon: <Leaf className="w-4 h-4" />,
          color
        });
      }

      if (index === 'potassium') {
        generated.push({
          id: `potassium-${stats.urgentCount > 0 ? 'urgent' : 'standard'}`,
          title: 'Check Potassium Availability',
          description: `Scout ${stats.count} potassium-stressed areas, especially where moisture stress overlaps. Consider K2O correction after soil confirmation.`,
          priority: stats.urgentCount > 0 ? 'medium' : 'low',
          icon: <Leaf className="w-4 h-4" />,
          color
        });
      }
    });
    
    // Sort by priority
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    return generated.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
  }, [result]);

  if (!result) return null;

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
        {insights.length === 0 ? (
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
             <p className="text-sm text-green-700 font-medium">Your farm is healthy!</p>
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
                  
                  {/* Action button (placeholder for actual functionality like creating a task) */}
                  <Button variant="ghost" size="sm" className="h-6 px-2 mt-2 text-xs -ml-2 text-muted-foreground hover:text-primary">
                    View Areas <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
