import { useEffect, useRef } from 'react';
import { buildApiUrl, getSupabaseFunctionHeaders } from '@/services/api';
import { syncAllFarmsWaterMetrics } from '@/services/waterMetricsCacheService';
import { toast } from 'sonner';

/**
 * Hook to automatically sync satellite observations when the app loads
 * Runs silently in the background and only syncs once per session
 */
export function useAutoSync() {
  const hasSyncedRef = useRef(false);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    // Only run once per session
    if (hasSyncedRef.current || isSyncingRef.current) {
      return;
    }

    // Check if we've synced today (using sessionStorage)
    const lastSyncKey = 'last_satellite_sync';
    const lastSync = sessionStorage.getItem(lastSyncKey);
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000; // 1 hour

    // Skip if synced within the last hour
    if (lastSync && parseInt(lastSync) > oneHourAgo) {
      console.log('🔄 Auto-sync: Skipped (synced recently)');
      hasSyncedRef.current = true;
      return;
    }

    // Mark as syncing
    isSyncingRef.current = true;

    // Run sync in background (don't await, let it run silently)
    const syncObservations = async () => {
      try {
        console.log('🔄 Auto-sync: Starting satellite observation sync...');
        
        const endpoint = buildApiUrl('sync-satellite-dates?months=6');
        const headers = getSupabaseFunctionHeaders();
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        });

        if (!response.ok) {
          throw new Error(`Sync failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success) {
          const summary = data.summary || {};
          const newObservations = summary.new_observations || 0;
          const farmsProcessed = data.farms_processed || 0;
          
          console.log('✅ Auto-sync: Complete', {
            farms: farmsProcessed,
            newObservations,
            inserted: summary.inserted || 0
          });
          
          // Show subtle notification if new observations were found
          if (newObservations > 0) {
            toast.success('Satellite data updated', {
              description: `${newObservations} new observations synced for ${farmsProcessed} farm${farmsProcessed > 1 ? 's' : ''}`,
              duration: 3000,
            });
          }
          
          // Update last sync time
          sessionStorage.setItem(lastSyncKey, now.toString());
        } else {
          console.warn('⚠️ Auto-sync: Response indicated failure', data);
        }
      } catch (error) {
        // Silently fail - don't interrupt user experience
        console.warn('⚠️ Auto-sync: Failed (running in background)', error);
      } finally {
        hasSyncedRef.current = true;
        isSyncingRef.current = false;
      }
    };

    // Start sync after a short delay to not block initial render
    const timeoutId = setTimeout(() => {
      syncObservations();
      
      // Also sync water metrics cache
      syncAllFarmsWaterMetrics().catch(error => {
        console.warn('Water metrics cache sync failed:', error);
      });
    }, 2000); // 2 second delay

    return () => {
      clearTimeout(timeoutId);
    };
  }, []); // Only run once on mount
}

