/**
 * ELO Service - Backward Compatibility Shim
 *
 * Re-exports from rating-service.ts which implements the full Glicko-2 algorithm.
 * Existing callers that import { eloService } will continue to work unchanged.
 */

export { ratingService as eloService, updateRatingsAfterCompetition } from './rating-service.js';
import { ratingService } from './rating-service.js';
export default ratingService;
