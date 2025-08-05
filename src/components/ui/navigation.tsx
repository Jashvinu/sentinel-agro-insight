import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  Home, 
  Map, 
  BarChart3, 
  AlertTriangle, 
  Cloud,
  Settings,
  User,
  Satellite,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  href: string;
}

const navigationItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/' },
  { id: 'field-explorer', label: 'Field Explorer', icon: Map, href: '/field-explorer' },
  { id: 'analytics', label: 'Analytics Studio', icon: BarChart3, href: '/analytics' },
  { id: 'alerts', label: 'Alert Center', icon: AlertTriangle, href: '/alerts' },
  { id: 'weather', label: 'Weather Panel', icon: Cloud, href: '/weather' },
];

interface NavigationProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  className?: string;
}

export const Navigation: React.FC<NavigationProps> = ({ 
  currentPage = 'dashboard', 
  onNavigate,
  className 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigation = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation */}
      <nav className={cn(
        "hidden lg:flex items-center justify-between bg-card/80 backdrop-blur-sm border-b border-border/50 px-6 py-4",
        className
      )}>
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-primary rounded-lg">
              <Satellite className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">FarmScope</h1>
              <p className="text-xs text-muted-foreground">Precision Agriculture</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 transition-all duration-200",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-glow" 
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleNavigation(item.id)}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <User className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="lg:hidden bg-card/95 backdrop-blur-sm border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-primary rounded-lg">
              <Satellite className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">FarmScope</h1>
              <p className="text-xs text-muted-foreground">Precision Agriculture</p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="grid grid-cols-2 gap-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "flex flex-col items-center space-y-1 p-3 h-auto",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground"
                    )}
                    onClick={() => handleNavigation(item.id)}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border/50 px-2 py-2 z-50">
        <div className="flex justify-around">
          {navigationItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                className={cn(
                  "flex flex-col items-center space-y-1 px-2 py-2 h-auto min-w-0 flex-1",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}
                onClick={() => handleNavigation(item.id)}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium truncate">{item.label.split(' ')[0]}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
};