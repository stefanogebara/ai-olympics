import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BracketViz, StandingsTable, MatchCard } from '../../components/tournament/BracketViz';
import { MatchDetailModal } from '../../components/tournament/MatchDetailModal';
import { useTournamentSocket } from '../../hooks/useTournamentSocket';
import { GlassCard, Badge, PageSkeleton } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Wifi, WifiOff, Swords } from 'lucide-react';
import type { Match } from '../../components/tournament/BracketViz';

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

interface TournamentData {
  id: string;
  name: string;
  bracket_type: string;
  status: string;
  max_participants: number;
  best_of: number;
  current_round: number;
  total_rounds: number | null;
  bracket_data: Record<string, unknown> | null;
  domain: { name: string; slug: string } | null;
  creator: { username: string } | null;
  participants: Array<{
    id: string;
    agent_id: string;
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

export function TournamentBracketPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(1);

  // Drag-to-pan state
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });

  const loadTournament = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
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

      if (error) throw error;
      setTournament(data as unknown as TournamentData);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading tournament:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  // Connect socket for running tournaments
  const shouldConnect = tournament?.status === 'running';
  const { isConnected } = useTournamentSocket(
    shouldConnect ? id : undefined,
    { onUpdate: loadTournament }
  );

  // Drag-to-pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = viewportRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStart.current = { x: e.pageX, scrollLeft: el.scrollLeft };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !viewportRef.current) return;
    const dx = e.pageX - dragStart.current.x;
    viewportRef.current.scrollLeft = dragStart.current.scrollLeft - dx;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (viewportRef.current) {
      viewportRef.current.style.cursor = 'grab';
      viewportRef.current.style.userSelect = '';
    }
  }, []);

  // Round-robin/swiss: organize matches by round
  const roundNumbers = useMemo(() => {
    if (!tournament?.matches) return [];
    const rounds = new Set(tournament.matches.map(m => m.round_number));
    return Array.from(rounds).sort((a, b) => a - b);
  }, [tournament?.matches]);

  const matchesForRound = useMemo(() => {
    if (!tournament?.matches) return [];
    return tournament.matches.filter(m => m.round_number === selectedRound && !m.is_bye);
  }, [tournament?.matches, selectedRound]);

  // --- Render states ---

  if (loading) {
    return <PageSkeleton />;
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-cyber-dark flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-white mb-4">Tournament not found</h2>
          <Link
            to="/tournaments"
            className="inline-flex items-center gap-2 text-neon-cyan hover:underline"
          >
            <ArrowLeft size={18} />
            Back to Tournaments
          </Link>
        </div>
      </div>
    );
  }

  const status = statusColors[tournament.status] || statusColors.lobby;
  const showBracket = tournament.status === 'running' || tournament.status === 'completed';
  const isRoundBased = tournament.bracket_type === 'round-robin' || tournament.bracket_type === 'swiss';
  const isDoubleElim = tournament.bracket_type === 'double-elimination';

  return (
    <div className="min-h-screen bg-cyber-dark flex flex-col">
      {/* Header Bar */}
      <div className="border-b border-white/10 bg-cyber-navy/80 backdrop-blur-md px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to={`/tournaments/${id}`}
            className="text-white/60 hover:text-white transition-colors flex-shrink-0"
            aria-label="Back to tournament detail"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <Swords size={20} className="text-neon-magenta flex-shrink-0" />
            <h1 className="text-lg font-display font-bold text-white truncate">
              {tournament.name}
            </h1>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${status.bg} ${status.text}`}>
            {tournament.status}
          </span>
          <Badge variant="default" className="flex-shrink-0">
            {bracketLabels[tournament.bracket_type] || tournament.bracket_type}
          </Badge>
          {tournament.total_rounds !== null && (
            <span className="text-sm text-white/40 flex-shrink-0">
              Round {tournament.current_round}/{tournament.total_rounds}
            </span>
          )}
        </div>

        {/* Socket indicator */}
        {tournament.status === 'running' && (
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
      {!showBracket ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/40 text-lg mb-4">
              Bracket will appear when the tournament starts.
            </p>
            <Link
              to={`/tournaments/${id}`}
              className="inline-flex items-center gap-2 text-neon-cyan hover:underline"
            >
              <ArrowLeft size={16} />
              Back to Tournament
            </Link>
          </div>
        </div>
      ) : isRoundBased ? (
        /* Round-robin / Swiss layout */
        <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
          {/* Standings */}
          <GlassCard className="p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Standings</h3>
            <StandingsTable participants={tournament.participants} />
          </GlassCard>

          {/* Round selector */}
          {roundNumbers.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Matches by Round</h3>
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {roundNumbers.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                      selectedRound === r
                        ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30'
                        : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    Round {r}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {matchesForRound.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onClick={() => setSelectedMatch(match)}
                  />
                ))}
                {matchesForRound.length === 0 && (
                  <p className="text-white/30 text-sm col-span-full">No matches in this round.</p>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      ) : (
        /* Bracket viewport (single/double elimination) */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Double elimination note */}
          {isDoubleElim && (
            <div className="px-4 pt-3">
              <div className="bg-neon-magenta/10 border border-neon-magenta/20 rounded-lg px-4 py-2 text-sm text-neon-magenta/80 max-w-xl">
                Double Elimination bracket shown in unified view. Winners and losers bracket matches are displayed by round.
              </div>
            </div>
          )}

          <div
            ref={viewportRef}
            className="flex-1 overflow-x-auto overflow-y-auto p-6 cursor-grab"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <BracketViz
              matches={tournament.matches || []}
              participants={tournament.participants}
              bracketType={tournament.bracket_type}
              status={tournament.status}
              onMatchClick={setSelectedMatch}
            />
          </div>
        </div>
      )}

      {/* Match Detail Modal */}
      <MatchDetailModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
      />
    </div>
  );
}
