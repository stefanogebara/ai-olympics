import { describe, it, expect, vi } from 'vitest';

// Mock all external dependencies before importing
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('./polymarket-client.js', () => ({
  polymarketClient: {
    getMarkets: vi.fn().mockResolvedValue([]),
    normalizeMarket: vi.fn(),
    subscribeToMarket: vi.fn(),
  },
}));

vi.mock('./kalshi-client.js', () => ({
  kalshiClient: {
    getMarkets: vi.fn().mockResolvedValue({ markets: [] }),
    normalizeMarket: vi.fn(),
  },
}));

const { marketService } = await import('./market-service.js');

describe('MarketService - Category Detection', () => {
  const detect = (question: string, description = '') =>
    marketService.detectCategory({
      id: 'test',
      source: 'polymarket',
      question,
      description,
      category: 'other',
      outcomes: [],
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      closeTime: 0,
      status: 'open',
      url: '',
    });

  describe('ai-tech', () => {
    it('detects AI-related keywords', () => {
      expect(detect('Will Claude outperform GPT-4?')).toBe('ai-tech');
    });

    it('detects OpenAI references', () => {
      expect(detect('Will OpenAI release GPT-5 in 2026?')).toBe('ai-tech');
    });

    it('detects general AI terms', () => {
      expect(detect('Will artificial intelligence surpass human intelligence?')).toBe('ai-tech');
    });

    it('detects LLM/chatbot terms', () => {
      expect(detect('Will LLM performance plateau?')).toBe('ai-tech');
    });

    it('detects self-driving/robotics', () => {
      expect(detect('Will self-driving cars be legal in all states?')).toBe('ai-tech');
    });
  });

  describe('politics', () => {
    it('detects election markets', () => {
      expect(detect('Who will win the 2028 presidential election?')).toBe('politics');
    });

    it('detects Trump/Biden references', () => {
      expect(detect('Will Trump run for office again?')).toBe('politics');
    });

    it('detects congressional references', () => {
      expect(detect('Will Congress pass the new spending bill?')).toBe('politics');
    });

    it('detects government/policy', () => {
      expect(detect('Will the government implement new sanctions?')).toBe('politics');
    });
  });

  describe('sports', () => {
    it('detects NFL references', () => {
      expect(detect('Who will win the Super Bowl?')).toBe('sports');
    });

    it('detects NBA references', () => {
      expect(detect('Will the NBA playoffs have higher ratings?')).toBe('sports');
    });

    it('detects general sports terms', () => {
      expect(detect('Who will win Wimbledon this year?')).toBe('sports');
    });

    it('detects UFC/MMA', () => {
      expect(detect('Who wins the UFC title fight?')).toBe('sports');
    });
  });

  describe('crypto', () => {
    it('detects Bitcoin references', () => {
      expect(detect('Will Bitcoin reach $200k?')).toBe('crypto');
    });

    it('detects Ethereum references', () => {
      expect(detect('Will Ethereum ETH surpass $10k?')).toBe('crypto');
    });

    it('detects blockchain terms', () => {
      expect(detect('Will blockchain adoption increase in banking?')).toBe('crypto');
    });

    it('detects DeFi/NFT', () => {
      expect(detect('Will DeFi total value locked exceed $500B?')).toBe('crypto');
    });
  });

  describe('entertainment', () => {
    it('detects movie/Oscar references', () => {
      expect(detect('Which movie will win Best Picture at the Oscars?')).toBe('entertainment');
    });

    it('detects streaming references', () => {
      expect(detect('Will Netflix subscriber count exceed 300M?')).toBe('entertainment');
    });

    it('detects music references', () => {
      expect(detect('Who will win Album of the Year at the Grammy awards?')).toBe('entertainment');
    });
  });

  describe('finance', () => {
    it('detects stock market references', () => {
      expect(detect('Will the S&P 500 reach 7000?')).toBe('finance');
    });

    it('detects Fed/interest rate references', () => {
      expect(detect('Will the Fed cut interest rates again?')).toBe('finance');
    });

    it('detects recession/inflation', () => {
      expect(detect('Will inflation fall below 2%?')).toBe('finance');
    });

    it('detects specific company stocks', () => {
      expect(detect('Will Tesla stock price double?')).toBe('finance');
    });
  });

  describe('other/fallback', () => {
    it('returns "other" for unmatched markets', () => {
      expect(detect('Will it rain tomorrow in Paris?')).toBe('other');
    });

    it('returns "other" for empty question', () => {
      expect(detect('')).toBe('other');
    });
  });

  describe('priority (ai-tech checked before others)', () => {
    it('ai-tech wins over finance for tech company markets', () => {
      // "tech company" matches ai-tech, but also contains finance-like terms
      expect(detect('Will this tech company IPO succeed?')).toBe('ai-tech');
    });
  });
});
