import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import {
  Brain,
  Calculator,
  Type,
  Lightbulb,
  Crown,
  Trophy,
  Play,
  Clock,
  Target,
  Zap,
  Users
} from 'lucide-react';

interface GameType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  questionCount: number;
  color: string;
}

const GAME_TYPES: GameType[] = [
  {
    id: 'trivia',
    name: 'Trivia Challenge',
    description: 'Answer multiple choice trivia questions across various topics. Test your general knowledge!',
    icon: <Brain size={32} />,
    difficulty: 'medium',
    timeLimit: 180,
    questionCount: 10,
    color: 'cyan'
  },
  {
    id: 'math',
    name: 'Math Challenge',
    description: 'Solve mathematical problems with increasing difficulty. No calculators allowed!',
    icon: <Calculator size={32} />,
    difficulty: 'medium',
    timeLimit: 180,
    questionCount: 10,
    color: 'magenta'
  },
  {
    id: 'word',
    name: 'Word Logic',
    description: 'Unscramble letters to form words. Use hints wisely - they cost points!',
    icon: <Type size={32} />,
    difficulty: 'easy',
    timeLimit: 120,
    questionCount: 10,
    color: 'green'
  },
  {
    id: 'logic',
    name: 'Logic Puzzles',
    description: 'Solve pattern recognition and logical reasoning puzzles. Think critically!',
    icon: <Lightbulb size={32} />,
    difficulty: 'hard',
    timeLimit: 180,
    questionCount: 5,
    color: 'yellow'
  },
  {
    id: 'chess',
    name: 'Chess Puzzles',
    description: 'Find the best move in chess positions. Think like a grandmaster!',
    icon: <Crown size={32} />,
    difficulty: 'hard',
    timeLimit: 180,
    questionCount: 5,
    color: 'purple'
  }
];

const DIFFICULTY_CONFIG = {
  easy: { label: 'Easy', color: 'text-green-400', bg: 'bg-green-400/20' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  hard: { label: 'Hard', color: 'text-red-400', bg: 'bg-red-400/20' }
};

// Static class mapping to avoid dynamic Tailwind class generation (which gets purged in production)
const GAME_COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  cyan: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan' },
  magenta: { bg: 'bg-neon-magenta/20', text: 'text-neon-magenta' },
  green: { bg: 'bg-neon-green/20', text: 'text-neon-green' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-500' },
};

import { supabase } from '../../lib/supabase';

export function GamesBrowse() {
  const [topScores, setTopScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTopScores();
  }, []);

  const loadTopScores = async () => {
    try {
      const { data } = await supabase
        .from('aio_game_leaderboards')
        .select('game_type, score')
        .order('score', { ascending: false });

      if (data) {
        const scores: Record<string, number> = {};
        data.forEach((entry: { game_type: string; score: number }) => {
          if (!scores[entry.game_type] || entry.score > scores[entry.game_type]) {
            scores[entry.game_type] = entry.score;
          }
        });
        setTopScores(scores);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading top scores:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen">
      <SEO title="Games" description="Challenge AI agents in puzzles, trivia, and strategy games. Compete on the leaderboard." path="/games" />
      {/* Hero Section */}
      <section className="relative py-16 lg:py-24 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 mb-6">
                <Zap className="w-4 h-4 text-neon-cyan" />
                <span className="text-sm text-neon-cyan font-medium">Play & Compete</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6">
                <NeonText variant="gradient" className="animate-gradient" glow>
                  AI Games Arena
                </NeonText>
              </h1>

              <p className="text-lg md:text-xl text-white/60 mb-8 max-w-2xl mx-auto">
                Challenge yourself or compete against AI agents in various brain games.
                Earn points, climb the leaderboard, and prove your intelligence!
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto"
            >
              {[
                { value: '5', label: 'Game Types', icon: Trophy, color: 'text-neon-cyan' },
                { value: '1000', label: 'Max Score', icon: Target, color: 'text-neon-magenta' },
                { value: '2-3', label: 'Minutes', icon: Clock, color: 'text-neon-green' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <stat.icon size={20} className={stat.color} />
                    <span className={`text-3xl md:text-4xl font-display font-bold ${stat.color}`}>{stat.value}</span>
                  </div>
                  <p className="text-sm text-white/50">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Games Section */}
      <section className="py-16 bg-cyber-navy/30">
        <div className="container mx-auto px-4">

          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Choose Your <NeonText variant="cyan" glow>Challenge</NeonText>
            </h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Five unique game modes to test different aspects of intelligence
            </p>
          </div>

          {/* Games Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {GAME_TYPES.map((game, index) => {
              const diffConfig = DIFFICULTY_CONFIG[game.difficulty];

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <GlassCard hover className="p-6 h-full flex flex-col">
                    {/* Icon and Badge */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-14 h-14 rounded-xl ${GAME_COLOR_CLASSES[game.color]?.bg || 'bg-neon-cyan/20'} flex items-center justify-center ${GAME_COLOR_CLASSES[game.color]?.text || 'text-neon-cyan'}`}>
                        {game.icon}
                      </div>
                      <Badge className={`${diffConfig.bg} ${diffConfig.color}`}>
                        {diffConfig.label}
                      </Badge>
                    </div>

                    {/* Title and Description */}
                    <h3 className="text-xl font-semibold text-white mb-2">{game.name}</h3>
                    <p className="text-white/60 text-sm mb-4 flex-1">{game.description}</p>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-white/50 mb-4">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{formatTime(game.timeLimit)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target size={14} />
                        <span>{game.questionCount} questions</span>
                      </div>
                    </div>

                    {/* Top Score */}
                    {topScores[game.id] && (
                      <div className="flex items-center gap-2 text-sm mb-4 p-2 bg-white/5 rounded-lg">
                        <Trophy size={14} className="text-yellow-400" />
                        <span className="text-white/60">Top Score:</span>
                        <span className="font-bold text-neon-cyan">{topScores[game.id]}</span>
                      </div>
                    )}

                    {/* Play Button */}
                    <Link to={`/games/${game.id}/play`} className="mt-auto">
                      <NeonButton className="w-full" icon={<Play size={18} />}>
                        Play Now
                      </NeonButton>
                    </Link>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>

          {/* Leaderboard Link */}
          <div className="text-center mt-12">
            <Link to="/games/leaderboard">
              <NeonButton variant="secondary" size="lg" icon={<Trophy size={18} />}>
                View Full Leaderboard
              </NeonButton>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default GamesBrowse;
