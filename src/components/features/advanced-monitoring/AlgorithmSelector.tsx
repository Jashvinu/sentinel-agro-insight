import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Droplets, Leaf, Activity } from 'lucide-react';
import { ALGORITHM_CONFIGS } from '@/constants';
import type { Algorithm } from '@/types/advancedMonitoring';

interface AlgorithmSelectorProps {
    selectedAlgorithms: Algorithm[];
    onChange: (algorithms: Algorithm[]) => void;
}

export const AlgorithmSelector: React.FC<AlgorithmSelectorProps> = ({
    selectedAlgorithms,
    onChange,
}) => {
    const algorithms = Object.values(ALGORITHM_CONFIGS);

    const handleToggle = (algorithmId: Algorithm) => {
        if (selectedAlgorithms.includes(algorithmId)) {
            onChange(selectedAlgorithms.filter((id) => id !== algorithmId));
        } else {
            onChange([...selectedAlgorithms, algorithmId]);
        }
    };

    const handleSelectAll = () => {
        onChange(algorithms.map((alg) => alg.id));
    };

    const handleClearAll = () => {
        onChange([]);
    };

    const handleSelectCategory = (category: 'moisture' | 'nutrients') => {
        const categoryAlgorithms = algorithms
            .filter((alg) => alg.category === category)
            .map((alg) => alg.id);

        // Add category algorithms to current selection (union)
        const newSelection = Array.from(new Set([...selectedAlgorithms, ...categoryAlgorithms]));
        onChange(newSelection as Algorithm[]);
    };

    const handleClearCategory = (category: 'moisture' | 'nutrients') => {
        const categoryAlgorithmIds = algorithms
            .filter((alg) => alg.category === category)
            .map((alg) => alg.id);

        // Remove category algorithms from current selection
        onChange(selectedAlgorithms.filter((id) => !categoryAlgorithmIds.includes(id)));
    };

    const moistureAlgorithms = algorithms.filter((alg) => alg.category === 'moisture');
    const nutrientAlgorithms = algorithms.filter((alg) => alg.category === 'nutrients');

    const getCategoryIcon = (category: string) => {
        return category === 'moisture' ? <Droplets className="w-4 h-4" /> : <Leaf className="w-4 h-4" />;
    };

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        Select Algorithms ({selectedAlgorithms.length}/{algorithms.length})
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSelectAll}
                        className="text-xs text-accent hover:underline"
                        type="button"
                    >
                        Select All
                    </button>
                    <span className="text-xs text-muted-foreground">|</span>
                    <button
                        onClick={handleClearAll}
                        className="text-xs text-muted-foreground hover:underline"
                        type="button"
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Moisture Algorithms */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {getCategoryIcon('moisture')}
                        <h3 className="text-sm font-semibold">Soil Moisture</h3>
                        <Badge variant="secondary" className="text-xs">
                            {moistureAlgorithms.length} algorithms
                        </Badge>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleSelectCategory('moisture')}
                            className="text-xs text-accent hover:underline"
                            type="button"
                        >
                            Select All
                        </button>
                        <span className="text-xs text-muted-foreground">|</span>
                        <button
                            onClick={() => handleClearCategory('moisture')}
                            className="text-xs text-muted-foreground hover:underline"
                            type="button"
                        >
                            Clear
                        </button>
                    </div>
                </div>
                <div className="space-y-2 pl-6">
                    {moistureAlgorithms.map((algorithm) => (
                        <div key={algorithm.id} className="flex items-start space-x-3">
                            <Checkbox
                                id={algorithm.id}
                                checked={selectedAlgorithms.includes(algorithm.id)}
                                onCheckedChange={() => handleToggle(algorithm.id)}
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <Label
                                    htmlFor={algorithm.id}
                                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                                >
                                    {algorithm.label}
                                    <span
                                        className="inline-block w-3 h-3 rounded-full"
                                        style={{ backgroundColor: algorithm.color }}
                                    />
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {algorithm.description} • Unit: {algorithm.unit}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Nutrient Algorithms */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {getCategoryIcon('nutrients')}
                        <h3 className="text-sm font-semibold">Soil Nutrients</h3>
                        <Badge variant="secondary" className="text-xs">
                            {nutrientAlgorithms.length} algorithms
                        </Badge>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleSelectCategory('nutrients')}
                            className="text-xs text-accent hover:underline"
                            type="button"
                        >
                            Select All
                        </button>
                        <span className="text-xs text-muted-foreground">|</span>
                        <button
                            onClick={() => handleClearCategory('nutrients')}
                            className="text-xs text-muted-foreground hover:underline"
                            type="button"
                        >
                            Clear
                        </button>
                    </div>
                </div>
                <div className="space-y-2 pl-6">
                    {nutrientAlgorithms.map((algorithm) => (
                        <div key={algorithm.id} className="flex items-start space-x-3">
                            <Checkbox
                                id={algorithm.id}
                                checked={selectedAlgorithms.includes(algorithm.id)}
                                onCheckedChange={() => handleToggle(algorithm.id)}
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <Label
                                    htmlFor={algorithm.id}
                                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                                >
                                    {algorithm.label}
                                    <span
                                        className="inline-block w-3 h-3 rounded-full"
                                        style={{ backgroundColor: algorithm.color }}
                                    />
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {algorithm.description} • Unit: {algorithm.unit}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
