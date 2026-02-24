import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText, Badge, PageSkeleton } from '../../components/ui';
import { StandingsTable } from '../../components/championship/StandingsTable';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { API_BASE } from '../../lib/api';
import {
  Medal,
  Users,
  Trophy,
  ArrowLeft,
  Play,
  Clock,
  Target,
  Zap,
  CheckCircle,
  Circle,
  Loader2,
  AlertCircle,
  Maximize2,
} from 'lucide-react';

const formatLabels: Record<string, string> = {
  points: 'Points Championship',
  elimination: 'Elimination Championship',
  hybrid: 'Hybrid Championship',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  registration: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan' },
  active: { bg: 'bg-neon-green/20', text: 'text-neon-green' },
  between_rounds: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  completed: { bg: 'bg-white/10', text: 'text-white/60' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

const roundStatusIcons: Record<string, typeof Circle> = {
  scheduled: Circle,
  running: Loader2,
  completed: CheckCircle,
  failed: AlertCircle,
};

interface ChampionshipDetailData {
  id: string;
  name: string;
  format: string;
  status: string;
  total_rounds: number;
  current_round: number;
  max_participants: number;
  points_config: Record<string, number>;
  elimination_after_round: number | null;
  entry_requirements: Record<string, any>;
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
    total_points: number;
    rounds_completed: number;
    current_rank: number | null;
    is_eliminated: boolean;
    agent: { id: string; name: string; slug: string; color: string; elo_rating: number } | null;
    user: { username: string } | null;
  }>;
  rounds: Array<{
    id: string;
    round_number: number;
    competition_id: string | null;
    status: string;
    scheduled_at: string | null;
    results: Array<{
      participant_id: string;
      round_rank: number;
      points_awarded: number;
    }>;
  }>;
}

export function ChampionshipDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuthStore();
  const [championship, setChampionship] = useState<ChampionshipDetailData | null>(null);
  const [userAgents, setUserAgents] = useState<Array<{ id: string; name: string; elo_rating: number }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [startingRound, setStartingRound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadChampionship();
  }, [id]);

  useEffect(() => {
    if (user) loadUserAgents();
  }, [user]);

  const loadChampionship = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('aio_championships')
        .select(`
          *,
          domain:aio_domains(name, slug),
          participants:aio_championship_participants(
            *,
            agent:aio_agents(id, name, slug, color, elo_rating),
            user:aio_profiles(username)
          ),
          rounds:aio_championship_rounds(
            *,
            results:aio_championship_round_results(*)
          ),
          creator:aio_profiles(username)
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      setChampionship(data as unknown as ChampionshipDetailData);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading championship:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserAgents = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('aio_agents')
      .select('id, name, elo_rating')
      .eq('owner_id', user.id)
      .eq('is_active', true);
    if (data) {
      setUserAgents(data);
      if (data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(data[0].id);
      }
    }
  };

  const joinChampionship = async () => {
    if (!user || !selectedAgentId || !id) return;
    setJoining(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('aio_championship_participants')
        .insert({
          championship_id: id,
          agent_id: selectedAgentId,
          user_id: user.id,
        });

      if (insertError) throw new Error(insertError.message);
      await loadChampionship();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const startNextRound = async () => {
    if (!session?.access_token || !id) return;
    setStartingRound(true);
    setError(null);

    if (!API_BASE) {
      setError('Starting rounds requires the backend server. Please try again later.');
      setStartingRound(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/championships/${id}/start-round`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start round');
        }
        throw new Error('Backend server unavailable');
      }

      setTimeout(() => loadChampionship(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start round');
    } finally {
      setStartingRound(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!championship) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-2xl font-display font-bold text-white mb-4">Championship not found</h2>
        <NeonButton to="/championships">Back to Championships</NeonButton>
      </div>
    );
  }

  const isCreator = user?.id === championship.created_by;
  const isParticipant = championship.participants.some(p => p.user_id === user?.id);
  const isRegistration = championship.status === 'registration';
  const canStartRound = isCreator &&
    (championship.status === 'registration' || championship.status === 'between_rounds') &&
    championship.participants.length >= 2 &&
    championship.current_round < championship.total_rounds;
  const status = statusColors[championship.status] || statusColors.registration;

  const sortedRounds = [...(championship.rounds || [])].sort((a, b) => a.round_number - b.round_number);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Back link */}
      <Link to="/championships" className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={18} />
        Back to Championships
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Medal size={28} className="text-yellow-400" />
            <h1 className="text-3xl font-display font-bold">
              <NeonText variant="cyan" glow>{championship.name}</NeonText>
            </h1>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
              {championship.status.replace('_', ' ')}
            </span>
            <Badge variant="default">
              {formatLabels[championship.format] || championship.format}
            </Badge>
            {championship.domain && (
              <span className="text-sm text-white/50">{championship.domain.name}</span>
            )}
            {championship.creator && (
              <span className="text-sm text-white/40">by {championship.creator.username}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {canStartRound && (
            <NeonButton
              onClick={startNextRound}
              disabled={startingRound}
              icon={<Play size={18} />}
            >
              {startingRound ? 'Starting...' : `Start Round ${championship.current_round + 1}`}
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
          <div className="text-2xl font-bold text-white">{championship.participants.length}</div>
          <div className="text-xs text-white/50">/ {championship.max_participants} participants</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Trophy size={20} className="mx-auto mb-2 text-yellow-400" />
          <div className="text-lg font-bold text-white">
            {championship.current_round}/{championship.total_rounds}
          </div>
          <div className="text-xs text-white/50">Rounds</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          {championship.format === 'elimination' ? (
            <Zap size={20} className="mx-auto mb-2 text-red-400" />
          ) : (
            <Target size={20} className="mx-auto mb-2 text-neon-magenta" />
          )}
          <div className="text-lg font-bold text-white capitalize">{championship.format}</div>
          <div className="text-xs text-white/50">Format</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Clock size={20} className="mx-auto mb-2 text-white/60" />
          <div className="text-sm font-bold text-white">
            {championship.started_at
              ? new Date(championship.started_at).toLocaleDateString()
              : 'Not started'}
          </div>
          <div className="text-xs text-white/50">
            {championship.ended_at ? 'Ended' : championship.started_at ? 'Started' : 'Waiting'}
          </div>
        </GlassCard>
      </div>

      {/* Entry Requirements */}
      {championship.entry_requirements && Object.keys(championship.entry_requirements).length > 0 && (
        <GlassCard className="p-4 mb-6">
          <h4 className="text-sm font-medium text-white/60 mb-2">Entry Requirements</h4>
          <div className="flex flex-wrap gap-3">
            {championship.entry_requirements.min_elo && (
              <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/30 rounded-full text-xs text-neon-cyan">
                Min ELO: {championship.entry_requirements.min_elo}
              </span>
            )}
            {championship.entry_requirements.max_elo && (
              <span className="px-3 py-1 bg-neon-magenta/10 border border-neon-magenta/30 rounded-full text-xs text-neon-magenta">
                Max ELO: {championship.entry_requirements.max_elo}
              </span>
            )}
          </div>
        </GlassCard>
      )}

      {/* Join Section */}
      {isRegistration && user && !isParticipant && (
        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Join Championship</h3>
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
                  <option key={agent.id} value={agent.id}>
                    {agent.name} (ELO: {agent.elo_rating || 1200})
                  </option>
                ))}
              </select>
            </div>
            <NeonButton
              onClick={joinChampionship}
              disabled={joining || !selectedAgentId}
              icon={<Play size={18} />}
            >
              {joining ? 'Joining...' : 'Join'}
            </NeonButton>
          </div>
        </GlassCard>
      )}

      {/* Round Cards */}
      {championship.total_rounds > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Rounds</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: championship.total_rounds }, (_, i) => {
              const roundNum = i + 1;
              const round = sortedRounds.find(r => r.round_number === roundNum);
              const RoundIcon = round ? (roundStatusIcons[round.status] || Circle) : Circle;
              const isRunning = round?.status === 'running';
              const isCompleted = round?.status === 'completed';

              return (
                <GlassCard
                  key={roundNum}
                  className={`p-4 ${isRunning ? 'border-neon-green/30' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RoundIcon
                        size={16}
                        className={
                          isCompleted ? 'text-neon-green' :
                          isRunning ? 'text-neon-green animate-spin' :
                          round?.status === 'failed' ? 'text-red-400' :
                          'text-white/30'
                        }
                      />
                      <span className="font-medium text-white">Round {roundNum}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isCompleted ? 'bg-neon-green/20 text-neon-green' :
                      isRunning ? 'bg-neon-green/20 text-neon-green' :
                      round?.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-white/5 text-white/40'
                    }`}>
                      {round?.status || 'upcoming'}
                    </span>
                  </div>
                  {round?.competition_id && (
                    <Link
                      to={`/competitions/${round.competition_id}`}
                      className="text-xs text-neon-cyan hover:underline"
                    >
                      View Competition
                    </Link>
                  )}
                  {round?.scheduled_at && (
                    <div className="text-xs text-white/40 mt-1">
                      {new Date(round.scheduled_at).toLocaleString()}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Standings Table */}
      {championship.participants.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              <span className="flex items-center gap-2">
                <Trophy size={20} className="text-yellow-400" />
                Standings
              </span>
            </h3>
            {championship.status !== 'registration' && (
              <NeonButton to={`/championships/${id}/standings`} size="sm" variant="ghost" icon={<Maximize2 size={16} />}>
                Full Standings
              </NeonButton>
            )}
          </div>
          <StandingsTable
            participants={championship.participants}
            currentRound={championship.current_round}
            totalRounds={championship.total_rounds}
          />
        </div>
      )}

      {/* Points Config */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Points System</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(championship.points_config || {})
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .map(([pos, pts]) => (
              <div
                key={pos}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
              >
                <span className="text-sm font-medium text-white/60">{pos}</span>
                <span className="text-sm font-bold text-neon-cyan">{pts as number} pts</span>
              </div>
            ))}
        </div>
      </GlassCard>
    </div>
  );
}
