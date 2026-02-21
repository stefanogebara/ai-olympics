/**
 * Market Auto-Resolver
 *
 * Safety net scheduler that resolves meta-markets still 'open' more than 25 hours
 * after their linked competition ended. Prevents markets getting stuck if the
 * competition:end event was missed (e.g., server crash during a competition).
 *
 * Runs every 30 minutes. Complements the real-time event-driven resolution in
 * MetaMarketService.registerEventListeners().
 */
import { serviceClient } from '../shared/utils/supabase.js';
import { metaMarketService } from './meta-market-service.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('MarketAutoResolver');

const STALE_THRESHOLD_HOURS = 25;
const AUTO_RESOLVE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let resolverInterval: NodeJS.Timeout | null = null;

export async function resolveStaleMarkets(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 3_600_000).toISOString();

  const { data: staleMarkets, error } = await serviceClient
    .from('aio_meta_markets')
    .select('id, competition_id, status')
    .eq('status', 'open')
    .lt('opens_at', cutoff);

  if (error) {
    log.error('Failed to query stale markets', { error: error.message });
    return;
  }
  if (!staleMarkets || staleMarkets.length === 0) return;

  log.info(`Found ${staleMarkets.length} potentially stale open meta-market(s)`);

  for (const market of staleMarkets) {
    try {
      const { data: competition, error: compError } = await serviceClient
        .from('aio_competitions')
        .select('id, status, ended_at, winner_agent_id')
        .eq('id', market.competition_id)
        .single();

      if (compError || !competition) {
        log.warn(`Could not fetch competition for market ${market.id}`, {
          competitionId: market.competition_id,
        });
        continue;
      }

      if (competition.status === 'cancelled') {
        const { error: cancelError } = await serviceClient
          .from('aio_meta_markets')
          .update({ status: 'cancelled' })
          .eq('id', market.id);
        if (cancelError) {
          log.error(`Failed to cancel market ${market.id}`, { error: cancelError.message });
        } else {
          log.info(`Cancelled market ${market.id} (competition was cancelled)`);
        }
        continue;
      }

      if (competition.status !== 'completed' || !competition.ended_at) {
        // Competition still running or hasn't ended — not stale yet
        continue;
      }

      const hoursSinceEnd =
        (Date.now() - new Date(competition.ended_at).getTime()) / 3_600_000;

      if (hoursSinceEnd < STALE_THRESHOLD_HOURS) {
        // Ended recently — give the event-driven resolution time to work
        continue;
      }

      if (!competition.winner_agent_id) {
        log.warn(`Competition ${competition.id} is completed but has no winner_agent_id — cannot auto-resolve`);
        continue;
      }

      log.warn(`Auto-resolving stale market ${market.id} for competition ${competition.id}`);
      await metaMarketService.resolveMarket(competition.id, competition.winner_agent_id);
    } catch (err) {
      log.error(`Unexpected error auto-resolving market ${market.id}`, {
        error: String(err),
      });
    }
  }
}

export function startAutoResolver(): void {
  if (resolverInterval) return; // Already running
  log.info('Starting market auto-resolver (30-minute interval)');
  // Run immediately on startup to catch anything stale from a previous crash
  resolveStaleMarkets().catch((err) =>
    log.error('Initial auto-resolve run failed', { error: String(err) })
  );
  resolverInterval = setInterval(() => {
    resolveStaleMarkets().catch((err) =>
      log.error('Auto-resolve interval run failed', { error: String(err) })
    );
  }, AUTO_RESOLVE_INTERVAL_MS);
}

export function stopAutoResolver(): void {
  if (resolverInterval) {
    clearInterval(resolverInterval);
    resolverInterval = null;
    log.info('Market auto-resolver stopped');
  }
}
