import { useState, useEffect } from 'react';
import { GlassCard } from '../ui';
import { useStore } from '../../store';
import { getSocket } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { Heart, Trophy, Star } from 'lucide-react';

interface VotingPanelProps {
  competitionId: string;
  agents: Array<{ id: string; name: string; color: string }>;
}

import { supabase } from '../../lib/supabase';

export function VotingPanel({ competitionId, agents }: VotingPanelProps) {
  const voteCounts = useStore((s) => s.voteCounts);
  const setVoteCounts = useStore((s) => s.setVoteCounts);
  const [animatingVote, setAnimatingVote] = useState<string | null>(null);

  // Fetch initial vote counts from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('aio_spectator_votes')
          .select('agent_id, vote_type')
          .eq('competition_id', competitionId);

        if (data) {
          const counts: Record<string, { cheers: number; predict_win: number; mvp: number }> = {};
          for (const row of data) {
            if (!counts[row.agent_id]) counts[row.agent_id] = { cheers: 0, predict_win: 0, mvp: 0 };
            if (row.vote_type === 'cheer') counts[row.agent_id].cheers++;
            else if (row.vote_type === 'predict_win') counts[row.agent_id].predict_win++;
            else if (row.vote_type === 'mvp') counts[row.agent_id].mvp++;
          }
          setVoteCounts(counts);
        }
      } catch {}
    })();
  }, [competitionId, setVoteCounts]);

  const castVote = (agentId: string, voteType: 'cheer' | 'predict_win' | 'mvp') => {
    const socket = getSocket();
    socket.emit('vote:cast', {
      competition_id: competitionId,
      agent_id: agentId,
      vote_type: voteType,
    });

    // Trigger pulse animation
    const key = `${agentId}-${voteType}`;
    setAnimatingVote(key);
    setTimeout(() => setAnimatingVote(null), 600);
  };

  const voteButtons = [
    { type: 'cheer' as const, icon: Heart, label: 'Cheer', countKey: 'cheers' as const, color: 'text-red-400' },
    { type: 'predict_win' as const, icon: Trophy, label: 'Win', countKey: 'predict_win' as const, color: 'text-yellow-400' },
    { type: 'mvp' as const, icon: Star, label: 'MVP', countKey: 'mvp' as const, color: 'text-purple-400' },
  ];

  return (
    <GlassCard className="p-4">
      <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-red-400 rounded-full" />
        Spectator Votes
      </h2>

      <div className="space-y-3">
        {agents.map((agent) => {
          const counts = voteCounts[agent.id] || { cheers: 0, predict_win: 0, mvp: 0 };
          return (
            <div key={agent.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                >
                  {agent.name.charAt(0)}
                </div>
                <span className="font-semibold text-sm text-white">{agent.name}</span>
              </div>

              <div className="flex gap-2">
                {voteButtons.map(({ type, icon: Icon, label, countKey, color }) => {
                  const isAnimating = animatingVote === `${agent.id}-${type}`;
                  return (
                    <button
                      key={type}
                      onClick={() => castVote(agent.id, type)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10',
                        'hover:bg-white/10 hover:border-white/20 transition-all text-xs',
                        isAnimating && 'animate-pulse scale-110'
                      )}
                    >
                      <Icon size={12} className={color} />
                      <span className="text-white/70">{label}</span>
                      <span className="text-white/50 ml-1 font-mono">{counts[countKey]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {agents.length === 0 && (
          <p className="text-center text-white/40 py-4">No agents in competition...</p>
        )}
      </div>
    </GlassCard>
  );
}
