import React from 'react';

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string; // e.g. "w-full h-full"
}

export const Sparkline: React.FC<SparklineProps> = ({ 
  data, 
  color = '#3b82f6', 
  width = 100, 
  height = 30,
  strokeWidth = 2,
  className = ""
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; 

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height; // Invert Y axis
    return `${x},${y}`;
  }).join(' ');

  // Determine an appropriate fill color opacity using the stroke color (requires hex)
  const hexFill = /^#[0-9A-Fa-f]{6}$/i.test(color) ? `${color}20` : 'transparent';
  
  // Fill polygon includes bottom corners
  const fillPoints = `${0},${height} ${points} ${width},${height}`;

  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${width} ${height}`} 
      preserveAspectRatio="none"
      className={`overflow-visible ${className}`}
    >
      <polygon 
        points={fillPoints} 
        fill={hexFill}
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
