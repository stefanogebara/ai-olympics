import { motion } from 'framer-motion';
import { GlassCard, Badge } from '../../components/ui';
import {
  ExternalLink,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { MarketEvent, MarketCategory } from './types';
import { CATEGORY_CONFIG } from './types';
import { extractOutcomeNames, formatVolume, formatCloseDate } from './utils';

interface EventCardProps {
  event: MarketEvent;
  index: number;
  isExpanded: boolean;
  onToggleExpand: (eventUrl: string) => void;
  onClick: (event: MarketEvent) => void;
}

const VISIBLE_COUNT = 4;

export function EventCard({ event, index, isExpanded, onToggleExpand, onClick }: EventCardProps) {
  const catConfig = CATEGORY_CONFIG[event.category as MarketCategory] || CATEGORY_CONFIG['all'];
  const isMulti = event.marketCount > 1;
  const visibleMarkets = isExpanded ? event.markets : event.markets.slice(0, VISIBLE_COUNT);
  const hiddenCount = event.marketCount - VISIBLE_COUNT;

  // For multi-market events, extract short outcome names
  const questions = visibleMarkets.map(m => m.question);
  const outcomeNames = isMulti ? extractOutcomeNames(questions) : questions;

  return (
    <motion.div
      key={event.eventUrl}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, delay: index * 0.02 }}
    >
      <GlassCard hover className="h-full flex flex-col overflow-hidden cursor-pointer" onClick={() => onClick(event)}>
        {/* Card Header */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant={event.source === 'polymarket' ? 'default' : 'info'} className="text-[10px]">
                {event.source.toUpperCase()}
              </Badge>
              <span className="text-xs text-white/40 flex items-center gap-1">
                {catConfig.icon}
                {catConfig.name}
              </span>
            </div>
            <a
              href={event.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 hover:text-neon-magenta transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Event Title + Image */}
          <div className="flex gap-3 items-start">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
              {isMulti ? event.eventTitle : event.markets[0]?.question || event.eventTitle}
            </h3>
          </div>
        </div>

        {/* Outcome Rows */}
        <div className="flex-1 px-4 pb-2">
          {isMulti ? (
            <MultiMarketOutcomes
              visibleMarkets={visibleMarkets}
              outcomeNames={outcomeNames}
              hiddenCount={hiddenCount}
              isExpanded={isExpanded}
              eventUrl={event.eventUrl}
              onToggleExpand={onToggleExpand}
            />
          ) : (
            <SingleMarketOutcomes market={event.markets[0]} />
          )}
        </div>

        {/* Card Footer */}
        <div className="px-4 py-3 mt-auto border-t border-white/5 flex items-center justify-between text-xs text-white/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <BarChart3 size={12} />
              {formatVolume(event.totalVolume)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatCloseDate(event.closeTime)}
            </span>
          </div>
          <span>
            via {event.source === 'polymarket' ? 'Polymarket' : event.source === 'kalshi' ? 'Kalshi' : event.source}
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function MultiMarketOutcomes({
  visibleMarkets,
  outcomeNames,
  hiddenCount,
  isExpanded,
  eventUrl,
  onToggleExpand,
}: {
  visibleMarkets: MarketEvent['markets'];
  outcomeNames: string[];
  hiddenCount: number;
  isExpanded: boolean;
  eventUrl: string;
  onToggleExpand: (url: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {visibleMarkets.map((market, i) => {
        const yesProb = market.probability * 100;
        return (
          <div key={market.id} className="flex items-center gap-2">
            <span className="text-xs text-white/80 truncate flex-1 min-w-0">
              {outcomeNames[i]}
            </span>
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${yesProb}%`,
                  background: yesProb > 50
                    ? 'linear-gradient(90deg, #06b6d4, #d946ef)'
                    : 'rgba(255,255,255,0.25)',
                }}
              />
            </div>
            <span className={`text-xs font-bold w-10 text-right shrink-0 ${
              yesProb > 50 ? 'text-neon-cyan' : 'text-white/60'
            }`}>
              {yesProb.toFixed(0)}%
            </span>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(eventUrl); }}
          className="flex items-center gap-1 text-xs text-neon-magenta/70 hover:text-neon-magenta transition-colors pt-0.5"
        >
          {isExpanded ? (
            <>Show less <ChevronUp size={12} /></>
          ) : (
            <>+{hiddenCount} more <ChevronDown size={12} /></>
          )}
        </button>
      )}
    </div>
  );
}

function SingleMarketOutcomes({ market }: { market?: MarketEvent['markets'][0] }) {
  if (!market) return null;

  return (
    <div>
      {market.outcomes?.map((outcome) => (
        <div key={outcome.id} className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-white/80 w-12 truncate">{outcome.name}</span>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${outcome.probability * 100}%`,
                background: outcome.probability > 0.5
                  ? 'linear-gradient(90deg, #06b6d4, #d946ef)'
                  : 'rgba(255,255,255,0.25)',
              }}
            />
          </div>
          <span className={`text-xs font-bold w-10 text-right ${
            outcome.probability > 0.5 ? 'text-neon-cyan' : 'text-white/60'
          }`}>
            {(outcome.probability * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
