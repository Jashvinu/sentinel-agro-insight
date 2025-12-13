import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info,
  ChevronRight,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertItemProps {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  timestamp: string;
  category: string;
}

const AlertItem: React.FC<AlertItemProps> = ({ 
  severity, 
  title, 
  description, 
  timestamp,
  category 
}) => {
  const getSeverityIcon = () => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-warning" />;
      case 'low':
        return <AlertCircle className="w-4 h-4 text-accent" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSeverityColor = () => {
    switch (severity) {
      case 'high':
        return 'border-l-destructive bg-destructive/5';
      case 'medium':
        return 'border-l-warning bg-warning/5';
      case 'low':
        return 'border-l-accent bg-accent/5';
      default:
        return 'border-l-muted-foreground bg-muted/5';
    }
  };

  return (
    <div className={cn(
      "p-3 border-l-4 rounded-r-lg transition-all hover:shadow-sm",
      getSeverityColor()
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {getSeverityIcon()}
          <div className="flex-1 space-y-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-medium text-foreground">{title}</h4>
              <Badge variant="outline" className="text-xs">
                {category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{timestamp}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
};

export const AlertsOverview: React.FC = () => {
  const alerts: AlertItemProps[] = [
    {
      id: '1',
      severity: 'medium',
      title: 'Vegetation Health Decline Detected',
      description: 'Northern sector showing 8% decrease in vegetation health over last 7 days',
      timestamp: '2 hours ago',
      category: 'Vegetation'
    },
    {
      id: '2', 
      severity: 'low',
      title: 'Irrigation Recommendation',
      description: 'Soil moisture levels suggest irrigation needed in western zone',
      timestamp: '6 hours ago',
      category: 'Water'
    },
    {
      id: '3',
      severity: 'medium',
      title: 'Weather Alert',
      description: 'Heavy rainfall expected Monday-Tuesday, potential flooding risk',
      timestamp: '1 day ago',
      category: 'Weather'
    },
    {
      id: '4',
      severity: 'info',
      title: 'Data Update',
      description: 'New Sentinel-2 imagery available for analysis',
      timestamp: '1 day ago',
      category: 'System'
    }
  ];

  const alertCounts = {
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <span>Recent Alerts</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {alertCounts.high > 0 && (
              <Badge variant="destructive" className="text-xs">
                {alertCounts.high} High
              </Badge>
            )}
            {alertCounts.medium > 0 && (
              <Badge variant="outline" className="text-xs border-warning text-warning">
                {alertCounts.medium} Medium
              </Badge>
            )}
            {alertCounts.low > 0 && (
              <Badge variant="outline" className="text-xs border-accent text-accent">
                {alertCounts.low} Low
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} {...alert} />
          ))}
        </div>
        
        <div className="pt-3 border-t border-border/50">
          <Button variant="outline" className="w-full" size="sm">
            <span>View All Alerts</span>
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};