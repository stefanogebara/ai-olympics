/**
 * Market Resolver
 * Polls exchange APIs to detect resolved markets and settle bets automatically.
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { walletService } from './wallet-service.js';
import { polymarketClient } from './polymarket-client.js';
import { kalshiClient } from './kalshi-client.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('MarketResolver');

const RESOLUTION_INTERVAL = 5 * 60 * 1000; // 5 minutes
let resolverInterval: NodeJS.Timeout | null = null;

interface UnresolvedBet {
  id: string;
  user_id: string;
  market_id: string;
  market_source: 'polymarket' | 'kalshi';
  outcome: string;
  amount_cents: number;
}

/**
 * Settle paper bets (aio_user_bets) for a resolved market.
 * The DB trigger update_user_portfolio_after_resolution handles balance credit and streak tracking.
 */
async function settlePaperBets(marketId: string, source: string, winningOutcome: string): Promise<void> {
  try {
    const { data: paperBets, error } = await serviceClient
      .from('aio_user_bets')
      .select('id, user_id, outcome, amount, shares')
      .eq('market_id', marketId)
      .eq('market_source', source)
      .eq('resolved', false);

    if (error) {
      log.error('Failed to fetch paper bets for resolution', { marketId, error: String(error) });
      return;
    }

    if (!paperBets || paperBets.length === 0) {
      return;
    }

    log.info(`Settling ${paperBets.length} paper bets for market ${marketId}`);

    for (const bet of paperBets) {
      const betWon = bet.outcome.toUpperCase() === winningOutcome;
      // Paper bet payout: shares if won (each share pays $1), 0 if lost
      const payout = betWon ? bet.shares : 0;
      const profit = payout - bet.amount;

      const { error: updateError } = await serviceClient
        .from('aio_user_bets')
        .update({
          resolved: true,
          resolution: betWon ? 'win' : 'loss',
          payout,
          profit,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', bet.id);

      if (updateError) {
        log.error('Failed to settle paper bet', { betId: bet.id, error: String(updateError) });
      } else {
        log.info('Paper bet settled', {
          betId: bet.id,
          userId: bet.user_id,
          won: betWon,
          payout,
          profit,
        });
      }
    }
  } catch (error) {
    log.error('Error settling paper bets', { marketId, error: String(error) });
  }
}

async function checkResolutions(): Promise<void> {
  try {
    log.info('Checking for resolved markets...');

    // Get all unresolved bets grouped by market
    const { data: bets, error } = await serviceClient
      .from('aio_real_bets')
      .select('id, user_id, market_id, market_source, outcome, amount_cents')
      .eq('resolved', false)
      .eq('status', 'filled');

    if (error) {
      throw error;
    }

    if (!bets || bets.length === 0) {
      log.debug('No unresolved bets found');
      return;
    }

    // Group bets by market
    const marketBets = new Map<string, UnresolvedBet[]>();
    for (const bet of bets as UnresolvedBet[]) {
      const key = `${bet.market_source}:${bet.market_id}`;
      if (!marketBets.has(key)) {
        marketBets.set(key, []);
      }
      marketBets.get(key)!.push(bet);
    }

    log.info(`Checking ${marketBets.size} markets with unresolved bets`);

    for (const [key, betsForMarket] of marketBets) {
      const [source, marketId] = key.split(':');

      try {
        let isResolved = false;
        let winningOutcome: string | null = null;

        if (source === 'polymarket') {
          const market = await polymarketClient.getMarket(marketId);
          if (market && market.closed && market.archived) {
            isResolved = true;
            // Determine winning outcome from prices (winner has price ~1.0)
            try {
              const prices = JSON.parse(market.outcomePrices);
              const outcomes = JSON.parse(market.outcomes);
              const maxPriceIdx = prices.indexOf(
                prices.reduce((max: string, p: string) =>
                  parseFloat(p) > parseFloat(max) ? p : max, '0'
                )
              );
              winningOutcome = outcomes[maxPriceIdx]?.toUpperCase() || null;
            } catch {
              log.warn('Could not parse Polymarket resolution outcomes', { marketId });
            }
          }
        } else if (source === 'kalshi') {
          const market = await kalshiClient.getMarket(marketId);
          if (market.status === 'settled') {
            isResolved = true;
            winningOutcome = market.result?.toUpperCase() || null;
          }
        }

        if (isResolved && winningOutcome) {
          log.info('Market resolved', { marketId, source, winningOutcome });

          // Settle real-money bets
          for (const bet of betsForMarket) {
            const betWon = bet.outcome.toUpperCase() === winningOutcome;
            // Payout: if won, return shares * 100 cents (1 USDC per share); if lost, 0
            const payoutCents = betWon ? bet.amount_cents * 2 : 0;

            await walletService.settleBet(bet.id, payoutCents);

            log.info('Real bet settled', {
              betId: bet.id,
              userId: bet.user_id,
              won: betWon,
              payoutCents,
            });
          }

          // Settle paper bets (aio_user_bets)
          await settlePaperBets(marketId, source, winningOutcome);

          // Record resolution
          const { error: resError } = await serviceClient
            .from('aio_market_resolutions')
            .insert({
              market_id: marketId,
              market_source: source,
              winning_outcome: winningOutcome,
              resolved_at: new Date().toISOString(),
            });

          if (resError) {
            log.error('Failed to record market resolution', { marketId, error: String(resError) });
          }
        }
      } catch (marketError) {
        log.error('Error checking market resolution', {
          key,
          error: String(marketError),
        });
      }
    }

    log.info('Resolution check complete');
  } catch (error) {
    log.error('Resolution check failed', { error: String(error) });
  }
}

export function startResolver(): void {
  if (resolverInterval) {
    log.warn('Resolver already running');
    return;
  }

  log.info('Starting market resolver', { intervalMs: RESOLUTION_INTERVAL });

  // Run once immediately
  checkResolutions();

  // Then run on interval
  resolverInterval = setInterval(checkResolutions, RESOLUTION_INTERVAL);
}

export function stopResolver(): void {
  if (resolverInterval) {
    clearInterval(resolverInterval);
    resolverInterval = null;
    log.info('Market resolver stopped');
  }
}

export async function manualResolve(
  marketId: string,
  marketSource: string,
  resolution: string
): Promise<void> {
  try {
    log.info('Manual resolution triggered', { marketId, marketSource, resolution });

    const { data: bets, error } = await serviceClient
      .from('aio_real_bets')
      .select('id, user_id, outcome, amount_cents')
      .eq('market_id', marketId)
      .eq('market_source', marketSource)
      .eq('resolved', false)
      .eq('status', 'filled');

    if (error) {
      throw error;
    }

    if (!bets || bets.length === 0) {
      log.warn('No unresolved bets found for manual resolution', { marketId });
      return;
    }

    for (const bet of bets) {
      const betWon = bet.outcome.toUpperCase() === resolution.toUpperCase();
      const payoutCents = betWon ? bet.amount_cents * 2 : 0;

      await walletService.settleBet(bet.id, payoutCents);

      log.info('Bet manually settled', {
        betId: bet.id,
        won: betWon,
        payoutCents,
      });
    }

    // Also settle paper bets
    await settlePaperBets(marketId, marketSource, resolution.toUpperCase());

    const { error: resError } = await serviceClient
      .from('aio_market_resolutions')
      .insert({
        market_id: marketId,
        market_source: marketSource,
        winning_outcome: resolution.toUpperCase(),
        resolved_at: new Date().toISOString(),
        manual: true,
      });

    if (resError) {
      log.error('Failed to record manual resolution', { error: String(resError) });
    }

    log.info('Manual resolution complete', { marketId, resolution });
  } catch (error) {
    log.error('Manual resolution failed', { marketId, error: String(error) });
    throw error;
  }
}

export { checkResolutions };
