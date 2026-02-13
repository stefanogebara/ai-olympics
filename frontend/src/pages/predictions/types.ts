import {
  Globe,
  Landmark,
  Trophy,
  Bitcoin,
  Cpu,
  Film,
  DollarSign,
} from 'lucide-react';
import { createElement } from 'react';

export type MarketCategory = 'all' | 'politics' | 'sports' | 'crypto' | 'ai-tech' | 'entertainment' | 'finance';

export interface CategoryInfo {
  id: MarketCategory;
  name: string;
  count: number;
  icon: React.ReactNode;
}

export interface EventMarket {
  id: string;
  question: string;
  outcomes: { id: string; name: string; probability: number; price: number }[];
  total_volume: number;
  volume_24h: number;
  probability: number;
}

export interface MarketEvent {
  eventUrl: string;
  eventTitle: string;
  source: string;
  category: string;
  image: string | null;
  totalVolume: number;
  volume24h: number;
  liquidity: number;
  closeTime: number;
  marketCount: number;
  markets: EventMarket[];
}

export const CATEGORY_CONFIG: Record<MarketCategory, { name: string; icon: React.ReactNode; color: string }> = {
  'all': { name: 'All Markets', icon: createElement(Globe, { size: 16 }), color: 'cyan' },
  'politics': { name: 'Politics', icon: createElement(Landmark, { size: 16 }), color: 'red' },
  'sports': { name: 'Sports', icon: createElement(Trophy, { size: 16 }), color: 'teal' },
  'crypto': { name: 'Crypto', icon: createElement(Bitcoin, { size: 16 }), color: 'yellow' },
  'ai-tech': { name: 'AI & Tech', icon: createElement(Cpu, { size: 16 }), color: 'green' },
  'entertainment': { name: 'Entertainment', icon: createElement(Film, { size: 16 }), color: 'pink' },
  'finance': { name: 'Finance', icon: createElement(DollarSign, { size: 16 }), color: 'emerald' },
};
