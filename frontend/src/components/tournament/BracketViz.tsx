import { useMemo } from 'react';

export interface Match {
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
}

export interface Participant {
  agent_id: string;
  seed_number: number | null;
  final_placement: number | null;
  matches_won: number;
  matches_lost: number;
  total_score: number;
  agent: { id: string; name: string; slug: string; color: string; elo_rating: number } | null;
}

interface BracketVizProps {
  matches: Match[];
  participants: Participant[];
  bracketType: string;
  status: string;
  onMatchClick?: (match: Match) => void;
}

// ============================================================================
// BRACKET CONNECTOR COLUMN
// ============================================================================

function BracketConnectorColumn({ matchCount }: { matchCount: number }) {
  const pairCount = Math.max(1, Math.floor(matchCount / 2));
  return (
    <div className="flex flex-col justify-around min-w-[32px]">
      {Array.from({ length: pairCount }).map((_, i) => (
        <div key={i} className="flex flex-col flex-1">
          <div className="flex-1 border-r-2 border-t-2 border-white/15 rounded-tr" />
          <div className="flex-1 border-r-2 border-b-2 border-white/15 rounded-br" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SINGLE ELIMINATION BRACKET
// ============================================================================

function SingleEliminationBracket({
  matches,
  participants,
  onMatchClick,
}: {
  matches: Match[];
  participants: Participant[];
  onMatchClick?: (match: Match) => void;
}) {
  const { rounds, maxRound } = useMemo(() => {
    const roundMap = new Map<number, Match[]>();
    let max = 0;
    for (const m of matches) {
      if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
      roundMap.get(m.round_number)!.push(m);
      if (m.round_number > max) max = m.round_number;
    }
    // Sort matches within each round by match_number
    for (const [, ms] of roundMap) {
      ms.sort((a, b) => a.match_number - b.match_number);
    }
    return { rounds: roundMap, maxRound: max };
  }, [matches]);

  // Build seed lookup
  const seedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of participants) {
      if (p.seed_number && p.agent_id) {
        map.set(p.agent_id, p.seed_number);
      }
    }
    return map;
  }, [participants]);

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-white/40">
        Bracket will appear when the tournament starts.
      </div>
    );
  }

  const roundNames = (total: number, current: number): string => {
    const fromEnd = total - current;
    if (fromEnd === 0) return 'Finals';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return `Round ${current}`;
  };

  const roundNums = Array.from({ length: maxRound }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max">
        {roundNums.map((roundNum, idx) => {
          const roundMatches = rounds.get(roundNum) || [];
          const isFirstRound = roundNum === 1;
          return (
            <div key={roundNum} className="flex">
              {/* Connector from previous round */}
              {idx > 0 && (
                <BracketConnectorColumn
                  matchCount={rounds.get(roundNums[idx - 1])?.length || 0}
                />
              )}

              {/* Round column */}
              <div className="flex flex-col gap-2 min-w-[220px]">
                <h4 className="text-xs font-semibold text-neon-cyan uppercase tracking-wider mb-2 text-center">
                  {roundNames(maxRound, roundNum)}
                </h4>
                <div className="flex flex-col justify-around flex-1 gap-4">
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      seedMap={isFirstRound ? seedMap : undefined}
                      onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MATCH CARD (exported)
// ============================================================================

export function MatchCard({
  match,
  seedMap,
  onClick,
}: {
  match: Match;
  seedMap?: Map<string, number>;
  onClick?: () => void;
}) {
  const isCompleted = match.status === 'completed';
  const isBye = match.is_bye;
  const isRunning = match.status === 'running';

  return (
    <div
      className={`bracket-match rounded-lg border overflow-hidden transition-colors ${
        isRunning
          ? 'border-neon-green/50 bg-neon-green/5 animate-glow-pulse'
          : isCompleted
          ? 'border-white/10 bg-cyber-elevated/50'
          : 'border-white/5 bg-cyber-dark/50'
      } ${onClick ? 'cursor-pointer hover:border-neon-cyan/40 hover:bg-white/5' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <MatchSlot
        agent={match.agent_1}
        score={match.agent_1_score}
        isWinner={match.winner_id === match.agent_1_id && match.agent_1_id !== null}
        isBye={false}
        seed={seedMap?.get(match.agent_1_id || '')}
      />
      <div className="border-t border-white/5" />
      <MatchSlot
        agent={match.agent_2}
        score={match.agent_2_score}
        isWinner={match.winner_id === match.agent_2_id && match.agent_2_id !== null}
        isBye={isBye && !match.agent_2}
        seed={seedMap?.get(match.agent_2_id || '')}
      />
      {isRunning && (
        <div className="px-2 py-1 bg-neon-green/10 text-neon-green text-[10px] font-medium text-center uppercase tracking-wider">
          Live
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MATCH SLOT (exported)
// ============================================================================

export function MatchSlot({
  agent,
  score,
  isWinner,
  isBye,
  seed,
}: {
  agent: { id: string; name: string; color: string } | null;
  score: number | null;
  isWinner: boolean;
  isBye: boolean;
  seed?: number;
}) {
  if (isBye) {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-white/20 text-sm italic">
        BYE
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-white/20 text-sm">
        TBD
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 ${
        isWinner ? 'bg-neon-cyan/5' : ''
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {seed !== undefined && (
          <span className="text-[10px] text-white/30 w-4 text-right flex-shrink-0">{seed}</span>
        )}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: agent.color }}
        />
        <span
          className={`text-sm truncate ${
            isWinner ? 'text-neon-cyan font-semibold' : 'text-white/70'
          }`}
        >
          {agent.name}
        </span>
      </div>
      {score !== null && (
        <span className={`text-sm ml-2 font-mono ${isWinner ? 'text-neon-cyan' : 'text-white/40'}`}>
          {score}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// STANDINGS TABLE (for round-robin and swiss)
// ============================================================================

export function StandingsTable({ participants }: { participants: Participant[] }) {
  const sorted = useMemo(
    () => [...participants].sort((a, b) => (a.final_placement || 999) - (b.final_placement || 999)),
    [participants]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/50 text-left">
            <th className="py-3 px-4 font-medium">#</th>
            <th className="py-3 px-4 font-medium">Agent</th>
            <th className="py-3 px-4 font-medium text-center">W</th>
            <th className="py-3 px-4 font-medium text-center">L</th>
            <th className="py-3 px-4 font-medium text-center">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => (
            <tr
              key={p.agent_id}
              className="border-b border-white/5 hover:bg-white/5 transition-colors"
            >
              <td className="py-3 px-4 text-white/60">
                {p.final_placement || idx + 1}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: p.agent?.color || '#6B7280' }}
                  />
                  <span className="text-white font-medium">
                    {p.agent?.name || 'Unknown'}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-center text-neon-green">{p.matches_won}</td>
              <td className="py-3 px-4 text-center text-red-400">{p.matches_lost}</td>
              <td className="py-3 px-4 text-center text-white/80 font-mono">{p.total_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BracketViz({ matches, participants, bracketType, status, onMatchClick }: BracketVizProps) {
  if (bracketType === 'single-elimination' || bracketType === 'double-elimination') {
    return <SingleEliminationBracket matches={matches} participants={participants} onMatchClick={onMatchClick} />;
  }

  // Round-robin and swiss show standings table + match results
  return (
    <div className="space-y-6">
      <StandingsTable participants={participants} />

      {matches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
            Match Results
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {matches
              .filter(m => !m.is_bye)
              .map((match) => (
                <MatchCard key={match.id} match={match} onClick={onMatchClick ? () => onMatchClick(match) : undefined} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
