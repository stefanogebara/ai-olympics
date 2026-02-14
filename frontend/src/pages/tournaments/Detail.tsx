import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText, Badge, PageSkeleton } from '../../components/ui';
import { BracketViz } from '../../components/tournament/BracketViz';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { API_BASE } from '../../lib/api';
import {
  Swords,
  Users,
  Trophy,
  ArrowLeft,
  Play,
  Clock,
  GitBranch,
  LogOut,
} from 'lucide-react';

const bracketLabels: Record<string, string> = {
  'single-elimination': 'Single Elimination',
  'double-elimination': 'Double Elimination',
  'round-robin': 'Round Robin',
  'swiss': 'Swiss System',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  lobby: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan' },
  seeding: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  running: { bg: 'bg-neon-green/20', text: 'text-neon-green' },
  completed: { bg: 'bg-white/10', text: 'text-white/60' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

interface TournamentDetail {
  id: string;
  name: string;
  bracket_type: string;
  status: string;
  max_participants: number;
  best_of: number;
  task_ids: string[] | null;
  current_round: number;
  total_rounds: number | null;
  bracket_data: Record<string, unknown> | null;
  seeds: Record<string, unknown> | null;
  created_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  domain: { name: string; slug: string } | null;
  creator: { username: string } | null;
  participants: Array<{
    id: string;
    agent_id: string;
    user_id: string;
    seed_number: number | null;
    final_placement: number | null;
    matches_won: number;
    matches_lost: number;
    total_score: number;
    agent: { id: string; name: string; slug: string; color: string; elo_rating: number } | null;
    user: { username: string } | null;
  }>;
  matches: Array<{
    id: string;
    round_number: number;
    match_number: number;
    agent_1_id: string | null;
    agent_2_id: string | null;
    agent_1: { id: string; name: string; slug: string; color: string } | null;
    agent_2: { id: string; name: string; slug: string; color: string } | null;
    winner_id: string | null;
    agent_1_score: number | null;
    agent_2_score: number | null;
    is_bye: boolean;
    status: string;
  }>;
}

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuthStore();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [userAgents, setUserAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadTournament();
  }, [id]);

  useEffect(() => {
    if (user) loadUserAgents();
  }, [user]);

  const loadTournament = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('aio_tournaments')
        .select(`
          *,
          domain:aio_domains(name, slug),
          participants:aio_tournament_participants(
            *,
            agent:aio_agents(id, name, slug, color, elo_rating),
            user:aio_profiles(username)
          ),
          matches:aio_tournament_matches(
            *,
            agent_1:aio_agents!aio_tournament_matches_agent_1_id_fkey(id, name, slug, color),
            agent_2:aio_agents!aio_tournament_matches_agent_2_id_fkey(id, name, slug, color)
          ),
          creator:aio_profiles(username)
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      setTournament(data as unknown as TournamentDetail);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading tournament:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserAgents = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('aio_agents')
      .select('id, name')
      .eq('owner_id', user.id)
      .eq('is_active', true);
    if (data) {
      setUserAgents(data);
      if (data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(data[0].id);
      }
    }
  };

  const joinTournament = async () => {
    if (!user || !selectedAgentId || !id) return;
    setJoining(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('aio_tournament_participants')
        .insert({
          tournament_id: id,
          agent_id: selectedAgentId,
          user_id: user.id,
        });

      if (insertError) throw new Error(insertError.message);
      await loadTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const leaveTournament = async () => {
    if (!user || !id) return;
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('aio_tournament_participants')
        .delete()
        .eq('tournament_id', id)
        .eq('user_id', user.id);

      if (deleteError) throw new Error(deleteError.message);
      await loadTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave');
    }
  };

  const startTournament = async () => {
    if (!session?.access_token || !id) return;
    setStarting(true);
    setError(null);

    if (!API_BASE) {
      setError('Tournament start requires the backend server. Please try again later.');
      setStarting(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start');
        }
        throw new Error('Backend server unavailable');
      }

      setTimeout(() => loadTournament(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!tournament) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-2xl font-display font-bold text-white mb-4">Tournament not found</h2>
        <Link to="/tournaments">
          <NeonButton>Back to Tournaments</NeonButton>
        </Link>
      </div>
    );
  }

  const isCreator = user?.id === tournament.created_by;
  const isParticipant = tournament.participants.some(p => p.user_id === user?.id);
  const isLobby = tournament.status === 'lobby';
  const status = statusColors[tournament.status] || statusColors.lobby;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Back link */}
      <Link to="/tournaments" className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={18} />
        Back to Tournaments
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Swords size={28} className="text-neon-magenta" />
            <h1 className="text-3xl font-display font-bold">
              <NeonText variant="magenta" glow>{tournament.name}</NeonText>
            </h1>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
              {tournament.status}
            </span>
            <Badge variant="default">
              {bracketLabels[tournament.bracket_type] || tournament.bracket_type}
            </Badge>
            {tournament.domain && (
              <span className="text-sm text-white/50">{tournament.domain.name}</span>
            )}
            {tournament.creator && (
              <span className="text-sm text-white/40">by {tournament.creator.username}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {isLobby && isCreator && tournament.participants.length >= 2 && (
            <NeonButton
              onClick={startTournament}
              disabled={starting}
              icon={<Play size={18} />}
            >
              {starting ? 'Starting...' : 'Start Tournament'}
            </NeonButton>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-4 text-center">
          <Users size={20} className="mx-auto mb-2 text-neon-cyan" />
          <div className="text-2xl font-bold text-white">{tournament.participants.length}</div>
          <div className="text-xs text-white/50">/ {tournament.max_participants} participants</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <GitBranch size={20} className="mx-auto mb-2 text-neon-magenta" />
          <div className="text-lg font-bold text-white">{bracketLabels[tournament.bracket_type]}</div>
          <div className="text-xs text-white/50">Best of {tournament.best_of}</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Trophy size={20} className="mx-auto mb-2 text-yellow-400" />
          <div className="text-lg font-bold text-white">
            {tournament.total_rounds !== null ? `${tournament.current_round}/${tournament.total_rounds}` : '-'}
          </div>
          <div className="text-xs text-white/50">Rounds</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Clock size={20} className="mx-auto mb-2 text-white/60" />
          <div className="text-sm font-bold text-white">
            {tournament.started_at
              ? new Date(tournament.started_at).toLocaleDateString()
              : 'Not started'}
          </div>
          <div className="text-xs text-white/50">
            {tournament.ended_at ? 'Ended' : tournament.started_at ? 'Started' : 'Waiting'}
          </div>
        </GlassCard>
      </div>

      {/* Join Section */}
      {isLobby && user && !isParticipant && (
        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Join Tournament</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-white/60 mb-2">Select your agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-cyan/50"
              >
                {userAgents.length === 0 && <option value="">No agents available</option>}
                {userAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <NeonButton
              onClick={joinTournament}
              disabled={joining || !selectedAgentId}
              icon={<Play size={18} />}
            >
              {joining ? 'Joining...' : 'Join'}
            </NeonButton>
          </div>
        </GlassCard>
      )}

      {/* Leave button */}
      {isLobby && isParticipant && !isCreator && (
        <div className="mb-8">
          <button
            onClick={leaveTournament}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Leave Tournament
          </button>
        </div>
      )}

      {/* Bracket / Matches */}
      {(tournament.status === 'running' || tournament.status === 'completed') && (
        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">
            {tournament.bracket_type === 'single-elimination' ? 'Bracket' : 'Standings & Matches'}
          </h3>
          <BracketViz
            matches={tournament.matches || []}
            participants={tournament.participants}
            bracketType={tournament.bracket_type}
            status={tournament.status}
          />
        </GlassCard>
      )}

      {/* Participants */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Participants ({tournament.participants.length})
        </h3>
        {tournament.participants.length === 0 ? (
          <p className="text-white/40 text-sm">No participants yet. Be the first to join!</p>
        ) : (
          <div className="space-y-3">
            {[...tournament.participants]
              .sort((a, b) => (a.seed_number || 999) - (b.seed_number || 999))
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {p.seed_number && (
                      <span className="text-xs text-white/40 w-6">#{p.seed_number}</span>
                    )}
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: p.agent?.color || '#6B7280' }}
                    />
                    <Link
                      to={`/agents/${p.agent?.slug}`}
                      className="text-white font-medium hover:text-neon-cyan transition-colors"
                    >
                      {p.agent?.name || 'Unknown'}
                    </Link>
                    <span className="text-xs text-white/40">
                      ELO {p.agent?.elo_rating || 1200}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {p.final_placement && (
                      <span className={`font-medium ${p.final_placement === 1 ? 'text-yellow-400' : 'text-white/60'}`}>
                        {p.final_placement === 1 ? 'Winner' : `#${p.final_placement}`}
                      </span>
                    )}
                    {(p.matches_won > 0 || p.matches_lost > 0) && (
                      <span className="text-white/50">
                        {p.matches_won}W - {p.matches_lost}L
                      </span>
                    )}
                    {p.user && (
                      <span className="text-white/30 text-xs">by {p.user.username}</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
