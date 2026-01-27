import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import Dashboard from "./pages/Dashboard";
import YieldPrediction from "./pages/YieldPrediction";
import DrawPolygon from "./pages/DrawPolygon";
import NotFound from "./pages/NotFound";
import { AdvancedMonitoring } from "./pages/AdvancedMonitoring";
import FieldDiagnostics from "./pages/FieldDiagnostics";
import { useAutoSync } from "@/hooks/useAutoSync";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Create a new QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Loading component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="space-y-4 w-full max-w-md">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  </div>
);

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              An unexpected error occurred. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component to handle auto-sync on app load
const AppContent = () => {
  useAutoSync(); // Automatically sync satellite observations on load

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* MVP Mode: Login/Signup routes redirect to dashboard */}
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/signup" element={<Navigate to="/dashboard" replace />} />

          {/* Protected routes - MVP mode bypasses auth */}
          <Route
            path="/"
            element={
              <ProtectedRoute requireFarm={true}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireFarm={true}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/yield-prediction"
            element={
              <ProtectedRoute requireFarm={true}>
                <YieldPrediction />
              </ProtectedRoute>
            }
          />
          <Route
            path="/advanced-monitoring"
            element={
              <ProtectedRoute requireFarm={true}>
                <AdvancedMonitoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/field-diagnostics"
            element={
              <ProtectedRoute requireFarm={true}>
                <FieldDiagnostics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/draw-polygon"
            element={
              <ProtectedRoute>
                <DrawPolygon />
              </ProtectedRoute>
            }
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
