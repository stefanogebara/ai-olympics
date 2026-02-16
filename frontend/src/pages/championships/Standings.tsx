import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { StandingsTable } from '../../components/championship/StandingsTable';
import { RoundResultsTable } from '../../components/championship/RoundResultsTable';
import { useChampionshipSocket } from '../../hooks/useChampionshipSocket';
import { GlassCard, Badge, PageSkeleton } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Medal,
  Trophy,
  ExternalLink,
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

interface ChampionshipData {
  id: string;
  name: string;
  format: string;
  status: string;
  total_rounds: number;
  current_round: number;
  max_participants: number;
  points_config: Record<string, number>;
  elimination_after_round: number | null;
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

// Points Progression sub-component
function PointsProgression({
  participants,
  rounds,
}: {
  participants: ChampionshipData['participants'];
  rounds: ChampionshipData['rounds'];
}) {
  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.round_number - b.round_number),
    [rounds]
  );

  const completedRounds = useMemo(
    () => sortedRounds.filter((r) => r.status === 'completed'),
    [sortedRounds]
  );

  if (completedRounds.length === 0) {
    return (
      <div className="text-center py-6 text-white/40">
        Points progression will appear after the first round completes.
      </div>
    );
  }

  // Build cumulative points for each participant across rounds
  const sortedParticipants = [...participants].sort((a, b) => b.total_points - a.total_points);

  const cumulativeData = useMemo(() => {
    return sortedParticipants.map((p) => {
      let cumulative = 0;
      const roundPoints = completedRounds.map((round) => {
        const result = round.results.find((r) => r.participant_id === p.id);
        cumulative += result?.points_awarded || 0;
        return cumulative;
      });
      return { participant: p, roundPoints };
    });
  }, [sortedParticipants, completedRounds]);

  // Find max points for bar scaling
  const maxPoints = Math.max(...cumulativeData.map((d) => d.roundPoints[d.roundPoints.length - 1] || 0), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left px-4 py-3 text-white/50 font-medium sticky left-0 bg-cyber-elevated z-10">
              Agent
            </th>
            {completedRounds.map((round) => (
              <th key={round.id} className="text-center px-3 py-3 text-white/50 font-medium min-w-[80px]">
                R{round.round_number}
              </th>
            ))}
            <th className="text-right px-4 py-3 text-white/50 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {cumulativeData.map(({ participant: p, roundPoints }, idx) => {
            const isLeader = idx === 0;
            return (
              <tr
                key={p.id}
                className={`border-b border-white/5 transition-colors ${
                  p.is_eliminated ? 'opacity-50' : 'hover:bg-white/5'
                }`}
              >
                <td className="px-4 py-3 sticky left-0 bg-cyber-elevated z-10">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.agent?.color || '#6B7280' }}
                    />
                    <span className="text-white font-medium truncate max-w-[120px]">
                      {p.agent?.name || 'Unknown'}
                    </span>
                    {isLeader && <Trophy size={12} className="text-yellow-400 flex-shrink-0" />}
                  </div>
                </td>
                {roundPoints.map((cumPts, rIdx) => {
                  // Find if this participant was leader at this round
                  const isRoundLeader = cumulativeData.every(
                    (d) => d.roundPoints[rIdx] <= cumPts
                  );
                  return (
                    <td key={rIdx} className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-mono ${isRoundLeader ? 'text-yellow-400 font-bold' : 'text-white/70'}`}>
                          {cumPts}
                        </span>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(cumPts / maxPoints) * 100}%`,
                              backgroundColor: p.agent?.color || '#6B7280',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-neon-cyan">{p.total_points}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ChampionshipStandingsPage() {
  const { id } = useParams<{ id: string }>();
  const [championship, setChampionship] = useState<ChampionshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState<number>(1);

  const loadChampionship = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
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

      if (error) throw error;
      setChampionship(data as unknown as ChampionshipData);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading championship:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadChampionship();
  }, [loadChampionship]);

  // Connect socket for active championships
  const shouldConnect =
    championship?.status === 'active' || championship?.status === 'between_rounds';
  const { isConnected } = useChampionshipSocket(shouldConnect ? id : undefined, {
    onUpdate: loadChampionship,
  });

  // Sorted rounds
  const sortedRounds = useMemo(
    () => [...(championship?.rounds || [])].sort((a, b) => a.round_number - b.round_number),
    [championship?.rounds]
  );

  // Set selectedRound to the latest completed or running round on load
  useEffect(() => {
    if (sortedRounds.length > 0) {
      const latestCompleted = [...sortedRounds]
        .reverse()
        .find((r) => r.status === 'completed' || r.status === 'running');
      if (latestCompleted) {
        setSelectedRound(latestCompleted.round_number);
      } else {
        setSelectedRound(sortedRounds[0].round_number);
      }
    }
  }, [sortedRounds]);

  const selectedRoundData = useMemo(
    () => sortedRounds.find((r) => r.round_number === selectedRound),
    [sortedRounds, selectedRound]
  );

  // --- Render states ---

  if (loading) {
    return <PageSkeleton />;
  }

  if (!championship) {
    return (
      <div className="min-h-screen bg-cyber-dark flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-white mb-4">
            Championship not found
          </h2>
          <Link
            to="/championships"
            className="inline-flex items-center gap-2 text-neon-cyan hover:underline"
          >
            <ArrowLeft size={18} />
            Back to Championships
          </Link>
        </div>
      </div>
    );
  }

  const status = statusColors[championship.status] || statusColors.registration;
  const showStandings =
    championship.status === 'active' ||
    championship.status === 'between_rounds' ||
    championship.status === 'completed';

  return (
    <div className="min-h-screen bg-cyber-dark flex flex-col">
      {/* Header Bar */}
      <div className="border-b border-white/10 bg-cyber-navy/80 backdrop-blur-md px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to={`/championships/${id}`}
            className="text-white/60 hover:text-white transition-colors flex-shrink-0"
            aria-label="Back to championship detail"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <Medal size={20} className="text-yellow-400 flex-shrink-0" />
            <h1 className="text-lg font-display font-bold text-white truncate">
              {championship.name}
            </h1>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${status.bg} ${status.text}`}
          >
            {championship.status.replace('_', ' ')}
          </span>
          <Badge variant="default" className="flex-shrink-0">
            {formatLabels[championship.format] || championship.format}
          </Badge>
          {championship.total_rounds > 0 && (
            <span className="text-sm text-white/40 flex-shrink-0">
              Round {championship.current_round}/{championship.total_rounds}
            </span>
          )}
        </div>

        {/* Socket indicator */}
        {shouldConnect && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-neon-green">
                <Wifi size={14} />
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-white/30">
                <WifiOff size={14} />
                Connecting...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      {!showStandings ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/40 text-lg mb-4">
              Standings will appear when the championship starts.
            </p>
            <Link
              to={`/championships/${id}`}
              className="inline-flex items-center gap-2 text-neon-cyan hover:underline"
            >
              <ArrowLeft size={16} />
              Back to Championship
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
          {/* Overall Standings */}
          <GlassCard className="p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy size={20} className="text-yellow-400" />
              Overall Standings
            </h3>
            <StandingsTable
              participants={championship.participants}
              currentRound={championship.current_round}
              totalRounds={championship.total_rounds}
            />
          </GlassCard>

          {/* Points Progression */}
          <GlassCard className="p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Points Progression</h3>
            <PointsProgression
              participants={championship.participants}
              rounds={championship.rounds}
            />
          </GlassCard>

          {/* Round-by-Round Results */}
          {sortedRounds.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Round Results</h3>

              {/* Round selector tabs */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {sortedRounds.map((round) => (
                  <button
                    key={round.id}
                    onClick={() => setSelectedRound(round.round_number)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                      selectedRound === round.round_number
                        ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30'
                        : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    Round {round.round_number}
                    {round.status === 'running' && (
                      <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                    )}
                    {round.status === 'completed' && (
                      <span className="ml-1.5 text-neon-green text-xs">&#10003;</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Selected round results */}
              {selectedRoundData && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedRoundData.status === 'completed'
                          ? 'bg-neon-green/20 text-neon-green'
                          : selectedRoundData.status === 'running'
                          ? 'bg-neon-green/20 text-neon-green'
                          : selectedRoundData.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {selectedRoundData.status}
                    </span>
                    {selectedRoundData.competition_id && (
                      <Link
                        to={`/competitions/${selectedRoundData.competition_id}`}
                        className="inline-flex items-center gap-1 text-xs text-neon-cyan hover:underline"
                      >
                        View Competition <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>
                  <RoundResultsTable
                    results={selectedRoundData.results}
                    participants={championship.participants}
                    roundStatus={selectedRoundData.status}
                  />
                </div>
              )}
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
