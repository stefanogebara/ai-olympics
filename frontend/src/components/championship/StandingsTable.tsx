import { Link } from 'react-router-dom';
import { Trophy, Skull } from 'lucide-react';

interface Participant {
  id: string;
  agent_id: string;
  total_points: number;
  rounds_completed: number;
  current_rank: number | null;
  is_eliminated: boolean;
  agent: { id: string; name: string; slug: string; color: string; elo_rating: number } | null;
  user: { username: string } | null;
}

interface StandingsTableProps {
  participants: Participant[];
  currentRound: number;
  totalRounds: number;
}

const rankColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-gray-300',
  3: 'text-amber-600',
};

export function StandingsTable({ participants, currentRound, totalRounds }: StandingsTableProps) {
  const sorted = [...participants].sort((a, b) => {
    if (a.is_eliminated && !b.is_eliminated) return 1;
    if (!a.is_eliminated && b.is_eliminated) return -1;
    return b.total_points - a.total_points;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left px-4 py-3 text-white/50 font-medium">Rank</th>
            <th className="text-left px-4 py-3 text-white/50 font-medium">Agent</th>
            <th className="text-left px-4 py-3 text-white/50 font-medium">Owner</th>
            <th className="text-right px-4 py-3 text-white/50 font-medium">Points</th>
            <th className="text-right px-4 py-3 text-white/50 font-medium">Rounds</th>
            <th className="text-right px-4 py-3 text-white/50 font-medium">ELO</th>
            <th className="text-center px-4 py-3 text-white/50 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, index) => {
            const rank = p.is_eliminated ? '-' : (p.current_rank || index + 1);
            const rankColor = typeof rank === 'number' ? rankColors[rank] || 'text-white' : 'text-white/40';

            return (
              <tr
                key={p.id}
                className={`border-b border-white/5 transition-colors ${
                  p.is_eliminated
                    ? 'opacity-50 bg-red-500/5'
                    : 'hover:bg-white/5'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {rank === 1 && <Trophy size={14} className="text-yellow-400" />}
                    <span className={`font-bold ${rankColor}`}>
                      {typeof rank === 'number' ? `#${rank}` : rank}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
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
                  </div>
                </td>
                <td className="px-4 py-3 text-white/50">
                  {p.user?.username || '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-neon-cyan">{p.total_points}</span>
                </td>
                <td className="px-4 py-3 text-right text-white/60">
                  {p.rounds_completed}/{totalRounds}
                </td>
                <td className="px-4 py-3 text-right text-white/50">
                  {p.agent?.elo_rating || 1200}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.is_eliminated ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
                      <Skull size={12} />
                      Eliminated
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neon-green/20 text-neon-green">
                      Active
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-8 text-white/40">
          No participants yet
        </div>
      )}
    </div>
  );
}
