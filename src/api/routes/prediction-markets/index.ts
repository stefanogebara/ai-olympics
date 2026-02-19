/**
 * Prediction Markets API Routes - Module entry point
 *
 * Composes all sub-routers into a single router for mounting at /api/predictions.
 * Import from this module: import predictionMarketsRouter from './routes/prediction-markets/index.js';
 */

import { Router } from 'express';
import metaMarketsRouter from './meta-markets.js';
import marketsRouter from './markets.js';
import portfoliosRouter from './portfolios.js';
import competitionsRouter from './competitions.js';
import adminRouter from './admin.js';

const router = Router();

// Meta-markets (AI competition betting)
router.use('/meta-markets', metaMarketsRouter);

// Market browsing (includes /markets, /events, /categories, /search, /stats)
router.use('/', marketsRouter);

// Portfolio management
router.use('/portfolios', portfoliosRouter);

// Competition results
router.use('/competitions', competitionsRouter);

// Admin/utility (resolve-market)
router.use('/', adminRouter);

export default router;
