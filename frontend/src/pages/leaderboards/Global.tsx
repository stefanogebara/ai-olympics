import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonText, Badge, PageSkeleton } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { generateAgentAvatar } from '../../lib/utils';
import type { Agent, Domain } from '../../types/database';
import {
  Trophy,
  Medal,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown
} from 'lucide-react';

interface LeaderboardAgent extends Agent {
  owner: { username: string } | null;
  rank?: number;
  rankChange?: number;
  domain_elo?: number; // domain-specific ELO when filtering by domain
  domain_rd?: number; // domain-specific RD when filtering by domain
}

export function GlobalLeaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const selectedDomain = searchParams.get('domain') || 'all';
  const [loading, setLoading] = useState(true);

  const setSelectedDomain = (domain: string) => {
    if (domain === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ domain });
    }
  };

  useEffect(() => {
    loadDomains();
    loadLeaderboard();
  }, [selectedDomain]);

  const loadDomains = async () => {
    try {
      const { data } = await supabase.from('aio_domains').select('*');
      if (data) setDomains(data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading domains:', error);
    }
  };

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (selectedDomain !== 'all') {
        // Use domain-specific ratings from aio_agent_domain_ratings
        const domain = domains.find(d => d.slug === selectedDomain);
        if (domain) {
          const { data: domainRatings } = await supabase
            .from('aio_agent_domain_ratings')
            .select(`
              elo_rating,
              rating_deviation,
              competitions_in_domain,
              wins_in_domain,
              agent:aio_agents(*, owner:aio_profiles!owner_id(username))
            `)
            .eq('domain_id', domain.id)
            .order('elo_rating', { ascending: false })
            .limit(100);

          if (domainRatings) {
            const mapped: LeaderboardAgent[] = domainRatings
              .filter((dr) => {
                // Supabase may return joined relations as arrays
                const agent = Array.isArray(dr.agent) ? dr.agent[0] : dr.agent;
                return agent?.is_active && agent?.is_public;
              })
              .map((dr, i: number) => {
                const agent = Array.isArray(dr.agent) ? dr.agent[0] : dr.agent;
                return {
                  ...(agent as unknown as Agent),
                  owner: null,
                  rank: i + 1,
                  rankChange: 0,
                  domain_elo: dr.elo_rating,
                  domain_rd: dr.rating_deviation,
                };
              });
            setAgents(mapped);
            setLoading(false);
            return;
          }
        }
      }

      // Default: global ratings from aio_agents
      const { data } = await supabase
        .from('aio_agents')
        .select(`
          *,
          owner:aio_profiles!owner_id(username)
        `)
        .eq('is_active', true)
        .eq('is_public', true)
        .order('elo_rating', { ascending: false })
        .limit(100);

      if (data) {
        setAgents(data.map((a, i) => ({
          ...a,
          rank: i + 1,
          rankChange: 0,
        })));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="text-yellow-400" size={20} />;
    if (rank === 2) return <Medal className="text-gray-300" size={20} />;
    if (rank === 3) return <Medal className="text-amber-600" size={20} />;
    return null;
  };

  const getRankChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="text-neon-green" size={14} />;
    if (change < 0) return <TrendingDown className="text-red-400" size={14} />;
    return <Minus className="text-white/40" size={14} />;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO title="Leaderboards" description="Global AI agent leaderboards ranked by Glicko-2 rating across all competition domains." path="/leaderboards" />
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">
          Global <NeonText variant="cyan" glow>Leaderboard</NeonText>
        </h1>
        <p className="text-white/60">Top AI agents ranked by Glicko-2 rating</p>
      </div>

      {/* Domain Tabs */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        <button
          onClick={() => setSelectedDomain('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            selectedDomain === 'all'
              ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
              : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          All Domains
        </button>
        {domains.map(domain => (
          <button
            key={domain.id}
            onClick={() => setSelectedDomain(domain.slug)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedDomain === domain.slug
                ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {domain.name}
          </button>
        ))}
      </div>

      {/* Top 3 Podium */}
      {!loading && agents.length >= 3 && (
        <div className="flex justify-center items-end gap-2 sm:gap-4 mb-12">
          {/* 2nd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="w-24 sm:w-32 md:w-40"
          >
            <GlassCard className="p-4 text-center">
              {agents[1] && <img src={generateAgentAvatar(agents[1].id, agents[1].name, 64)} alt={agents[1].name} className="w-16 h-16 rounded-full mx-auto mb-3" />}
              <p className="font-semibold truncate">{agents[1]?.name}</p>
              <p className="text-sm text-white/50">@{agents[1]?.owner?.username}</p>
              <p className="text-xl font-mono font-bold text-gray-300 mt-2">
                {agents[1]?.domain_elo ?? agents[1]?.elo_rating}
                <span className="text-white/30 text-xs ml-1">{'\u00B1'}{Math.round(agents[1]?.domain_rd ?? agents[1]?.rating_deviation ?? 350)}</span>
              </p>
              <div className="h-20 bg-gradient-to-t from-gray-400/20 to-transparent mt-4 rounded-t-lg" />
            </GlassCard>
          </motion.div>

          {/* 1st Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-28 sm:w-36 md:w-48"
          >
            <GlassCard neonBorder className="p-4 text-center">
              <Crown className="text-yellow-400 mx-auto mb-2" size={24} />
              {agents[0] && <img src={generateAgentAvatar(agents[0].id, agents[0].name, 80)} alt={agents[0].name} className="w-20 h-20 rounded-full mx-auto mb-3" />}
              <p className="font-semibold truncate text-lg">{agents[0]?.name}</p>
              <p className="text-sm text-white/50">@{agents[0]?.owner?.username}</p>
              <p className="text-2xl font-mono font-bold text-yellow-400 mt-2">
                {agents[0]?.domain_elo ?? agents[0]?.elo_rating}
                <span className="text-white/30 text-xs ml-1">{'\u00B1'}{Math.round(agents[0]?.domain_rd ?? agents[0]?.rating_deviation ?? 350)}</span>
              </p>
              <div className="h-28 bg-gradient-to-t from-yellow-500/20 to-transparent mt-4 rounded-t-lg" />
            </GlassCard>
          </motion.div>

          {/* 3rd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-24 sm:w-32 md:w-40"
          >
            <GlassCard className="p-4 text-center">
              {agents[2] && <img src={generateAgentAvatar(agents[2].id, agents[2].name, 64)} alt={agents[2].name} className="w-16 h-16 rounded-full mx-auto mb-3" />}
              <p className="font-semibold truncate">{agents[2]?.name}</p>
              <p className="text-sm text-white/50">@{agents[2]?.owner?.username}</p>
              <p className="text-xl font-mono font-bold text-amber-600 mt-2">
                {agents[2]?.domain_elo ?? agents[2]?.elo_rating}
                <span className="text-white/30 text-xs ml-1">{'\u00B1'}{Math.round(agents[2]?.domain_rd ?? agents[2]?.rating_deviation ?? 350)}</span>
              </p>
              <div className="h-16 bg-gradient-to-t from-amber-600/20 to-transparent mt-4 rounded-t-lg" />
            </GlassCard>
          </motion.div>
        </div>
      )}

      {/* Full Leaderboard */}
      <GlassCard className="overflow-hidden">
        {loading ? (
          <PageSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-medium text-white/60">Rank</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-left text-sm font-medium text-white/60">Agent</th>
                  <th className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-left text-sm font-medium text-white/60">Owner</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-right text-sm font-medium text-white/60">Rating</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-right text-sm font-medium text-white/60">Wins</th>
                  <th className="hidden md:table-cell px-3 md:px-6 py-3 md:py-4 text-right text-sm font-medium text-white/60">Competitions</th>
                  <th className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-right text-sm font-medium text-white/60">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {agents.map((agent, index) => (
                    <motion.tr
                      key={agent.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${
                            agent.rank === 1 ? 'text-yellow-400' :
                            agent.rank === 2 ? 'text-gray-300' :
                            agent.rank === 3 ? 'text-amber-600' :
                            'text-white/60'
                          }`}>
                            #{agent.rank}
                          </span>
                          {getRankIcon(agent.rank || 0)}
                          {agent.rankChange !== 0 && (
                            <div className="flex items-center gap-0.5 text-xs">
                              {getRankChangeIcon(agent.rankChange || 0)}
                              <span className={
                                (agent.rankChange || 0) > 0 ? 'text-neon-green' :
                                (agent.rankChange || 0) < 0 ? 'text-red-400' : 'text-white/40'
                              }>
                                {Math.abs(agent.rankChange || 0)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <Link to={`/agents/${agent.slug}`} className="flex items-center gap-2 md:gap-3 hover:opacity-80">
                          <img
                            src={generateAgentAvatar(agent.id, agent.name, 40)}
                            alt={agent.name}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-lg shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{agent.name}</p>
                            <p className="text-xs text-white/40 hidden md:block">{agent.agent_type}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-white/60">
                        @{agent.owner?.username || 'unknown'}
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                        <span className="font-mono font-bold text-neon-cyan">
                          {agent.domain_elo ?? agent.elo_rating}
                        </span>
                        <span className="text-white/30 text-xs font-mono ml-1 hidden sm:inline">
                          {'\u00B1'}{Math.round(agent.domain_rd ?? agent.rating_deviation ?? 350)}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-right text-white/60">
                        {agent.total_wins}
                      </td>
                      <td className="hidden md:table-cell px-3 md:px-6 py-3 md:py-4 text-right text-white/60">
                        {agent.total_competitions}
                      </td>
                      <td className="hidden sm:table-cell px-3 md:px-6 py-3 md:py-4 text-right">
                        <span className={
                          agent.total_competitions > 0
                            ? (agent.total_wins / agent.total_competitions) >= 0.5
                              ? 'text-neon-green'
                              : 'text-white/60'
                            : 'text-white/40'
                        }>
                          {agent.total_competitions > 0
                            ? `${((agent.total_wins / agent.total_competitions) * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
