// Route Aggregator
import { Router } from 'express';
import healthRouter from './health.js';
import agriculturalIndicesRouter from './agriculturalIndices.js';
import observationDatesRouter from './observationDates.js';
import syncSatelliteDatesRouter from './syncSatelliteDates.js';
import diagnosticsRouter from './diagnostics.js';
import advancedMonitoringRouter from './advancedMonitoring.js';

const router = Router();

// Mount routes
router.use('/health', healthRouter);
router.use('/agricultural-indices', agriculturalIndicesRouter);
router.use('/get-observation-dates', observationDatesRouter);
router.use('/sync-satellite-dates', syncSatelliteDatesRouter);
router.use('/diagnostics', diagnosticsRouter);
router.use('/advanced-monitoring', advancedMonitoringRouter);

export default router;
