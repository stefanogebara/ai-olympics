import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  ArrowLeft,
  Play,
  Trophy,
  Clock,
  Target,
  RefreshCw,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

interface GameResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  timeSpent: number;
  answers: Array<{
    correct: boolean;
    points?: number;
  }>;
}

const GAME_INFO: Record<string, { name: string; description: string; color: string }> = {
  trivia: { name: 'Trivia Challenge', description: 'Answer 10 multiple choice questions', color: 'cyan' },
  math: { name: 'Math Challenge', description: 'Solve 10 math problems', color: 'magenta' },
  word: { name: 'Word Logic', description: 'Unscramble 10 words', color: 'green' },
  logic: { name: 'Logic Puzzles', description: 'Solve 5 pattern puzzles', color: 'yellow' },
  chess: { name: 'Chess Puzzles', description: 'Find the best move in 5 positions', color: 'purple' }
};

import { API_BASE } from '../../lib/api';
const TASK_BASE = API_BASE;

export function GamesPlay() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, session } = useAuthStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const gameInfo = type ? GAME_INFO[type] : null;

  useEffect(() => {
    if (!gameInfo) {
      navigate('/games');
    }
  }, [gameInfo, navigate]);

  useEffect(() => {
    // Listen for completion messages from the game iframe via postMessage
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object') {
        const { type: msgType, data } = event.data;

        if (msgType && msgType.includes('COMPLETE')) {
          handleGameComplete(data);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleGameComplete = async (data: any) => {
    if (gameState === 'finished') return;

    const gameResult: GameResult = {
      score: data.score || 0,
      correctCount: data.correctCount || 0,
      totalQuestions: data.totalQuestions || data.totalPuzzles || data.totalProblems || 10,
      timeSpent: data.completionTime || 0,
      answers: data.answers || []
    };

    setResult(gameResult);
    setGameState('finished');

    // Submit score if authenticated
    if (isAuthenticated && user) {
      await submitScore(gameResult);
    }
  };

  const submitScore = async (gameResult: GameResult) => {
    if (!type) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/games/${type}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          score: gameResult.score,
          correctCount: gameResult.correctCount,
          totalQuestions: gameResult.totalQuestions,
          timeSpent: gameResult.timeSpent
        })
      });

      if (!response.ok) {
        console.error('Failed to submit score');
      }
    } catch (error) {
      console.error('Error submitting score:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const startGame = () => {
    setGameState('playing');
    setResult(null);
    setError(null);
    setIframeLoaded(false);

    // Timeout: if iframe doesn't load in 15 seconds, show error
    setTimeout(() => {
      setIframeLoaded((loaded) => {
        if (!loaded) {
          setError('Game failed to load. The game server may be unavailable. Try opening in a new tab.');
          setGameState('ready');
        }
        return loaded;
      });
    }, 15000);
  };

  const playAgain = () => {
    setGameState('ready');
    setResult(null);
    setError(null);
  };

  if (!gameInfo || !type) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl text-white">Game not found</h1>
        <Link to="/games" className="text-neon-cyan hover:underline mt-4 inline-block">
          Back to Games
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/games">
          <NeonButton variant="ghost" size="sm" icon={<ArrowLeft size={18} />}>
            Back
          </NeonButton>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold">
            <NeonText variant={gameInfo.color as any} glow>{gameInfo.name}</NeonText>
          </h1>
          <p className="text-white/60 text-sm">{gameInfo.description}</p>
        </div>
      </div>

      {/* Ready State */}
      {gameState === 'ready' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="max-w-2xl mx-auto p-8 text-center">
            <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-neon-${gameInfo.color}/20 flex items-center justify-center`}>
              <Play size={40} className={`text-neon-${gameInfo.color}`} />
            </div>

            <h2 className="text-2xl font-bold text-white mb-4">Ready to Play?</h2>
            <p className="text-white/60 mb-6">{gameInfo.description}</p>

            <div className="flex justify-center gap-6 mb-8">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neon-cyan mb-1">
                  <Target size={16} />
                  <span className="font-bold">1000</span>
                </div>
                <span className="text-xs text-white/50">Max Score</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neon-magenta mb-1">
                  <Clock size={16} />
                  <span className="font-bold">3 min</span>
                </div>
                <span className="text-xs text-white/50">Time Limit</span>
              </div>
            </div>

            {!isAuthenticated && (
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm mb-6">
                <AlertCircle size={16} />
                <span>Sign in to save your score to the leaderboard</span>
              </div>
            )}

            <NeonButton onClick={startGame} size="lg" icon={<Play size={20} />}>
              Start Game
            </NeonButton>
          </GlassCard>
        </motion.div>
      )}

      {/* Playing State */}
      {gameState === 'playing' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-4xl mx-auto"
        >
          <GlassCard className="p-4">
            <div className="aspect-[4/3] w-full bg-cyber-dark rounded-lg overflow-hidden relative">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-cyber-dark z-10">
                  <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mb-4" />
                  <p className="text-white/60">Loading game...</p>
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={`${TASK_BASE}/tasks/${type}`}
                className="w-full h-full border-0"
                title={gameInfo.name}
                allow="autoplay"
                onLoad={() => setIframeLoaded(true)}
                onError={() => {
                  setError('Game failed to load. Try opening in a new tab.');
                  setGameState('ready');
                }}
              />
            </div>
            <div className="flex justify-between items-center mt-4 text-sm text-white/60">
              <button
                onClick={() => { setGameState('ready'); setIframeLoaded(false); }}
                className="text-white/60 hover:text-white transition-colors"
              >
                Quit Game
              </button>
              <a
                href={`${TASK_BASE}/tasks/${type}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-neon-cyan transition-colors"
              >
                Open in new tab <ExternalLink size={14} />
              </a>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Finished State */}
      {gameState === 'finished' && result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <GlassCard className="max-w-2xl mx-auto p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
              <Trophy size={40} className="text-black" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Game Complete!</h2>

            <div className="text-5xl font-bold text-neon-cyan my-6">
              {result.score}
              <span className="text-2xl text-white/40">/1000</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-neon-green">{result.correctCount}</div>
                <div className="text-xs text-white/50">Correct</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{result.totalQuestions}</div>
                <div className="text-xs text-white/50">Total</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-neon-magenta">{result.timeSpent.toFixed(1)}s</div>
                <div className="text-xs text-white/50">Time</div>
              </div>
            </div>

            {/* Accuracy Bar */}
            <div className="mb-8">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/60">Accuracy</span>
                <span className="text-neon-cyan">
                  {Math.round((result.correctCount / result.totalQuestions) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-neon-cyan to-neon-magenta rounded-full transition-all duration-1000"
                  style={{ width: `${(result.correctCount / result.totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-white/60 mb-6">
                <RefreshCw size={16} className="animate-spin" />
                <span>Saving score...</span>
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <NeonButton onClick={playAgain} icon={<RefreshCw size={18} />}>
                Play Again
              </NeonButton>
              <Link to="/games/leaderboard">
                <NeonButton variant="secondary" icon={<Trophy size={18} />}>
                  Leaderboard
                </NeonButton>
              </Link>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Error State */}
      {error && (
        <GlassCard className="max-w-md mx-auto p-6 text-center mt-6 border-red-500/30">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <NeonButton onClick={playAgain} variant="secondary">
            Try Again
          </NeonButton>
        </GlassCard>
      )}
    </div>
  );
}

export default GamesPlay;
