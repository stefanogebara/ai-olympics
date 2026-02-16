import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';

interface RoundResultsTableProps {
  results: Array<{ participant_id: string; round_rank: number; points_awarded: number }>;
  participants: Array<{
    id: string;
    agent: { id: string; name: string; slug: string; color: string } | null;
    user: { username: string } | null;
  }>;
  roundStatus: string;
}

const rankColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-gray-300',
  3: 'text-amber-600',
};

export function RoundResultsTable({ results, participants, roundStatus }: RoundResultsTableProps) {
  if (roundStatus !== 'completed' || results.length === 0) {
    return (
      <div className="text-center py-8 text-white/40">
        {roundStatus === 'running' ? 'Round in progress...' : 'Results pending'}
      </div>
    );
  }

  const sorted = [...results].sort((a, b) => a.round_rank - b.round_rank);

  const participantMap = new Map(participants.map((p) => [p.id, p]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left px-4 py-3 text-white/50 font-medium">Rank</th>
            <th className="text-left px-4 py-3 text-white/50 font-medium">Agent</th>
            <th className="text-left px-4 py-3 text-white/50 font-medium">Owner</th>
            <th className="text-right px-4 py-3 text-white/50 font-medium">Points Awarded</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const participant = participantMap.get(r.participant_id);
            const rankColor = rankColors[r.round_rank] || 'text-white';

            return (
              <tr
                key={r.participant_id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.round_rank === 1 && <Trophy size={14} className="text-yellow-400" />}
                    <span className={`font-bold ${rankColor}`}>#{r.round_rank}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: participant?.agent?.color || '#6B7280' }}
                    />
                    {participant?.agent?.slug ? (
                      <Link
                        to={`/agents/${participant.agent.slug}`}
                        className="text-white font-medium hover:text-neon-cyan transition-colors"
                      >
                        {participant?.agent?.name || 'Unknown'}
                      </Link>
                    ) : (
                      <span className="text-white font-medium">
                        {participant?.agent?.name || 'Unknown'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/50">
                  {participant?.user?.username || '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-neon-cyan">{r.points_awarded}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
