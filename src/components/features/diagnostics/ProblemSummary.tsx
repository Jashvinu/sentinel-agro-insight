/**
 * ProblemSummary Component
 * Shows overall statistics about farm health
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiagnosticResult, isUrgentCell } from '@/services/diagnosticService';
import { Sparkline } from '@/components/ui/sparkline';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Clock,
} from 'lucide-react';

interface ProblemSummaryProps {
  result: DiagnosticResult | null;
  isLoading?: boolean;
}

export const ProblemSummary: React.FC<ProblemSummaryProps> = ({
  result,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <span>Analyzing farm...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No analysis data available</p>
        </CardContent>
      </Card>
    );
  }

  const { farmStats, problems, imagesAnalyzed, analysisDate, cells } = result;
  // Use composite score (confidence+stage-weighted) if available; fall back to cell ratio.
  const healthPercent = result.compositeHealthScore ??
    Math.round((farmStats.healthyCells / farmStats.totalCells) * 100);
  const usingComposite = result.compositeHealthScore !== undefined;
  const hasUrgentCells = cells.some(c => isUrgentCell(c));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Farm Health Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Circular health score */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${healthPercent * 2.64} 264`}
                className={
                  healthPercent >= 70
                    ? 'text-green-500'
                    : healthPercent >= 50
                    ? 'text-amber-500'
                    : 'text-red-500'
                }
                stroke="currentColor"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-bold ${
                healthPercent >= 70
                  ? 'text-green-600'
                  : healthPercent >= 50
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}>
                {healthPercent}%
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {usingComposite
              ? 'Composite health score'
              : `${farmStats.healthyCells} of ${farmStats.totalCells} cells healthy`}
          </span>
          {result.growthStageName && (
            <span className="text-[10px] text-muted-foreground/70 bg-muted/40 rounded-full px-2 py-0.5">
              {result.growthStageName}
            </span>
          )}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Layers className="w-4 h-4" />}
            label="Total Cells"
            value={farmStats.totalCells}
          />
          <StatCard
            icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
            label="Healthy"
            value={farmStats.healthyCells}
            bgClass="bg-green-50 border-green-200"
          />
          <StatCard
            icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
            label="Problem Areas"
            value={farmStats.problemCells}
            bgClass={hasUrgentCells ? "bg-red-50 border-red-500 border-2" : farmStats.problemCells > 0 ? "bg-amber-50 border-amber-200" : undefined}
            urgent={hasUrgentCells}
          />
          <StatCard
            icon={<Layers className="w-4 h-4 text-purple-500" />}
            label="Critical Areas"
            value={farmStats.overlapCells}
            bgClass={farmStats.overlapCells > 0 && hasUrgentCells ? "bg-red-50 border-red-500 border-2" : farmStats.overlapCells > 0 ? "bg-purple-50 border-purple-300" : undefined}
            urgent={farmStats.overlapCells > 0 && hasUrgentCells}
          />
        </div>

        {/* Metadata */}
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>
              Analyzed: {new Date(analysisDate).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3" />
            <span>Based on {imagesAnalyzed} satellite images</span>
          </div>
        </div>

        {/* Problem count */}
        {problems.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Detected Issues ({problems.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {problems.map((p) => {
                const historyData = result.history?.[p.index];
                // Sort by date ascending
                const sortedHistory = historyData ? [...historyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : [];
                const trendPoints = sortedHistory.map(d => d.mean);
                
                return (
                  <div key={p.index} className="flex items-center justify-between p-2 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex flex-col h-full justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </div>
                      {p.confidence && (
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
                          {p.confidence} confidence
                        </div>
                      )}
                      <div className="text-lg font-bold mt-1" style={{ color: p.color }}>
                        {p.avgValue?.toFixed(1) || '--'}
                      </div>
                    </div>
                    {trendPoints.length > 1 && (
                      <div className="w-16 h-8 opacity-80" title="14-day history">
                        <Sparkline data={trendPoints} color={p.color} strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  bgClass?: string;
  urgent?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, bgClass, urgent }) => (
  <div className={`p-2 rounded-lg border ${bgClass || 'bg-muted/30'} relative`}>
    <div className="flex items-center gap-1 text-muted-foreground mb-1">
      {icon}
      <span className="text-xs">{label}</span>
      {urgent && (
        <span className="ml-auto text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
          Urgent
        </span>
      )}
    </div>
    <div className="text-lg font-semibold">{value}</div>
  </div>
);

export default ProblemSummary;
