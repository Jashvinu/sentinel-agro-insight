# Yield Prediction - Evergreen Farm Dummy Data

This document contains the dummy data for Evergreen Farm's corn yield prediction.

## Evergreen Farm Corn Data

### Basic Information
- **Farm ID**: evergreen-farm-id (will be auto-filled from database)
- **Crop Type**: Corn
- **Variety**: Pioneer P1234
- **Planting Date**: June 15, 2024
- **Field Area**: 12.5 hectares

### Soil Data
- **Soil pH**: 6.2 (optimal range: 6.0-7.0)
- **Organic Matter**: 3.5% (good level)
- **Nitrogen (N)**: 180 kg/ha (adequate)
- **Phosphorus (P₂O₅)**: 45 kg/ha (adequate)
- **Potassium (K₂O)**: 220 kg/ha (good level)

### Management Practices
- **Irrigation Type**: Drip irrigation (most efficient)
- **Fertilizer Application**: 185 kg/ha (optimal range: 150-200 kg/ha)
- **Seed Rate**: 23 kg/ha (optimal range: 20-25 kg/ha)
- **Row Spacing**: 75 cm (standard for corn)

### Historical Data
- **Previous Yield**: 9.2 Mg/ha (metric tons per hectare)

### Satellite Indices (Current)
- **NDVI**: 0.68 (high vegetation health)
- **EVI**: 0.42 (good enhanced vegetation)
- **SAVI**: 0.55 (good soil-adjusted vegetation)
- **NDWI**: 0.28 (adequate water index)

## Expected Prediction Results

Based on the ensemble model:
- **Predicted Yield**: ~9.5-10.5 Mg/ha
- **Confidence**: High (75-85%)
- **Model Accuracy**: R² = 0.90, RMSE = 0.86 Mg/ha

## How to Use

1. Navigate to the Yield Prediction page
2. Click "Load Evergreen Farm Data" button
3. The form will be pre-filled with all the above data
4. Click "Predict Yield" to see the prediction results

## Model Features

The yield prediction model uses an ensemble approach with 5 base models:

1. **Vegetation Index Model** (30% weight): Uses NDVI and EVI
2. **Soil Health Model** (20% weight): Uses pH, organic matter, and NPK levels
3. **Management Practices Model** (25% weight): Uses irrigation, fertilizer, and seed rate
4. **Growth Stage Model** (15% weight): Time-based model considering crop development stage
5. **Water Index Model** (10% weight): Uses NDWI for water stress assessment

The model provides:
- Predicted yield with confidence intervals
- Feature importance analysis
- Season progress tracking
- Actionable recommendations
- Risk factor identification
