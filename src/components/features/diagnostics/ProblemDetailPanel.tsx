/**
 * ProblemDetailPanel Component
 * Shows detailed information when a grid cell is clicked
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  GridCell,
  CellProblem,
  getIndexColor,
  getIndexLabel,
  getIndexThresholds,
} from '@/services/diagnosticService';
import {
  X,
  MapPin,
  AlertTriangle,
  TrendingDown,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';

interface ProblemDetailPanelProps {
  cell: GridCell | null;
  onClose: () => void;
}

export const ProblemDetailPanel: React.FC<ProblemDetailPanelProps> = ({
  cell,
  onClose,
}) => {
  if (!cell) return null;

  const [lat, lng] = cell.center;

  return (
    <Card className="absolute bottom-4 left-4 w-80 z-[1000] shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Cell Details
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Location: {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Severity badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Severity:</span>
          <Badge
            variant={
              cell.severity === 'high'
                ? 'destructive'
                : cell.severity === 'medium'
                ? 'default'
                : 'secondary'
            }
          >
            {cell.severity.charAt(0).toUpperCase() + cell.severity.slice(1)}
          </Badge>
          {cell.problems.length > 1 && (
            <Badge variant="outline" className="text-xs">
              {cell.problems.length} issues
            </Badge>
          )}
        </div>

        <Separator />

        {/* Problem list */}
        <div className="space-y-3">
          {cell.problems.map((problem, idx) => (
            <ProblemItem key={idx} problem={problem} />
          ))}
        </div>

        {/* Recommendations */}
        {cell.problems.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Lightbulb className="w-3 h-3" />
                Recommendations
              </div>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {cell.problems.map((problem, idx) => (
                  <li key={idx}>• {getRecommendation(problem)}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

interface ProblemItemProps {
  problem: CellProblem;
}

const ProblemItem: React.FC<ProblemItemProps> = ({ problem }) => {
  const color = getIndexColor(problem.index);
  const label = getIndexLabel(problem.index);
  const thresholds = getIndexThresholds(problem.index);

  const getIcon = () => {
    switch (problem.type) {
      case 'threshold':
        return <AlertCircle className="w-4 h-4" />;
      case 'trend':
        return <TrendingDown className="w-4 h-4" />;
      case 'both':
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-2 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-3 h-3 rounded"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground">{getIcon()}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Current: </span>
          <span className="font-medium">{problem.currentValue.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Threshold: </span>
          <span className="font-medium">{problem.threshold}</span>
        </div>
        {problem.previousValue !== undefined && (
          <div>
            <span className="text-muted-foreground">Previous: </span>
            <span className="font-medium">{problem.previousValue.toFixed(1)}</span>
          </div>
        )}
        {problem.changePercent !== undefined && (
          <div>
            <span className="text-muted-foreground">Change: </span>
            <span className={`font-medium ${problem.changePercent < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {problem.changePercent > 0 ? '+' : ''}{problem.changePercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-1">{problem.message}</p>
    </div>
  );
};

/**
 * Generate recommendations based on problem type
 */
function getRecommendation(problem: CellProblem): string {
  const recommendations: Record<string, Record<string, string>> = {
    nitrogen: {
      threshold: 'Apply nitrogen fertilizer (50-100 kg N/ha recommended)',
      trend: 'Monitor nitrogen levels and consider split application',
      both: 'Urgent: Apply nitrogen fertilizer immediately',
    },
    moisture: {
      threshold: 'Increase irrigation frequency or duration',
      trend: 'Check irrigation system efficiency',
      both: 'Urgent: Immediate irrigation needed',
    },
    ndvi: {
      threshold: 'Check for pest/disease, consider foliar treatment',
      trend: 'Monitor crop stress factors (water, nutrients)',
      both: 'Scout field immediately for stress causes',
    },
    phosphorus: {
      threshold: 'Apply phosphorus fertilizer (30-50 kg P₂O₅/ha)',
      trend: 'Consider soil pH adjustment for better P availability',
      both: 'Apply phosphorus and check soil pH',
    },
  };

  return recommendations[problem.index]?.[problem.type] || 'Monitor this area closely';
}

export default ProblemDetailPanel;
