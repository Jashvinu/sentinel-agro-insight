import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/layout/navigation/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Droplets,
  Sprout,
  BarChart3,
  Loader2,
  Info
} from 'lucide-react';
import { YieldPredictionInput, YieldPredictionResult } from '@/types';
import { predictCropYield, getEvergreenFarmDummyData } from '@/services/yieldPredictionService';
import { useAbeFarm } from '@/hooks/useAbeFarm';
import { getFarmById } from '@/services/farmService';
import { toast } from '@/hooks/useToast';

const YieldPrediction = () => {
  const [currentPage, setCurrentPage] = useState('yield-prediction');
  const { farmId } = useAbeFarm();
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [farmGeometry, setFarmGeometry] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<YieldPredictionResult | null>(null);

  // Form state
  const [formData, setFormData] = useState<YieldPredictionInput>(() => {
    // Initialize with dummy data for Evergreen farm
    return getEvergreenFarmDummyData();
  });

  // Load farm geometry when farmId is available
  useEffect(() => {
    if (farmId) {
      loadFarmGeometry(farmId);
    }
  }, [farmId]);

  const loadFarmGeometry = async (id: string) => {
    try {
      // Get farm from localStorage
      const farm = await getFarmById(id);

      if (farm?.geometry) {
        const geometryStr = JSON.stringify(farm.geometry);
        setFarmGeometry(geometryStr);

        // Update form with farm data
        setFormData(prev => ({
          ...prev,
          farmId: id,
          fieldAreaHectares: farm.area_hectares || prev.fieldAreaHectares,
        }));

        // Auto-fetch NPK and satellite data
        await fetchFieldData(geometryStr, id);
      }
    } catch (error) {
      console.error('[YieldPrediction] Error loading farm geometry:', error);
    }
  };

  const fetchFieldData = async (polygon: string, farmId: string) => {
    setFetchingData(true);
    try {
      const { predictCropYield } = await import('@/services/yieldPredictionService');
      // Fetch satellite indices (including NPK)
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const getHeaders = () => {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
        const headers: Record<string, string> = {};
        if (anonKey) {
          headers['apikey'] = anonKey;
          headers['Authorization'] = `Bearer ${anonKey}`;
        }
        return headers;
      };

      const { buildApiUrl } = await import('@/services/api');
      const { API_ENDPOINTS } = await import('@/constants');
      const headers = getHeaders();

      // Fetch NPK data
      const [nitrogenRes, phosphorusRes, potassiumRes] = await Promise.allSettled([
        fetch(buildApiUrl(`${API_ENDPOINTS.agriculturalIndices}?index=nitrogen&polygon=${encodeURIComponent(polygon)}&start=${thirtyDaysAgo}&end=${today}`), { headers }),
        fetch(buildApiUrl(`${API_ENDPOINTS.agriculturalIndices}?index=phosphorus&polygon=${encodeURIComponent(polygon)}&start=${thirtyDaysAgo}&end=${today}`), { headers }),
        fetch(buildApiUrl(`${API_ENDPOINTS.agriculturalIndices}?index=potassium&polygon=${encodeURIComponent(polygon)}&start=${thirtyDaysAgo}&end=${today}`), { headers }),
      ]);

      const updateData: Partial<YieldPredictionInput> = {};

      if (nitrogenRes.status === 'fulfilled' && nitrogenRes.value.ok) {
        const data = await nitrogenRes.value.json();
        if (data.mean_value !== null && data.mean_value !== undefined) {
          updateData.soilNitrogen = data.mean_value;
        }
      }

      if (phosphorusRes.status === 'fulfilled' && phosphorusRes.value.ok) {
        const data = await phosphorusRes.value.json();
        if (data.mean_value !== null && data.mean_value !== undefined) {
          updateData.soilPhosphorus = data.mean_value;
        }
      }

      if (potassiumRes.status === 'fulfilled' && potassiumRes.value.ok) {
        const data = await potassiumRes.value.json();
        if (data.mean_value !== null && data.mean_value !== undefined) {
          updateData.soilPotassium = data.mean_value;
        }
      }

      if (Object.keys(updateData).length > 0) {
        setFormData(prev => ({ ...prev, ...updateData }));
        toast({
          title: 'Field data loaded',
          description: 'NPK values and field size have been fetched from satellite data.',
        });
      }
    } catch (error) {
      // Error fetching field data
    } finally {
      setFetchingData(false);
    }
  };

  const handleInputChange = (field: keyof YieldPredictionInput, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLoadDummyData = () => {
    const dummy = getEvergreenFarmDummyData();
    setFormData({
      ...dummy,
      farmId: farmId || dummy.farmId,
    });
    toast({
      title: 'Dummy data loaded',
      description: 'Evergreen farm corn data has been loaded into the form. You can now predict yield!',
    });
  };

  const handlePredict = async () => {
    if (!formData.plantingDate || !formData.fieldAreaHectares) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await predictCropYield(formData, farmGeometry || undefined);
      setPrediction(result);
      toast({
        title: 'Prediction Complete',
        description: `Predicted yield: ${result.predictedYield.toFixed(2)} Mg/ha`,
      });
    } catch (error: any) {
      toast({
        title: 'Prediction Failed',
        description: error.message || 'An error occurred during prediction.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Yield Prediction
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mt-1">
              Predict corn yield using satellite data and field management practices
            </p>
          </div>
          <Button
            onClick={handleLoadDummyData}
            variant="outline"
            className="flex-shrink-0"
          >
            Load Evergreen Farm Data
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Field Information</CardTitle>
                <CardDescription>Enter your field and crop details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Crop Type</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md bg-background"
                      value={formData.cropType}
                      onChange={(e) => handleInputChange('cropType', e.target.value)}
                    >
                      <option value="corn">Corn</option>
                      <option value="wheat">Wheat</option>
                      <option value="soybean">Soybean</option>
                      <option value="rice">Rice</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Variety</label>
                    <Input
                      value={formData.variety}
                      onChange={(e) => handleInputChange('variety', e.target.value)}
                      placeholder="e.g., Pioneer P1234"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Planting Date *</label>
                    <Input
                      type="date"
                      value={formData.plantingDate}
                      onChange={(e) => handleInputChange('plantingDate', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      Field Area (hectares) *
                      <Badge variant="outline" className="text-xs">From Farm Data</Badge>
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.fieldAreaHectares}
                      onChange={(e) => handleInputChange('fieldAreaHectares', parseFloat(e.target.value) || 0)}
                      required
                      disabled={fetchingData}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Soil Data</CardTitle>
                <CardDescription>
                  {fetchingData ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Fetching NPK data from satellites...
                    </span>
                  ) : (
                    'Soil properties and nutrient levels (NPK fetched from satellite data)'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Soil pH</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="4"
                      max="9"
                      value={formData.soilPh}
                      onChange={(e) => handleInputChange('soilPh', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Organic Matter (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={formData.soilOrganicMatter}
                      onChange={(e) => handleInputChange('soilOrganicMatter', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      Nitrogen (kg/ha)
                      <Badge variant="outline" className="text-xs">From Satellite</Badge>
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.soilNitrogen}
                      onChange={(e) => handleInputChange('soilNitrogen', parseFloat(e.target.value) || 0)}
                      disabled={fetchingData}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      Phosphorus (kg/ha)
                      <Badge variant="outline" className="text-xs">From Satellite</Badge>
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.soilPhosphorus}
                      onChange={(e) => handleInputChange('soilPhosphorus', parseFloat(e.target.value) || 0)}
                      disabled={fetchingData}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-2">
                      Potassium (kg/ha)
                      <Badge variant="outline" className="text-xs">From Satellite</Badge>
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.soilPotassium}
                      onChange={(e) => handleInputChange('soilPotassium', parseFloat(e.target.value) || 0)}
                      disabled={fetchingData}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handlePredict}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Predicting...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Predict Yield
                </>
              )}
            </Button>
          </div>

          {/* Prediction Results */}
          <div className="space-y-6">
            {prediction && (
              <>
                <Card className="border-primary/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Predicted Yield
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-4xl font-bold text-primary mb-1">
                          {prediction.predictedYield.toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">Mg/ha (Metric Tons per Hectare)</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Confidence Interval: {prediction.confidenceInterval.lower.toFixed(2)} - {prediction.confidenceInterval.upper.toFixed(2)} Mg/ha
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={prediction.confidence > 75 ? 'default' : prediction.confidence > 50 ? 'secondary' : 'outline'}>
                          {prediction.confidence}% Confidence
                        </Badge>
                        <Badge variant="outline">
                          R² = {prediction.modelAccuracy.r2}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Season Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-1">{prediction.seasonProgress.currentStage}</div>
                      <div className="text-xs text-muted-foreground">
                        {prediction.seasonProgress.daysSincePlanting} days since planting
                      </div>
                      {prediction.seasonProgress.daysToHarvest > 0 && (
                        <div className="text-xs text-muted-foreground">
                          ~{prediction.seasonProgress.daysToHarvest} days to harvest
                        </div>
                      )}
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${prediction.seasonProgress.progressPercentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-center text-muted-foreground">
                      {prediction.seasonProgress.progressPercentage}% complete
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Feature Importance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {prediction.featureImportance.slice(0, 5).map((feature, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{feature.feature}</span>
                            <span className="text-muted-foreground">{feature.contribution.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${feature.contribution}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {prediction.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {prediction.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {prediction.riskFactors.length > 0 && (
                  <Card className="border-warning/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-warning">
                        <AlertTriangle className="w-5 h-5" />
                        Risk Factors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {prediction.riskFactors.map((risk, idx) => (
                          <div key={idx} className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{risk.factor}</span>
                              <Badge
                                variant={
                                  risk.severity === 'high'
                                    ? 'destructive'
                                    : risk.severity === 'medium'
                                      ? 'default'
                                      : 'secondary'
                                }
                                className="text-xs"
                              >
                                {risk.severity}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{risk.impact}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {!prediction && (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Fill in the form and click "Predict Yield" to see predictions
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default YieldPrediction;
