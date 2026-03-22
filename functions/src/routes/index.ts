/**
 * Route Aggregator for Firebase Cloud Functions
 */
import { Router } from 'express';
import healthRouter from './health';
import agriculturalIndicesRouter from './agriculturalIndices';
import observationDatesRouter from './observationDates';
import syncSatelliteDatesRouter from './syncSatelliteDates';
import diagnosticsRouter from './diagnostics';
import advancedMonitoringRouter from './advancedMonitoring';

const router = Router();

// Mount routes
router.use('/health', healthRouter);
router.use('/agricultural-indices', agriculturalIndicesRouter);
router.use('/get-observation-dates', observationDatesRouter);
router.use('/sync-satellite-dates', syncSatelliteDatesRouter);
router.use('/diagnostics', diagnosticsRouter);
router.use('/advanced-monitoring', advancedMonitoringRouter);

export default router;
