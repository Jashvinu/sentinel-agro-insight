# 🌱 Agricultural Indices & Soil Health Monitoring System

## Overview

This system provides comprehensive agricultural parameter estimation using Sentinel-2 satellite imagery through advanced spectral indices and machine learning algorithms. It covers NPK nutrients, soil salinity, pH, moisture content, and organic carbon with real-time monitoring and visualization.

## 🧮 Available Agricultural Indices

### 1. NPK Nutrient Indices

#### Nitrogen (N) - kg N/ha
- **Primary Formula**: `NDVI = (B8 - B4) / (B8 + B4)`
- **Conversion**: `N = 259.4 × NDVI - 58.6 (R²=0.90)`
- **Alternative**: `N = 300 × (NDVI - 0.3) / 0.55`
- **Late Season**: `NDRE = (B6 - B5) / (B6 + B5)`
- **Late Season Conversion**: `N = 45.2 × NDRE + 125.8 (R²=0.91)`
- **Accuracy**: R² = 0.85-0.95
- **Range**: 0-300 kg N/ha
- **Status Levels**: Deficient (0-100), Adequate (100-200), Optimal (200-300)

#### Phosphorus (P₂O₅) - kg P₂O₅/ha
- **Primary Formula**: `EVI = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)`
- **Conversion**: `P₂O₅ = 180 × EVI - 25`
- **Alternative**: `P₂O₅ = 220 × NDRE + 35`
- **Accuracy**: R² = 0.70-0.85
- **Range**: 0-200 kg P₂O₅/ha
- **Status Levels**: Deficient (0-50), Adequate (50-100), Optimal (100-200)

#### Potassium (K₂O) - kg K₂O/ha
- **Primary Formula**: `SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5`
- **Conversion**: `K₂O = 250 × SAVI - 40`
- **Alternative**: `K₂O = 180 × NDMI + 60`
- **Accuracy**: R² = 0.70-0.85
- **Range**: 0-300 kg K₂O/ha
- **Status Levels**: Deficient (0-100), Adequate (100-200), Optimal (200-300)

### 2. Salinity Indices

#### Soil Salinity - dS/m (ECe)
- **Primary Formula**: `SI = B2 × B4`
- **NDSI**: `NDSI = (B4 - B8) / (B4 + B8)`
- **Conversion**: `ECe = 0.0045 × SI + 1.2`
- **Advanced**: `ECe = 2.1×SI + 0.8×NDSI - 0.6×BI + 3.2`
- **TDS**: `TDS = EC × 800 (for EC < 5 dS/m)`
- **Salt Content**: `Salt Content (%) = ECe × 0.064 / 100`
- **Accuracy**: R² = 0.70-0.85
- **Range**: 0-25 dS/m
- **Status Levels**: Normal (0-2), Moderate (2-8), High (8-16), Critical (16-25)

### 3. pH Indices

#### Soil pH - pH units
- **Simple Model**: `pH = 0.023×B2 - 0.015×B11 + 7.2 (±0.35)`
- **Advanced**: `pH = 5.8 + 0.12×BI - 0.08×SI₂ + 0.05×B8`
- **Brightness Index**: `BI = √(B4² + B8²)`
- **Salinity Index 2**: `SI₂ = B3² + B4²`
- **Accuracy**: R² = 0.70-0.87
- **Range**: 4.0-9.0 pH units
- **Status Levels**: Acidic (4.0-6.0), Neutral (6.0-7.5), Alkaline (7.5-9.0)

### 4. Moisture Indices

#### Soil Moisture - % (volumetric)
- **Primary Formula**: `NDMI = (B8 - B11) / (B8 + B11)`
- **Conversion**: `Volumetric Moisture (%) = 45.2 × NDMI - 8.7`
- **NDWI**: `NDWI = (B3 - B8) / (B3 + B8)`
- **Water Stress**: `NMDI = (B8 - (B11 - B12)) / (B8 + (B11 - B12))`
- **Accuracy**: R² = 0.65-0.80
- **Range**: 5-45% volumetric
- **Status Levels**: Dry (5-15%), Moderate (15-25%), Moist (25-35%), Wet (35-45%)

### 5. Carbon Indices

#### Soil Organic Carbon - % (SOC)
- **Simple**: `SOC (%) = 12.5 × NDVI - 3.2 (R²=0.79)`
- **Enhanced**: `SOC (%) = 8.5 × EVI + 2.1 × SAVI - 1.8`
- **Multi-index**: `SOC (%) = 15×NDVI + 8×EVI + 5×OSAVI - 7.5`
- **Carbon Stock**: `SOC (Mg/ha) = 85 × EVI - 15 (0-30cm depth)`
- **Accuracy**: R² = 0.75-0.90
- **Range**: 0.5-15% by weight
- **Status Levels**: Low (0.5-2.0%), Medium (2.0-5.0%), High (5.0-10.0%), Very High (10.0-15.0%)

### 6. Vegetation Indices

#### NDVI (Normalized Difference Vegetation Index)
- **Formula**: `NDVI = (B8 - B4) / (B8 + B4)`
- **Range**: 0-1
- **Status Levels**: Low (0-0.3), Medium (0.3-0.6), High (0.6-1.0)
- **Accuracy**: R² = 0.85-0.95

#### EVI (Enhanced Vegetation Index)
- **Formula**: `EVI = 2.5 × (B8 - B4) / (B8 + 6×B4 - 7.5×B2 + 1)`
- **Range**: 0-1
- **Status Levels**: Low (0-0.3), Medium (0.3-0.6), High (0.6-1.0)
- **Accuracy**: R² = 0.80-0.90

#### SAVI (Soil Adjusted Vegetation Index)
- **Formula**: `SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) × 1.5`
- **Range**: 0-1
- **Status Levels**: Low (0-0.3), Medium (0.3-0.6), High (0.6-1.0)
- **Accuracy**: R² = 0.80-0.90

#### MSAVI (Modified Soil Adjusted Vegetation Index)
- **Formula**: `MSAVI = (2×B8 + 1 - √((2×B8 + 1)² - 8×(B8 - B4))) / 2`
- **Range**: 0-1
- **Status Levels**: Low (0-0.3), Medium (0.3-0.6), High (0.6-1.0)
- **Accuracy**: R² = 0.80-0.90

### 7. Water Indices

#### NDWI (Normalized Difference Water Index)
- **Formula**: `NDWI = (B3 - B8) / (B3 + B8)`
- **Range**: -1 to 1
- **Status Levels**: Dry (-1 to 0), Moist (0-0.2), Wet (0.2-0.5), Water (0.5-1)
- **Accuracy**: R² = 0.70-0.85

## 🎯 Unit Conversions

### Standard Agricultural Conversions
- **ppm to kg/ha**: `ppm × 2.24` (for 0-20cm depth)
- **% to ppm**: `% × 10,000`
- **mg/kg = ppm** (same unit)
- **ECe conversions**: `dS/m = mS/cm = mmhos/cm`
- **SOC (%) to g/kg**: multiply by 10

### Depth-Based Conversions
- **0-15cm**: multiply by 1.68
- **0-20cm**: multiply by 2.24
- **0-30cm**: multiply by 3.36
- **0-100cm**: multiply by 11.2

## ⚠️ Accuracy & Limitations

### Expected Performance (R² values)
- **Nitrogen**: 0.85-0.95 (best performance)
- **Salinity**: 0.70-0.85 (good in arid regions)
- **pH**: 0.70-0.87 (moderate accuracy)
- **Moisture**: 0.65-0.80 (variable by soil type)
- **Carbon**: 0.75-0.90 (good with multi-index)

### Critical Requirements
1. **Local calibration** with 50-100 ground truth samples per parameter
2. **Atmospheric correction** of satellite data essential
3. **Works best** with bare/sparsely vegetated soil
4. **Re-calibrate** seasonally or by crop type
5. **Cloud-free** imagery required for optical indices

## 🔧 Implementation Features

### Dashboard Components
- **Agricultural Indices Dashboard**: Comprehensive overview of all parameters
- **Field Map Integration**: Spatial visualization with selectable indices
- **Real-time Monitoring**: Live data updates from Sentinel-2
- **Formula Display**: All calculation formulas with explanations
- **Status Indicators**: Color-coded status levels for each parameter

### Data Visualization
- **Category Tabs**: Organized by NPK, Salinity, pH, Moisture, Carbon, Vegetation, Water
- **Status Cards**: Individual parameter cards with values and confidence levels
- **Range Indicators**: Visual status range bars for each parameter
- **Confidence Metrics**: Accuracy and calibration requirements
- **Trend Analysis**: Historical data and improvement tracking

### Technical Features
- **Sentinel-2 Integration**: All bands (B2, B3, B4, B5, B6, B8, B11, B12)
- **Earth Engine API**: Google Earth Engine backend processing
- **Real-time Updates**: 5-day satellite revisit cycle
- **Cloud Detection**: Automatic cloud cover assessment
- **Data Export**: CSV and JSON export capabilities

## 📊 Validation Ranges

### Parameter Validation
- **Nitrogen**: 0-300 kg N/ha
- **Phosphorus**: 0-200 kg P₂O₅/ha
- **Potassium**: 0-300 kg K₂O/ha
- **Salinity**: 0-25 dS/m ECe
- **pH**: 4.0-9.0 units
- **Moisture**: 5-45% volumetric
- **SOC**: 0.5-15% by weight

### Quality Control
- **Confidence Thresholds**: Minimum 70% confidence for display
- **Calibration Flags**: Clear indication of calibration requirements
- **Data Freshness**: Timestamp validation for all measurements
- **Range Validation**: Automatic outlier detection and flagging

## 🚀 Getting Started

### Prerequisites
- Google Earth Engine account and API access
- Sentinel-2 data access
- Ground truth soil samples for calibration
- Python/JavaScript environment for processing

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure Earth Engine credentials
4. Set up environment variables
5. Run the application: `npm run dev`

### Configuration
- Update field boundaries in `constants/index.ts`
- Configure satellite data parameters
- Set up calibration data sources
- Customize validation ranges

## 📚 Research Sources

This implementation is based on peer-reviewed research from:
- [PMC Agricultural Remote Sensing Studies](https://pmc.ncbi.nlm.nih.gov/articles/PMC9638066/)
- [Soil Science Research Papers](https://pmc.ncbi.nlm.nih.gov/articles/PMC11415428/)
- [Precision Agriculture Journals](https://link.springer.com/article/10.1007/s12524-024-01841-1)
- [Remote Sensing Publications](https://www.nature.com/articles/s41598-024-68424-5)

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation wiki

---

**Note**: These formulas provide indirect estimation of soil properties through spectral relationships. Direct NPK and pH measurement still requires ground sampling, but these indices help identify spatial patterns and guide targeted soil testing.
