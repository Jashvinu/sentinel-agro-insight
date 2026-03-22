/**
 * DiagnosticLegend Component
 * Shows dynamic legend with only detected problem types
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ProblemSummary,
  getIndexColor,
  getMultipleProblemColor,
} from '@/services/diagnosticService';
import { AlertTriangle, TrendingDown, AlertCircle } from 'lucide-react';

interface DiagnosticLegendProps {
  problems: ProblemSummary[];
  hasOverlaps: boolean;
  totalCells?: number;
}

export const DiagnosticLegend: React.FC<DiagnosticLegendProps> = ({
  problems,
  hasOverlaps,
  totalCells,
}) => {
  if (problems.length === 0) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-green-700">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">No problems detected</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            All analyzed indices are within healthy ranges.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Problem Areas Legend
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {problems.map((problem) => (
          <LegendItem key={problem.index} problem={problem} totalCells={totalCells} />
        ))}

        {/* Multiple problems indicator */}
        {hasOverlaps && (
          <div className="flex items-center gap-3 pt-2 border-t">
            <div
              className="w-6 h-6 rounded border-2"
              style={{ backgroundColor: getMultipleProblemColor() }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Multiple Issues</span>
                <Badge variant="outline" className="text-xs">
                  Overlap
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Areas with 2+ problems detected
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface LegendItemProps {
  problem: ProblemSummary;
  totalCells?: number;
}

const LegendItem: React.FC<LegendItemProps> = ({ problem, totalCells }) => {
  const color = getIndexColor(problem.index);

  const getTypeIcon = () => {
    switch (problem.type) {
      case 'threshold':
        return <AlertCircle className="w-3 h-3" />;
      case 'trend':
        return <TrendingDown className="w-3 h-3" />;
      case 'both':
        return <AlertTriangle className="w-3 h-3" />;
    }
  };

  const getTypeLabel = () => {
    switch (problem.type) {
      case 'threshold':
        return 'Below threshold';
      case 'trend':
        return 'Declining';
      case 'both':
        return 'Both issues';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-6 h-6 rounded border-2"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{problem.label}</span>
          <Badge
            variant={problem.type === 'both' ? 'destructive' : 'secondary'}
            className="text-xs flex items-center gap-1"
          >
            {getTypeIcon()}
            {getTypeLabel()}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{problem.cellCount} cells{totalCells ? ` (${Math.round((problem.cellCount / totalCells) * 100)}%)` : ''}</span>
          {problem.avgValue !== undefined && (
            <span>• Avg: {problem.avgValue.toFixed(1)}</span>
          )}
          {problem.avgDecline !== undefined && problem.avgDecline !== null && (
            <span className="text-red-500">
              • {problem.avgDecline.toFixed(1)}% change
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticLegend;
