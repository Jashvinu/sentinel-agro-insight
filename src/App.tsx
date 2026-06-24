import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
const PlotDesigner = lazy(() => import('./pages/PlotDesigner'));
const FarmManager = lazy(() => import('./pages/FarmManager'));
import FieldDiagnostics from "./pages/FieldDiagnostics";
import PublicPassport from "./pages/PublicPassport";
import Traceability from "./pages/Traceability";
import TraceEventNew from "./pages/TraceEventNew";
import TraceLotDetail from "./pages/TraceLotDetail";
import TraceReportDetail from "./pages/TraceReportDetail";
import NotFound from "./pages/NotFound";
import { useAutoSync } from "@/hooks/useAutoSync";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="space-y-4 w-full max-w-md">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  </div>
);

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

const AppContent = () => {
  useAutoSync();

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* MVP flow: design a plot, then analyze it */}
          {/* Home: sample farm diagnostics from the backend */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <FieldDiagnostics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/field-diagnostics"
            element={<Navigate to="/" replace />}
          />
          <Route
            path="/farms"
            element={
              <ProtectedRoute>
                <FarmManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/plot-designer"
            element={
              <ProtectedRoute>
                <PlotDesigner />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traceability"
            element={
              <ProtectedRoute>
                <Traceability />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traceability/lots/:lotId"
            element={
              <ProtectedRoute>
                <TraceLotDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traceability/events/new"
            element={
              <ProtectedRoute>
                <TraceEventNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traceability/reports/:reportId"
            element={
              <ProtectedRoute>
                <TraceReportDetail />
              </ProtectedRoute>
            }
          />
          <Route path="/qr/:token" element={<PublicPassport />} />

          {/* Legacy routes — fold back into the new flow */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/yield-prediction" element={<Navigate to="/" replace />} />
          <Route path="/advanced-monitoring" element={<Navigate to="/" replace />} />
          <Route path="/draw-polygon" element={<Navigate to="/plot-designer" replace />} />

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
