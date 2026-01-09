import React from 'react';
import { getLegendInfo, getLegendColors, getLegendLabels } from './mapUtils';

interface MapLegendProps {
  selectedIndex: string;
}

export const MapLegend: React.FC<MapLegendProps> = ({ selectedIndex }) => {
  return (
    <div className="p-4 bg-muted/10 border-t border-border/30">
      <div className="flex flex-col items-center space-y-3">
        <div className="text-sm font-medium text-muted-foreground">
          {getLegendInfo(selectedIndex)}
        </div>
        <div className="flex items-center space-x-2">
          {getLegendColors(selectedIndex).map((color, index) => (
            <div key={index} className="flex flex-col items-center space-y-1">
              <div
                className="w-6 h-4 rounded border border-border"
                style={{ backgroundColor: color }}
              ></div>
              <span className="text-xs text-muted-foreground">
                {getLegendLabels(selectedIndex)[index]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
