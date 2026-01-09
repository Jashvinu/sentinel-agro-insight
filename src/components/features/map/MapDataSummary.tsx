import React from 'react';

interface MapDataSummaryProps {
  activeLayer: {
    cloudCover?: number;
    satellite: string;
  } | null;
  selectedIndex: string;
  dataDate?: string;
}

export const MapDataSummary: React.FC<MapDataSummaryProps> = ({
  activeLayer,
  selectedIndex,
  dataDate
}) => {
  if (!activeLayer) return null;

  return (
    <div className="p-4 bg-muted/20 border-t border-border/50">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-success">
            {typeof activeLayer.cloudCover === 'number'
              ? `${activeLayer.cloudCover.toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-xs text-muted-foreground">Cloud Cover</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">
            {selectedIndex.toUpperCase()}
          </div>
          <div className="text-xs text-muted-foreground">
            {activeLayer.satellite === 'Combined' ? 'All Satellites' : activeLayer.satellite}
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-warning">
            {dataDate ? new Date(dataDate).toLocaleDateString() : '—'}
          </div>
          <div className="text-xs text-muted-foreground">Data Date</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-accent">
            Real-time
          </div>
          <div className="text-xs text-muted-foreground">Update</div>
        </div>
      </div>
    </div>
  );
};
