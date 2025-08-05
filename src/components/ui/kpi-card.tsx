import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-success/30 bg-gradient-to-br from-success/5 to-success/10';
      case 'warning':
        return 'border-warning/30 bg-gradient-to-br from-warning/5 to-warning/10';
      case 'destructive':
        return 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-destructive/10';
      default:
        return 'border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10';
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'success':
        return 'text-success';
      case 'warning':
        return 'text-warning';
      case 'destructive':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  };

  const getTrendColor = () => {
    if (!trend) return '';
    return trend.value > 0 ? 'text-success' : trend.value < 0 ? 'text-destructive' : 'text-muted-foreground';
  };

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 hover:shadow-atmospheric",
      getVariantStyles(),
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className={cn("flex items-center space-x-1 text-sm", getTrendColor())}>
                <span className="font-medium">
                  {trend.value > 0 ? '+' : ''}{trend.value}%
                </span>
                <span className="text-xs">{trend.label}</span>
              </div>
            )}
          </div>
          
          <div className={cn(
            "p-3 rounded-lg bg-white/50 dark:bg-black/20",
            getIconColor()
          )}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        
        {/* Ambient glow effect */}
        <div className={cn(
          "absolute -top-10 -right-10 w-20 h-20 rounded-full opacity-20 blur-xl",
          variant === 'success' && 'bg-success',
          variant === 'warning' && 'bg-warning', 
          variant === 'destructive' && 'bg-destructive',
          variant === 'default' && 'bg-primary'
        )} />
      </CardContent>
    </Card>
  );
};