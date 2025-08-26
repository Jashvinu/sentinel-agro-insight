import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
    Leaf,
    Droplets,
    Zap,
    Thermometer,
    TreePine,
    Target,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    Info,
    Gauge,
    Waves
} from 'lucide-react';
import { AGRICULTURAL_INDICES } from '@/constants';
import { AgriculturalIndex, IndexCalculation, SoilHealthData } from '@/types';

interface AgriculturalIndicesProps {
    className?: string;
}

export const AgriculturalIndices: React.FC<AgriculturalIndicesProps> = ({
    className
}) => {
    const [selectedCategory, setSelectedCategory] = useState('NPK');

    // Mock soil health data for demonstration
    const mockSoilHealthData: SoilHealthData = {
        npk: {
            nitrogen: {
                indexId: 'nitrogen',
                value: 185.6,
                unit: 'kg N/ha',
                status: 'Adequate',
                color: '#f59e0b',
                confidence: 0.87,
                timestamp: new Date().toISOString(),
                requiresCalibration: true
            },
            phosphorus: {
                indexId: 'phosphorus',
                value: 78.3,
                unit: 'kg P₂O₅/ha',
                status: 'Adequate',
                color: '#f59e0b',
                confidence: 0.76,
                timestamp: new Date().toISOString(),
                requiresCalibration: true
            },
            potassium: {
                indexId: 'potassium',
                value: 142.7,
                unit: 'kg K₂O/ha',
                status: 'Adequate',
                color: '#f59e0b',
                confidence: 0.79,
                timestamp: new Date().toISOString(),
                requiresCalibration: true
            }
        },
        salinity: {
            indexId: 'salinity',
            value: 3.2,
            unit: 'dS/m (ECe)',
            status: 'Moderate',
            color: '#f59e0b',
            confidence: 0.78,
            timestamp: new Date().toISOString(),
            requiresCalibration: true
        },
        ph: {
            indexId: 'ph',
            value: 6.8,
            unit: 'pH units',
            status: 'Neutral',
            color: '#10b981',
            confidence: 0.82,
            timestamp: new Date().toISOString(),
            requiresCalibration: true
        },
        moisture: {
            indexId: 'moisture',
            value: 28.4,
            unit: '% (volumetric)',
            status: 'Moist',
            color: '#10b981',
            confidence: 0.71,
            timestamp: new Date().toISOString(),
            requiresCalibration: true
        },
        carbon: {
            indexId: 'carbon',
            value: 4.2,
            unit: '% (SOC)',
            status: 'Medium',
            color: '#f59e0b',
            confidence: 0.84,
            timestamp: new Date().toISOString(),
            requiresCalibration: true
        },
        vegetation: {
            ndvi: {
                indexId: 'ndvi',
                value: 0.67,
                unit: 'Index',
                status: 'High',
                color: '#10b981',
                confidence: 0.91,
                timestamp: new Date().toISOString(),
                requiresCalibration: false
            },
            evi: {
                indexId: 'evi',
                value: 0.58,
                unit: 'Index',
                status: 'Medium',
                color: '#f59e0b',
                confidence: 0.87,
                timestamp: new Date().toISOString(),
                requiresCalibration: false
            },
            savi: {
                indexId: 'savi',
                value: 0.62,
                unit: 'Index',
                status: 'High',
                color: '#10b981',
                confidence: 0.89,
                timestamp: new Date().toISOString(),
                requiresCalibration: false
            },
            msavi: {
                indexId: 'msavi',
                value: 0.64,
                unit: 'Index',
                status: 'High',
                color: '#10b981',
                confidence: 0.90,
                timestamp: new Date().toISOString(),
                requiresCalibration: false
            }
        }
    };

    // Group indices by category
    const indexCategories = {
        'NPK': ['nitrogen', 'phosphorus', 'potassium'],
        'Salinity': ['salinity'],
        'pH': ['ph'],
        'Moisture': ['moisture'],
        'Carbon': ['carbon'],
        'Vegetation': ['ndvi', 'evi', 'savi', 'msavi'],
        'Water': ['ndwi']
    };

    const getIndexIcon = (category: string) => {
        const iconMap = {
            'NPK': Leaf,
            'Salinity': Zap,
            'pH': Thermometer,
            'Moisture': Droplets,
            'Carbon': TreePine,
            'Vegetation': Leaf,
            'Water': Waves
        };
        return iconMap[category as keyof typeof iconMap] || Leaf;
    };

    const getStatusIcon = (status: string) => {
        if (status.includes('Optimal') || status.includes('High') || status.includes('Normal')) {
            return <CheckCircle className="w-4 h-4 text-green-600" />;
        } else if (status.includes('Adequate') || status.includes('Medium') || status.includes('Moderate')) {
            return <Info className="w-4 h-4 text-yellow-600" />;
        } else {
            return <AlertTriangle className="w-4 h-4 text-red-600" />;
        }
    };

    const renderIndexCard = (indexId: string) => {
        const index = AGRICULTURAL_INDICES[indexId as keyof typeof AGRICULTURAL_INDICES];
        if (!index) return null;

        let currentValue: IndexCalculation | undefined;
        if (index.category === 'NPK') {
            currentValue = mockSoilHealthData.npk[indexId as keyof typeof mockSoilHealthData.npk];
        } else if (index.category === 'Vegetation') {
            currentValue = mockSoilHealthData.vegetation[indexId];
        } else {
            currentValue = mockSoilHealthData[indexId as keyof Omit<SoilHealthData, 'npk' | 'vegetation'>];
        }

        if (!currentValue) return null;

        const Icon = getIndexIcon(index.category);

        return (
            <Card key={indexId} className="p-4 border-l-4 hover:shadow-md transition-shadow"
                style={{ borderLeftColor: currentValue.color }}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">{index.name}</h4>
                    </div>
                    <div className="flex items-center space-x-2">
                        {getStatusIcon(currentValue.status)}
                        <Badge variant="outline" className="text-xs">
                            {index.category}
                        </Badge>
                    </div>
                </div>

                <div className="text-3xl font-bold mb-2" style={{ color: currentValue.color }}>
                    {currentValue.value.toFixed(2)}
                </div>

                <div className="text-sm text-muted-foreground mb-3">
                    {currentValue.unit} • {currentValue.status}
                </div>

                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                        <Gauge className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            Confidence: {Math.round(currentValue.confidence * 100)}%
                        </span>
                    </div>
                    {currentValue.requiresCalibration && (
                        <Badge variant="secondary" className="text-xs">
                            Calibration Required
                        </Badge>
                    )}
                </div>

                {/* Range indicator */}
                <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-1">Status Range</div>
                    <div className="flex space-x-1">
                        {Object.entries(index.ranges).map(([rangeKey, range]) => (
                            <div
                                key={rangeKey}
                                className="flex-1 h-2 rounded-full"
                                style={{ backgroundColor: range.color }}
                                title={`${range.status}: ${range.min}-${range.max} ${currentValue.unit}`}
                            />
                        ))}
                    </div>
                </div>
            </Card>
        );
    };



    const renderCategoryOverview = () => {
        const categoryIndices = indexCategories[selectedCategory as keyof typeof indexCategories] || [];
        const Icon = getIndexIcon(selectedCategory);

        // Calculate category statistics
        let totalIndices = categoryIndices.length;
        let optimalCount = 0;
        let averageConfidence = 0;

        categoryIndices.forEach(indexId => {
            let currentValue: IndexCalculation | undefined;
            if (selectedCategory === 'NPK') {
                currentValue = mockSoilHealthData.npk[indexId as keyof typeof mockSoilHealthData.npk];
            } else if (selectedCategory === 'Vegetation') {
                currentValue = mockSoilHealthData.vegetation[indexId];
            } else {
                currentValue = mockSoilHealthData[indexId as keyof Omit<SoilHealthData, 'npk' | 'vegetation'>];
            }

            if (currentValue) {
                if (currentValue.status.includes('Optimal') || currentValue.status.includes('High') || currentValue.status.includes('Normal')) {
                    optimalCount++;
                }
                averageConfidence += currentValue.confidence;
            }
        });

        averageConfidence = averageConfidence / totalIndices;

        return (
            <div className="space-y-4">
                <div className="flex items-center space-x-3 mb-4">
                    <Icon className="w-8 h-8 text-primary" />
                    <div>
                        <h3 className="text-xl font-bold">{selectedCategory} Indices</h3>
                        <p className="text-muted-foreground">
                            {totalIndices} available indices for {selectedCategory.toLowerCase()} assessment
                        </p>
                    </div>
                </div>

                {/* Category Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{totalIndices}</div>
                        <div className="text-xs text-muted-foreground">Total Indices</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{optimalCount}</div>
                        <div className="text-xs text-muted-foreground">Optimal Status</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{Math.round(averageConfidence * 100)}%</div>
                        <div className="text-xs text-muted-foreground">Avg Confidence</div>
                    </div>
                </div>

                {/* Index Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categoryIndices.map(renderIndexCard)}
                </div>
            </div>
        );
    };

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                        <Target className="w-6 h-6 text-primary" />
                        <span>Agricultural Indices Dashboard</span>
                    </CardTitle>
                </div>
            </CardHeader>

            <CardContent>
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
                    <TabsList className="grid w-full grid-cols-7 mb-6">
                        {Object.keys(indexCategories).map((category) => (
                            <TabsTrigger key={category} value={category} className="text-xs px-2 py-1">
                                {category}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value={selectedCategory} className="space-y-6">
                        {renderCategoryOverview()}
                    </TabsContent>
                </Tabs>

                {/* Overall Soil Health Summary */}
                <Separator className="my-6" />

                <div className="p-4 bg-muted/30 rounded-lg">
                    <h4 className="font-semibold mb-3 flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span>Overall Soil Health Summary</span>
                    </h4>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                                {Object.values(mockSoilHealthData.npk).filter(n => n.status === 'Optimal').length}/3
                            </div>
                            <div className="text-xs text-muted-foreground">Optimal NPK</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                                {mockSoilHealthData.ph.status}
                            </div>
                            <div className="text-xs text-muted-foreground">pH Status</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">
                                {mockSoilHealthData.salinity.status}
                            </div>
                            <div className="text-xs text-muted-foreground">Salinity</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-600">
                                {mockSoilHealthData.moisture.status}
                            </div>
                            <div className="text-xs text-muted-foreground">Moisture</div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
