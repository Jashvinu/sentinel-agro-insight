/**
 * Utility functions for map legend and index information
 */

export const getIndexUnit = (index: string): string => {
  switch (index) {
    case 'nitrogen':
    case 'phosphorus':
    case 'potassium':
      return 'kg/ha';
    case 'salinity':
      return 'dS/m';
    case 'ph':
      return 'pH';
    case 'moisture':
    case 'sar_moisture':
      return '%';
    case 'carbon':
      return 't/ha';
    case 'ndvi':
    case 'evi':
    case 'savi':
    case 'msavi':
    case 'ndwi':
      return 'Index (0-1)';
    default:
      return '';
  }
};

export const getLegendInfo = (index: string): string => {
  switch (index) {
    case 'nitrogen':
      return 'Nitrogen Content (kg N/ha)';
    case 'phosphorus':
      return 'Phosphorus Content (kg P₂O₅/ha)';
    case 'potassium':
      return 'Potassium Content (kg K₂O/ha)';
    case 'salinity':
      return 'Electrical Conductivity (dS/m)';
    case 'ph':
      return 'Soil pH';
    case 'moisture':
    case 'sar_moisture':
      return 'Volumetric Moisture (%)';
    case 'carbon':
      return 'Organic Carbon (t/ha)';
    case 'ndvi':
      return 'Normalized Difference Vegetation Index';
    case 'evi':
      return 'Enhanced Vegetation Index';
    case 'savi':
      return 'Soil Adjusted Vegetation Index';
    case 'msavi':
      return 'Modified Soil Adjusted Vegetation Index';
    case 'ndwi':
      return 'Normalized Difference Water Index';
    default:
      return index.toUpperCase();
  }
};

export const getLegendColors = (index: string): string[] => {
  switch (index) {
    case 'nitrogen':
    case 'phosphorus':
    case 'potassium':
      return ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'];
    case 'salinity':
      return ['#22c55e', '#eab308', '#f97316', '#ef4444', '#7f1d1d'];
    case 'ph':
      return ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
    case 'moisture':
    case 'sar_moisture':
      return ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e40af'];
    case 'carbon':
      return ['#92400e', '#eab308', '#f97316', '#22c55e', '#15803d'];
    case 'ndvi':
    case 'evi':
    case 'savi':
    case 'msavi':
      return ['#7f1d1d', '#dc2626', '#f97316', '#eab308', '#22c55e'];
    case 'ndwi':
      return ['#92400e', '#eab308', '#93c5fd', '#3b82f6', '#1e3a8a'];
    default:
      return ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'];
  }
};

export const getLegendLabels = (index: string): string[] => {
  switch (index) {
    case 'nitrogen':
      return ['0', '75', '150', '225', '300+'];
    case 'phosphorus':
      return ['0', '50', '100', '150', '200+'];
    case 'potassium':
      return ['0', '62', '125', '187', '250+'];
    case 'salinity':
      return ['0', '4', '8', '12', '16+'];
    case 'ph':
      return ['4.5', '5.6', '6.7', '7.8', '9.0'];
    case 'moisture':
    case 'sar_moisture':
      return ['0%', '12%', '25%', '37%', '50%+'];
    case 'carbon':
      return ['0', '12', '25', '37', '50+'];
    case 'ndvi':
    case 'evi':
    case 'savi':
    case 'msavi':
    case 'ndwi':
      return ['0.0', '0.25', '0.5', '0.75', '1.0'];
    default:
      return ['Low', '', 'Med', '', 'High'];
  }
};
