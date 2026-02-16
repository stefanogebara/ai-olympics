import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Swords } from 'lucide-react';

interface MatchAgent {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface MatchData {
  id: string;
  round_number: number;
  match_number: number;
  agent_1: MatchAgent | null;
  agent_2: MatchAgent | null;
  agent_1_score: number | null;
  agent_2_score: number | null;
  winner_id: string | null;
  agent_1_id: string | null;
  agent_2_id: string | null;
  is_bye: boolean;
  status: string;
}

interface MatchDetailModalProps {
  match: MatchData | null;
  onClose: () => void;
}

export function MatchDetailModal({ match, onClose }: MatchDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    if (match && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) focusable[0].focus();
    }
  }, [match]);

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: 'Pending', color: 'text-white/50' },
    running: { text: 'In Progress', color: 'text-neon-green' },
    completed: { text: 'Completed', color: 'text-neon-cyan' },
  };

  return (
    <AnimatePresence>
      {match && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            className="relative bg-cyber-elevated/95 backdrop-blur-md border border-white/10 rounded-xl p-6 w-full max-w-md"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Match detail: Round ${match.round_number}, Match ${match.match_number}`}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
              <Swords size={20} className="text-neon-magenta" />
              <h3 className="text-lg font-display font-bold text-white">
                Round {match.round_number} &middot; Match {match.match_number}
              </h3>
            </div>

            {/* Status */}
            <div className="mb-6 text-center">
              <span className={`text-sm font-medium ${statusLabel[match.status]?.color || 'text-white/50'}`}>
                {statusLabel[match.status]?.text || match.status}
              </span>
            </div>

            {/* Agent 1 */}
            <AgentRow
              agent={match.agent_1}
              score={match.agent_1_score}
              isWinner={match.winner_id === match.agent_1_id && match.agent_1_id !== null}
              isBye={false}
            />

            <div className="text-center text-white/30 text-xs font-bold my-3">VS</div>

            {/* Agent 2 */}
            <AgentRow
              agent={match.agent_2}
              score={match.agent_2_score}
              isWinner={match.winner_id === match.agent_2_id && match.agent_2_id !== null}
              isBye={match.is_bye && !match.agent_2}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AgentRow({
  agent,
  score,
  isWinner,
  isBye,
}: {
  agent: MatchAgent | null;
  score: number | null;
  isWinner: boolean;
  isBye: boolean;
}) {
  if (isBye) {
    return (
      <div className="flex items-center justify-center px-4 py-4 rounded-lg bg-white/5 text-white/20 italic">
        BYE
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center px-4 py-4 rounded-lg bg-white/5 text-white/20">
        TBD
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between px-4 py-4 rounded-lg transition-colors ${
        isWinner ? 'bg-neon-cyan/10 border border-neon-cyan/30' : 'bg-white/5 border border-white/5'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: agent.color }}
        />
        <Link
          to={`/agents/${agent.slug}`}
          className="text-white font-medium hover:text-neon-cyan transition-colors truncate"
        >
          {agent.name}
        </Link>
        {isWinner && <Trophy size={16} className="text-neon-cyan flex-shrink-0" />}
      </div>
      {score !== null && (
        <span className={`text-lg font-mono font-bold ml-3 ${isWinner ? 'text-neon-cyan' : 'text-white/50'}`}>
          {score}
        </span>
      )}
    </div>
  );
}
