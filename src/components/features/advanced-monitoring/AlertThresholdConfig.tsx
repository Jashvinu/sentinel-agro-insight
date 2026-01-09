import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Bell, Plus, X, Save } from 'lucide-react';
import { ALGORITHM_CONFIGS } from '@/constants';
import type { Algorithm } from '@/types/advancedMonitoring';

export interface AlertThreshold {
    id: string;
    algorithm: Algorithm;
    metric: 'slope' | 'p_value' | 'mean_value';
    operator: '>' | '<' | '>=' | '<=';
    value: number;
    enabled: boolean;
}

interface AlertThresholdConfigProps {
    thresholds: AlertThreshold[];
    onChange: (thresholds: AlertThreshold[]) => void;
}

const METRIC_OPTIONS = [
    { value: 'slope' as const, label: 'Trend Slope (daily)', unit: '/day' },
    { value: 'p_value' as const, label: 'P-Value (significance)', unit: '' },
    { value: 'mean_value' as const, label: 'Mean Value', unit: '' },
];

const OPERATOR_OPTIONS = [
    { value: '>' as const, label: 'Greater than (>)' },
    { value: '>=' as const, label: 'Greater or equal (≥)' },
    { value: '<' as const, label: 'Less than (<)' },
    { value: '<=' as const, label: 'Less or equal (≤)' },
];

export const AlertThresholdConfig: React.FC<AlertThresholdConfigProps> = ({
    thresholds,
    onChange,
}) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newThreshold, setNewThreshold] = useState<Partial<AlertThreshold>>({
        algorithm: 'optram_moisture',
        metric: 'slope',
        operator: '>',
        value: 0.001,
        enabled: true,
    });

    const algorithms = Object.keys(ALGORITHM_CONFIGS) as Algorithm[];

    const handleAdd = () => {
        if (!newThreshold.algorithm || !newThreshold.metric || !newThreshold.operator || newThreshold.value === undefined) {
            return;
        }

        const threshold: AlertThreshold = {
            id: `threshold-${Date.now()}`,
            algorithm: newThreshold.algorithm,
            metric: newThreshold.metric,
            operator: newThreshold.operator,
            value: newThreshold.value,
            enabled: newThreshold.enabled || true,
        };

        onChange([...thresholds, threshold]);
        setShowAddForm(false);
        setNewThreshold({
            algorithm: 'optram_moisture',
            metric: 'slope',
            operator: '>',
            value: 0.001,
            enabled: true,
        });
    };

    const handleRemove = (id: string) => {
        onChange(thresholds.filter((t) => t.id !== id));
    };

    const handleToggle = (id: string) => {
        onChange(
            thresholds.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
        );
    };

    const getThresholdDescription = (threshold: AlertThreshold): string => {
        const algorithmConfig = ALGORITHM_CONFIGS[threshold.algorithm];
        const metric = METRIC_OPTIONS.find((m) => m.value === threshold.metric);
        const operator = OPERATOR_OPTIONS.find((o) => o.value === threshold.operator);

        return `${algorithmConfig?.label || threshold.algorithm}: ${metric?.label} ${operator?.label.split(' ')[0]} ${threshold.value}${metric?.unit}`;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        <div>
                            <CardTitle className="text-lg">Alert Thresholds</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Get notified when trends cross defined thresholds
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowAddForm(!showAddForm)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        {showAddForm ? (
                            <>
                                <X className="w-4 h-4" />
                                Cancel
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Add Threshold
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Add New Threshold Form */}
                {showAddForm && (
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                        <h4 className="font-semibold text-sm">New Alert Threshold</h4>

                        {/* Algorithm Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="alert-algorithm" className="text-sm">
                                Algorithm
                            </Label>
                            <select
                                id="alert-algorithm"
                                value={newThreshold.algorithm}
                                onChange={(e) =>
                                    setNewThreshold({
                                        ...newThreshold,
                                        algorithm: e.target.value as Algorithm,
                                    })
                                }
                                className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                                {algorithms.map((alg) => (
                                    <option key={alg} value={alg}>
                                        {ALGORITHM_CONFIGS[alg].label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Metric Selection */}
                        <div className="space-y-2">
                            <Label htmlFor="alert-metric" className="text-sm">
                                Metric
                            </Label>
                            <select
                                id="alert-metric"
                                value={newThreshold.metric}
                                onChange={(e) =>
                                    setNewThreshold({
                                        ...newThreshold,
                                        metric: e.target.value as AlertThreshold['metric'],
                                    })
                                }
                                className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                                {METRIC_OPTIONS.map((metric) => (
                                    <option key={metric.value} value={metric.value}>
                                        {metric.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Operator Selection */}
                            <div className="space-y-2">
                                <Label htmlFor="alert-operator" className="text-sm">
                                    Condition
                                </Label>
                                <select
                                    id="alert-operator"
                                    value={newThreshold.operator}
                                    onChange={(e) =>
                                        setNewThreshold({
                                            ...newThreshold,
                                            operator: e.target.value as AlertThreshold['operator'],
                                        })
                                    }
                                    className="w-full px-3 py-2 border rounded-md text-sm"
                                >
                                    {OPERATOR_OPTIONS.map((op) => (
                                        <option key={op.value} value={op.value}>
                                            {op.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Value Input */}
                            <div className="space-y-2">
                                <Label htmlFor="alert-value" className="text-sm">
                                    Value
                                </Label>
                                <input
                                    id="alert-value"
                                    type="number"
                                    step="0.0001"
                                    value={newThreshold.value}
                                    onChange={(e) =>
                                        setNewThreshold({
                                            ...newThreshold,
                                            value: parseFloat(e.target.value),
                                        })
                                    }
                                    className="w-full px-3 py-2 border rounded-md text-sm"
                                />
                            </div>
                        </div>

                        {/* Add Button */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                onClick={() => setShowAddForm(false)}
                                variant="ghost"
                                size="sm"
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleAdd} size="sm" className="flex items-center gap-2">
                                <Save className="w-4 h-4" />
                                Add Threshold
                            </Button>
                        </div>
                    </div>
                )}

                {/* Active Thresholds List */}
                {thresholds.length > 0 ? (
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Active Thresholds ({thresholds.length})</h4>
                        {thresholds.map((threshold) => {
                            const algorithmConfig = ALGORITHM_CONFIGS[threshold.algorithm];
                            return (
                                <div
                                    key={threshold.id}
                                    className={`flex items-center justify-between p-3 border rounded-lg ${
                                        threshold.enabled
                                            ? 'bg-background'
                                            : 'bg-muted/30 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={threshold.enabled}
                                            onChange={() => handleToggle(threshold.id)}
                                            className="w-4 h-4"
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{
                                                        backgroundColor: algorithmConfig?.color,
                                                    }}
                                                />
                                                <span className="text-sm font-medium">
                                                    {getThresholdDescription(threshold)}
                                                </span>
                                            </div>
                                            {!threshold.enabled && (
                                                <Badge variant="outline" className="text-xs mt-1">
                                                    Disabled
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleRemove(threshold.id)}
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    !showAddForm && (
                        <div className="text-center py-8 text-muted-foreground">
                            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No alert thresholds configured</p>
                            <p className="text-xs mt-1">
                                Add thresholds to get notified when trends cross specific values
                            </p>
                        </div>
                    )
                )}
            </CardContent>
        </Card>
    );
};
