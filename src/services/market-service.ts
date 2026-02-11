/**
 * Unified Market Service
 * Aggregates data from Polymarket and Kalshi into a common format
 * Provides mock data fallback when APIs are unavailable
 *
 * Supports ALL markets across categories: politics, sports, crypto, ai-tech, entertainment, finance
 */

import { createLogger } from '../shared/utils/logger.js';
import { polymarketClient, type UnifiedMarket, type PriceUpdate } from './polymarket-client.js';
import { kalshiClient } from './kalshi-client.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';

const log = createLogger('MarketService');

// Re-export types for convenience
export type { UnifiedMarket, PriceUpdate };

// ============================================================================
// CATEGORY TYPES
// ============================================================================

export type MarketCategory = 'all' | 'politics' | 'sports' | 'crypto' | 'ai-tech' | 'entertainment' | 'finance';

export interface MarketQueryOptions {
  category?: MarketCategory;
  limit?: number;
}

export interface CategoryInfo {
  id: MarketCategory;
  name: string;
  count: number;
  icon: string;
}

// ============================================================================
// CATEGORY DETECTION PATTERNS
// ============================================================================

// Category detection patterns - order matters (more specific first)
const CATEGORY_PATTERNS: Record<Exclude<MarketCategory, 'all'>, RegExp[]> = {
  'ai-tech': [
    /\bai\b/i, /artificial intelligence/i, /\bclaude\b/i, /\bgpt[-\s]?[34o]/i,
    /\bopenai\b/i, /\banthropic\b/i, /\bgemini\b/i, /\bllm\b/i, /\bchatbot/i,
    /\bdeepseek\b/i, /\bdeep\s?mind\b/i, /machine learning/i, /neural network/i,
    /\bagi\b/i, /language model/i, /copilot/i, /\bchatgpt\b/i, /\bllama\b/i,
    /\bmistral\b/i, /\bperplexity\b/i, /self[-\s]?driving/i, /autonomous vehicle/i,
    /\brobot/i, /automation/i, /tech company/i
  ],
  'politics': [
    /\btrump\b/i, /\bbiden\b/i, /\bpresident\b/i, /\belection\b/i, /\bvote\b/i,
    /\bcongress\b/i, /\bsenate\b/i, /\bgovernor\b/i, /\bdemocrat/i, /\brepublican/i,
    /\bwhite house\b/i, /\bpolitician/i, /\blegislat/i, /\bpolicy\b/i, /\bsupreme court/i,
    /\bparty\b/i, /\bcampaign\b/i, /\bpoll\b/i, /\bimpeach/i, /\bwar\b/i, /\bsanction/i,
    /\bgovernment\b/i, /\bminister\b/i, /\bparliament/i, /\beu\b/i, /\bunited nations/i
  ],
  'sports': [
    /\bnfl\b/i, /\bnba\b/i, /\bmlb\b/i, /\bnhl\b/i, /\bsoccer\b/i, /\bfootball\b/i,
    /\bbasketball\b/i, /\bbaseball\b/i, /\bhockey\b/i, /\btennis\b/i, /\bgolf\b/i,
    /\bolympic/i, /\bworld cup\b/i, /\bchampion/i, /\bplayoff/i, /\bsuper bowl\b/i,
    /\bwimbledon\b/i, /\bufc\b/i, /\bmma\b/i, /\bboxing\b/i, /\bformula 1\b/i,
    /\bf1\b/i, /\bracing\b/i, /\bathlet/i, /\bteam\b/i, /\bplayer\b/i, /\bcoach\b/i
  ],
  'crypto': [
    /\bbitcoin\b/i, /\bbtc\b/i, /\bethereum\b/i, /\beth\b/i, /\bcrypto/i,
    /\bblockchain\b/i, /\bsolana\b/i, /\bdefi\b/i, /\bnft\b/i, /\btoken\b/i,
    /\bcoinbase\b/i, /\bbinance\b/i, /\bweb3\b/i, /\bdoge/i, /\bripple\b/i,
    /\bcardano\b/i, /\bpolkadot\b/i, /\bstablecoin/i, /\bwallet\b/i
  ],
  'entertainment': [
    /\bmovie\b/i, /\bfilm\b/i, /\boscar/i, /\bacademy award/i, /\bnetflix\b/i,
    /\bstreaming\b/i, /\btv show\b/i, /\bseries\b/i, /\bcelebrity/i, /\bactor/i,
    /\bactress/i, /\bdirector\b/i, /\bmusic\b/i, /\balbum\b/i, /\bconcert\b/i,
    /\bgrammy/i, /\bemmy/i, /\bgolden globe/i, /\bbox office\b/i, /\bhollywood\b/i,
    /\bspotify\b/i, /\byoutube/i, /\btwitch\b/i, /\bpodcast\b/i, /\binfluencer/i
  ],
  'finance': [
    /\bstock\b/i, /\bmarket\b/i, /\bs&p\s?500/i, /\bnasdaq\b/i, /\bdow\b/i,
    /\bfed\b/i, /\binterest rate/i, /\binflation\b/i, /\brecession\b/i,
    /\bipo\b/i, /\bearnings\b/i, /\brevenue\b/i, /\bprofit\b/i, /\bgdp\b/i,
    /\beconomy/i, /\btreasury\b/i, /\bbond\b/i, /\binvest/i, /\bbank\b/i,
    /\btesla\b/i, /\bapple\b/i, /\bamazon\b/i, /\bgoogle\b/i, /\bmeta\b/i, /\bnvidia\b/i
  ]
};

// Legacy: Keep for backward compatibility
const AI_SEARCH_PATTERNS = CATEGORY_PATTERNS['ai-tech'];

// ============================================================================
// MOCK MARKETS (fallback when APIs unavailable)
// Multi-category mock data for testing
// ============================================================================

const MOCK_MARKETS: UnifiedMarket[] = [
  // === AI-TECH MARKETS ===
  {
    id: 'mock-claude-benchmark',
    source: 'polymarket',
    question: 'Will Claude outperform GPT-4 on the next major AI benchmark?',
    description: 'Resolves YES if Claude scores higher than GPT-4 on the next major publicly released AI benchmark (e.g., MMLU, HumanEval, etc.)',
    category: 'ai-tech',
    outcomes: [
      { id: 'mock-claude-yes', name: 'YES', probability: 0.62, price: 62 },
      { id: 'mock-claude-no', name: 'NO', probability: 0.38, price: 38 }
    ],
    volume24h: 125000,
    totalVolume: 890000,
    liquidity: 45000,
    closeTime: Date.now() + 86400000 * 30,
    status: 'open',
    url: 'https://polymarket.com/mock/claude-benchmark'
  },
  {
    id: 'mock-gpt5-release',
    source: 'kalshi',
    question: 'Will GPT-5 be released before July 2026?',
    description: 'Resolves YES if OpenAI publicly releases GPT-5 or an equivalent next-generation model before July 1, 2026.',
    category: 'ai-tech',
    outcomes: [
      { id: 'mock-gpt5-yes', name: 'YES', probability: 0.45, price: 45 },
      { id: 'mock-gpt5-no', name: 'NO', probability: 0.55, price: 55 }
    ],
    volume24h: 89000,
    totalVolume: 1250000,
    liquidity: 78000,
    closeTime: Date.now() + 86400000 * 180,
    status: 'open',
    url: 'https://kalshi.com/mock/gpt5-release'
  },
  {
    id: 'mock-agi-2027',
    source: 'polymarket',
    question: 'Will any AI system achieve AGI by end of 2027?',
    description: 'Resolves YES if a credible AI research organization announces achieving Artificial General Intelligence by December 31, 2027.',
    category: 'ai-tech',
    outcomes: [
      { id: 'mock-agi-yes', name: 'YES', probability: 0.15, price: 15 },
      { id: 'mock-agi-no', name: 'NO', probability: 0.85, price: 85 }
    ],
    volume24h: 45000,
    totalVolume: 320000,
    liquidity: 25000,
    closeTime: Date.now() + 86400000 * 700,
    status: 'open',
    url: 'https://polymarket.com/mock/agi-2027'
  },
  {
    id: 'mock-ai-regulation',
    source: 'kalshi',
    question: 'Will the US pass comprehensive AI regulation in 2026?',
    description: 'Resolves YES if the US Congress passes and the President signs a comprehensive AI regulation bill in 2026.',
    category: 'ai-tech',
    outcomes: [
      { id: 'mock-reg-yes', name: 'YES', probability: 0.35, price: 35 },
      { id: 'mock-reg-no', name: 'NO', probability: 0.65, price: 65 }
    ],
    volume24h: 67000,
    totalVolume: 450000,
    liquidity: 38000,
    closeTime: Date.now() + 86400000 * 365,
    status: 'open',
    url: 'https://kalshi.com/mock/ai-regulation'
  },

  // === POLITICS MARKETS ===
  {
    id: 'mock-2026-senate',
    source: 'polymarket',
    question: 'Will Republicans control the Senate after 2026 midterms?',
    description: 'Resolves YES if Republicans hold 50+ Senate seats after the 2026 midterm elections.',
    category: 'politics',
    outcomes: [
      { id: 'mock-senate-yes', name: 'YES', probability: 0.52, price: 52 },
      { id: 'mock-senate-no', name: 'NO', probability: 0.48, price: 48 }
    ],
    volume24h: 450000,
    totalVolume: 12500000,
    liquidity: 890000,
    closeTime: Date.now() + 86400000 * 310,
    status: 'open',
    url: 'https://polymarket.com/mock/2026-senate'
  },
  {
    id: 'mock-fed-rate-cut',
    source: 'kalshi',
    question: 'Will the Fed cut interest rates by March 2026?',
    description: 'Resolves YES if the Federal Reserve announces a rate cut at any FOMC meeting before April 1, 2026.',
    category: 'politics',
    outcomes: [
      { id: 'mock-fed-yes', name: 'YES', probability: 0.68, price: 68 },
      { id: 'mock-fed-no', name: 'NO', probability: 0.32, price: 32 }
    ],
    volume24h: 320000,
    totalVolume: 4500000,
    liquidity: 560000,
    closeTime: Date.now() + 86400000 * 60,
    status: 'open',
    url: 'https://kalshi.com/mock/fed-rate-cut'
  },
  {
    id: 'mock-ukraine-ceasefire',
    source: 'polymarket',
    question: 'Will there be a Ukraine-Russia ceasefire by end of 2026?',
    description: 'Resolves YES if both Ukraine and Russia agree to a formal ceasefire lasting at least 30 days before December 31, 2026.',
    category: 'politics',
    outcomes: [
      { id: 'mock-ceasefire-yes', name: 'YES', probability: 0.35, price: 35 },
      { id: 'mock-ceasefire-no', name: 'NO', probability: 0.65, price: 65 }
    ],
    volume24h: 180000,
    totalVolume: 8900000,
    liquidity: 420000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://polymarket.com/mock/ukraine-ceasefire'
  },

  // === SPORTS MARKETS ===
  {
    id: 'mock-super-bowl-2027',
    source: 'polymarket',
    question: 'Will the Kansas City Chiefs win Super Bowl 2027?',
    description: 'Resolves YES if the Kansas City Chiefs win Super Bowl LXI (February 2027).',
    category: 'sports',
    outcomes: [
      { id: 'mock-chiefs-yes', name: 'YES', probability: 0.18, price: 18 },
      { id: 'mock-chiefs-no', name: 'NO', probability: 0.82, price: 82 }
    ],
    volume24h: 890000,
    totalVolume: 15600000,
    liquidity: 1200000,
    closeTime: Date.now() + 86400000 * 365,
    status: 'open',
    url: 'https://polymarket.com/mock/super-bowl-chiefs'
  },
  {
    id: 'mock-nba-finals',
    source: 'kalshi',
    question: 'Will the Lakers make the 2026 NBA Finals?',
    description: 'Resolves YES if the Los Angeles Lakers advance to the NBA Finals in 2026.',
    category: 'sports',
    outcomes: [
      { id: 'mock-lakers-yes', name: 'YES', probability: 0.22, price: 22 },
      { id: 'mock-lakers-no', name: 'NO', probability: 0.78, price: 78 }
    ],
    volume24h: 560000,
    totalVolume: 8900000,
    liquidity: 780000,
    closeTime: Date.now() + 86400000 * 180,
    status: 'open',
    url: 'https://kalshi.com/mock/nba-lakers'
  },
  {
    id: 'mock-world-cup-usa',
    source: 'polymarket',
    question: 'Will USA advance past World Cup 2026 group stage?',
    description: 'Resolves YES if the USA national team advances to the knockout round of FIFA World Cup 2026.',
    category: 'sports',
    outcomes: [
      { id: 'mock-usa-yes', name: 'YES', probability: 0.75, price: 75 },
      { id: 'mock-usa-no', name: 'NO', probability: 0.25, price: 25 }
    ],
    volume24h: 340000,
    totalVolume: 5600000,
    liquidity: 450000,
    closeTime: Date.now() + 86400000 * 150,
    status: 'open',
    url: 'https://polymarket.com/mock/world-cup-usa'
  },

  // === CRYPTO MARKETS ===
  {
    id: 'mock-btc-100k',
    source: 'polymarket',
    question: 'Will Bitcoin hit $100,000 in 2026?',
    description: 'Resolves YES if BTC/USD trades at or above $100,000 on any major exchange in 2026.',
    category: 'crypto',
    outcomes: [
      { id: 'mock-btc-yes', name: 'YES', probability: 0.58, price: 58 },
      { id: 'mock-btc-no', name: 'NO', probability: 0.42, price: 42 }
    ],
    volume24h: 980000,
    totalVolume: 28000000,
    liquidity: 2100000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://polymarket.com/mock/btc-100k'
  },
  {
    id: 'mock-eth-merge-success',
    source: 'kalshi',
    question: 'Will Ethereum maintain 99%+ uptime through 2026?',
    description: 'Resolves YES if Ethereum mainnet experiences no outages longer than 1 hour in 2026.',
    category: 'crypto',
    outcomes: [
      { id: 'mock-eth-yes', name: 'YES', probability: 0.92, price: 92 },
      { id: 'mock-eth-no', name: 'NO', probability: 0.08, price: 8 }
    ],
    volume24h: 120000,
    totalVolume: 3400000,
    liquidity: 340000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://kalshi.com/mock/eth-uptime'
  },
  {
    id: 'mock-solana-defi',
    source: 'polymarket',
    question: 'Will Solana TVL exceed $50B by end of 2026?',
    description: 'Resolves YES if Solana total value locked in DeFi protocols exceeds $50 billion by December 31, 2026.',
    category: 'crypto',
    outcomes: [
      { id: 'mock-sol-yes', name: 'YES', probability: 0.35, price: 35 },
      { id: 'mock-sol-no', name: 'NO', probability: 0.65, price: 65 }
    ],
    volume24h: 210000,
    totalVolume: 4500000,
    liquidity: 380000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://polymarket.com/mock/solana-tvl'
  },

  // === ENTERTAINMENT MARKETS ===
  {
    id: 'mock-oscar-best-picture',
    source: 'polymarket',
    question: 'Will a streaming-first film win Best Picture at 2027 Oscars?',
    description: 'Resolves YES if a film that premiered on a streaming service wins Best Picture at the 2027 Academy Awards.',
    category: 'entertainment',
    outcomes: [
      { id: 'mock-oscar-yes', name: 'YES', probability: 0.42, price: 42 },
      { id: 'mock-oscar-no', name: 'NO', probability: 0.58, price: 58 }
    ],
    volume24h: 89000,
    totalVolume: 1200000,
    liquidity: 120000,
    closeTime: Date.now() + 86400000 * 400,
    status: 'open',
    url: 'https://polymarket.com/mock/oscar-streaming'
  },
  {
    id: 'mock-taylor-tour',
    source: 'kalshi',
    question: 'Will Taylor Swift announce a new world tour in 2026?',
    description: 'Resolves YES if Taylor Swift officially announces a new stadium tour for 2026 or 2027.',
    category: 'entertainment',
    outcomes: [
      { id: 'mock-taylor-yes', name: 'YES', probability: 0.65, price: 65 },
      { id: 'mock-taylor-no', name: 'NO', probability: 0.35, price: 35 }
    ],
    volume24h: 156000,
    totalVolume: 2300000,
    liquidity: 210000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://kalshi.com/mock/taylor-tour'
  },
  {
    id: 'mock-netflix-subscribers',
    source: 'polymarket',
    question: 'Will Netflix reach 300M global subscribers by Q4 2026?',
    description: 'Resolves YES if Netflix reports 300 million or more paid subscribers in their Q4 2026 earnings.',
    category: 'entertainment',
    outcomes: [
      { id: 'mock-netflix-yes', name: 'YES', probability: 0.48, price: 48 },
      { id: 'mock-netflix-no', name: 'NO', probability: 0.52, price: 52 }
    ],
    volume24h: 78000,
    totalVolume: 980000,
    liquidity: 95000,
    closeTime: Date.now() + 86400000 * 350,
    status: 'open',
    url: 'https://polymarket.com/mock/netflix-subs'
  },

  // === FINANCE MARKETS ===
  {
    id: 'mock-sp500-6000',
    source: 'kalshi',
    question: 'Will S&P 500 close above 6000 in 2026?',
    description: 'Resolves YES if the S&P 500 index closes at or above 6000 on any trading day in 2026.',
    category: 'finance',
    outcomes: [
      { id: 'mock-sp-yes', name: 'YES', probability: 0.72, price: 72 },
      { id: 'mock-sp-no', name: 'NO', probability: 0.28, price: 28 }
    ],
    volume24h: 560000,
    totalVolume: 18000000,
    liquidity: 1800000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://kalshi.com/mock/sp500-6000'
  },
  {
    id: 'mock-tesla-stock',
    source: 'polymarket',
    question: 'Will Tesla stock hit $400 before 2027?',
    description: 'Resolves YES if TSLA trades at or above $400 per share on any major exchange before January 1, 2027.',
    category: 'finance',
    outcomes: [
      { id: 'mock-tsla-yes', name: 'YES', probability: 0.38, price: 38 },
      { id: 'mock-tsla-no', name: 'NO', probability: 0.62, price: 62 }
    ],
    volume24h: 340000,
    totalVolume: 8900000,
    liquidity: 780000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://polymarket.com/mock/tesla-400'
  },
  {
    id: 'mock-nvidia-earnings',
    source: 'kalshi',
    question: 'Will NVIDIA beat Q1 2026 earnings expectations?',
    description: 'Resolves YES if NVIDIA reports Q1 2026 EPS above Wall Street consensus estimate.',
    category: 'finance',
    outcomes: [
      { id: 'mock-nvda-yes', name: 'YES', probability: 0.78, price: 78 },
      { id: 'mock-nvda-no', name: 'NO', probability: 0.22, price: 22 }
    ],
    volume24h: 420000,
    totalVolume: 5600000,
    liquidity: 520000,
    closeTime: Date.now() + 86400000 * 90,
    status: 'open',
    url: 'https://kalshi.com/mock/nvidia-earnings'
  },
  {
    id: 'mock-recession-2026',
    source: 'polymarket',
    question: 'Will the US enter a recession in 2026?',
    description: 'Resolves YES if NBER officially declares a US recession beginning in 2026, or if GDP contracts for 2 consecutive quarters.',
    category: 'finance',
    outcomes: [
      { id: 'mock-recession-yes', name: 'YES', probability: 0.25, price: 25 },
      { id: 'mock-recession-no', name: 'NO', probability: 0.75, price: 75 }
    ],
    volume24h: 290000,
    totalVolume: 12000000,
    liquidity: 980000,
    closeTime: Date.now() + 86400000 * 330,
    status: 'open',
    url: 'https://polymarket.com/mock/recession-2026'
  }
];

// ============================================================================
// MARKET SERVICE
// ============================================================================

export class MarketService {
  private priceUpdateCallbacks: Set<(update: PriceUpdate) => void> = new Set();
  private wsConnected = false;

  /**
   * Get markets with optional category filtering
   * This is the main method for fetching markets - replaces the old AI-only approach
   */
  async getMarkets(options: MarketQueryOptions = {}): Promise<UnifiedMarket[]> {
    const { category = 'all', limit = 50 } = options;
    const allMarkets: UnifiedMarket[] = [];

    // Fetch from Polymarket
    try {
      const polymarkets = await polymarketClient.getMarkets({ closed: false, limit: 200 });
      const normalizedPoly = polymarkets.map(m => {
        const normalized = polymarketClient.normalizeMarket(m);
        // Assign category if not already set
        if (!normalized.category || normalized.category === 'other' || normalized.category === 'general') {
          normalized.category = this.detectCategory(normalized);
        }
        return normalized;
      });
      allMarkets.push(...normalizedPoly);
      log.info(`Fetched ${normalizedPoly.length} markets from Polymarket`);
    } catch (error) {
      log.error('Failed to fetch Polymarket markets', { error: String(error) });
    }

    // Fetch from Kalshi (public API, no auth needed for reads)
    try {
      const { markets: kalshiMarkets } = await kalshiClient.getMarkets({ status: 'open', limit: 100 });
      const normalizedKalshi = kalshiMarkets
        .map(m => {
          const normalized = kalshiClient.normalizeMarket(m);
          if (!normalized.category || normalized.category === 'other' || normalized.category === 'general') {
            normalized.category = this.detectCategory(normalized);
          }
          return normalized;
        })
        .filter(m => m.totalVolume > 0 || m.liquidity > 0); // Filter out zero-activity parlays
      allMarkets.push(...normalizedKalshi);
      log.info(`Fetched ${normalizedKalshi.length} markets from Kalshi (filtered)`);
    } catch (error) {
      log.error('Failed to fetch Kalshi markets', { error: String(error) });
    }

    log.info(`Total real markets fetched: ${allMarkets.length}`);

    // Filter by category if specified
    let filteredMarkets = allMarkets;
    if (category !== 'all') {
      filteredMarkets = allMarkets.filter(m => m.category === category);
    }

    // Sort by volume and liquidity
    filteredMarkets.sort((a, b) => {
      const scoreA = a.volume24h + a.liquidity;
      const scoreB = b.volume24h + b.liquidity;
      return scoreB - scoreA;
    });

    return filteredMarkets.slice(0, limit);
  }

  /**
   * Get AI-related markets from all sources
   * @deprecated Use getMarkets({ category: 'ai-tech' }) instead
   */
  async getAIMarkets(limit: number = 20): Promise<UnifiedMarket[]> {
    return this.getMarkets({ category: 'ai-tech', limit });
  }

  /**
   * Get all markets (not just AI-related)
   * @deprecated Use getMarkets({ category: 'all' }) instead
   */
  async getAllMarkets(limit: number = 50): Promise<UnifiedMarket[]> {
    return this.getMarkets({ category: 'all', limit });
  }

  /**
   * Get available categories with counts
   */
  async getCategories(): Promise<CategoryInfo[]> {
    // Fetch all markets to count by category
    const allMarkets = await this.getMarkets({ category: 'all', limit: 500 });

    const categoryCounts = new Map<MarketCategory, number>();
    for (const market of allMarkets) {
      const cat = (market.category || 'other') as MarketCategory;
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    const categoryInfo: CategoryInfo[] = [
      { id: 'all', name: 'All Markets', count: allMarkets.length, icon: '🌐' },
      { id: 'politics', name: 'Politics', count: categoryCounts.get('politics') || 0, icon: '🏛️' },
      { id: 'sports', name: 'Sports', count: categoryCounts.get('sports') || 0, icon: '⚽' },
      { id: 'crypto', name: 'Crypto', count: categoryCounts.get('crypto') || 0, icon: '₿' },
      { id: 'ai-tech', name: 'AI & Tech', count: categoryCounts.get('ai-tech') || 0, icon: '🤖' },
      { id: 'entertainment', name: 'Entertainment', count: categoryCounts.get('entertainment') || 0, icon: '🎬' },
      { id: 'finance', name: 'Finance', count: categoryCounts.get('finance') || 0, icon: '📈' },
    ];

    return categoryInfo.filter(c => c.id === 'all' || c.count > 0);
  }

  /**
   * Detect category for a market based on text content
   */
  detectCategory(market: UnifiedMarket): string {
    const text = `${market.question} ${market.description || ''} ${market.category || ''}`;

    // Check each category's patterns
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(text))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Search markets across all sources
   */
  async searchMarkets(term: string, limit: number = 20): Promise<UnifiedMarket[]> {
    const results: UnifiedMarket[] = [];

    try {
      const polyResults = await polymarketClient.searchMarkets(term, limit);
      results.push(...polyResults.map(m => polymarketClient.normalizeMarket(m)));
    } catch (error) {
      log.error('Polymarket search failed', { error: String(error) });
    }

    try {
      const kalshiResults = await kalshiClient.searchMarkets(term, limit);
      results.push(...kalshiResults.map(m => kalshiClient.normalizeMarket(m)));
    } catch (error) {
      log.error('Kalshi search failed', { error: String(error) });
    }

    return results.slice(0, limit);
  }

  /**
   * Get a single market by ID
   */
  async getMarket(id: string): Promise<UnifiedMarket | null> {
    // Try cached DB first (fastest, works with our internal numeric IDs)
    try {
      const { data: row } = await supabase
        .from('aio_markets')
        .select('*')
        .eq('id', id)
        .single();

      if (row) {
        return {
          id: row.id,
          source: row.source,
          question: row.question,
          description: row.description || undefined,
          category: row.category || 'other',
          outcomes: row.outcomes || [],
          volume24h: parseFloat(row.volume_24h) || 0,
          totalVolume: parseFloat(row.total_volume) || 0,
          liquidity: parseFloat(row.liquidity) || 0,
          closeTime: row.close_time ? Number(row.close_time) : 0,
          status: row.status || 'open',
          url: row.url,
          image: row.image,
        };
      }
    } catch {
      // Not found in DB cache
    }

    // Try Polymarket API
    try {
      const market = await polymarketClient.getMarket(id);
      if (market) {
        return polymarketClient.normalizeMarket(market);
      }
    } catch {
      // Not found in Polymarket
    }

    // Try Kalshi API
    try {
      const market = await kalshiClient.getMarket(id);
      return kalshiClient.normalizeMarket(market);
    } catch {
      // Not found in Kalshi
    }

    return null;
  }

  /**
   * Get mock markets (for dev/testing only via /api/predictions/mock-markets or source=mock)
   * Returns stable data without random price jitter
   */
  getMockMarkets(): UnifiedMarket[] {
    return MOCK_MARKETS.map(market => ({
      ...market,
      isMock: true,
    })) as (UnifiedMarket & { isMock: boolean })[];
  }

  /**
   * Connect to WebSocket for real-time price updates
   */
  connectToLiveUpdates(callback: (update: PriceUpdate) => void): void {
    this.priceUpdateCallbacks.add(callback);

    if (!this.wsConnected) {
      polymarketClient.connectWebSocket((update) => {
        this.priceUpdateCallbacks.forEach(cb => cb(update));
      });
      this.wsConnected = true;
      log.info('Connected to live price updates');
    }
  }

  /**
   * Disconnect from live updates
   */
  disconnectFromLiveUpdates(callback: (update: PriceUpdate) => void): void {
    this.priceUpdateCallbacks.delete(callback);

    if (this.priceUpdateCallbacks.size === 0 && this.wsConnected) {
      polymarketClient.disconnectWebSocket();
      this.wsConnected = false;
      log.info('Disconnected from live price updates');
    }
  }

  /**
   * Subscribe to specific market updates
   */
  subscribeToMarket(marketId: string): void {
    // For now, only Polymarket supports WebSocket subscriptions
    polymarketClient.subscribeToMarket(marketId);
  }

  /**
   * Check if a market is AI-related
   * @deprecated Use detectCategory(market) === 'ai-tech' instead
   */
  private isAIRelated(market: UnifiedMarket): boolean {
    return this.detectCategory(market) === 'ai-tech';
  }
}

// Export singleton instance
export const marketService = new MarketService();
export default marketService;
