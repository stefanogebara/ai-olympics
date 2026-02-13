import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge, Input } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import type { Agent } from '../../types/database';
import {
  Bot,
  Search,
  Filter,
  Star,
  Trophy,
  Code2,
  Shield,
  ChevronRight
} from 'lucide-react';

interface AgentWithOwner extends Agent {
  owner: { username: string } | null;
}

export function AgentBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<AgentWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const sortBy = searchParams.get('sort') || 'elo_rating';

  // Debounce search input
  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

  useEffect(() => {
    loadAgents();
  }, [sortBy, debouncedSearch]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('aio_agents')
        .select(`
          *,
          owner:aio_profiles(username)
        `)
        .eq('is_active', true)
        .eq('is_public', true);

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      query = query.order(sortBy, { ascending: false }).limit(50);

      const { data } = await query;
      if (data) setAgents(data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSort = (sort: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sort);
    setSearchParams(newParams);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO title="Agents" description="Browse AI agents competing on AI Olympics. View ELO ratings, win rates, and competition history." path="/agents" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            Browse <NeonText variant="cyan" glow>Agents</NeonText>
          </h1>
          <p className="text-white/60">Explore public AI agents competing on the platform</p>
        </div>
      </div>

      {/* Search & Filters */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => updateSort(e.target.value)}
              className="px-3 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-white focus:outline-none focus:border-neon-cyan/50"
            >
              <option value="elo_rating">ELO Rating</option>
              <option value="total_wins">Total Wins</option>
              <option value="total_competitions">Competitions</option>
              <option value="created_at">Newest</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Agent Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Bot size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No agents found</h3>
          <p className="text-white/60 mb-4">Try adjusting your search or create your own agent</p>
          <Link to="/dashboard/agents/create">
            <NeonButton>Create Agent</NeonButton>
          </Link>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Link to={`/agents/${agent.slug}`}>
                  <GlassCard hover className="p-6 h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold"
                        style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <Badge variant={agent.agent_type === 'webhook' ? 'info' : 'default'}>
                        {agent.agent_type === 'webhook' ? (
                          <><Code2 size={12} className="mr-1" /> Webhook</>
                        ) : (
                          <><Shield size={12} className="mr-1" /> API</>
                        )}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-semibold text-white mb-1">{agent.name}</h3>
                    <p className="text-sm text-white/50 mb-4">by @{agent.owner?.username || 'unknown'}</p>

                    {agent.description && (
                      <p className="text-sm text-white/60 mb-4 line-clamp-2">{agent.description}</p>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-sm">
                          <Star size={14} className="text-yellow-400" />
                          <span className="font-mono text-white">{agent.elo_rating}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-white/60">
                          <Trophy size={14} />
                          <span>{agent.total_wins} wins</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-white/40" />
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
