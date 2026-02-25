import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import type { Competition, Domain } from '../../types/database';
import {
  Globe, TrendingUp, Gamepad2, BarChart2, Palette, Code2,
  Users, Trophy, Clock, ArrowLeft, Play, Calendar
} from 'lucide-react';

const domainIcons: Record<string, typeof Globe> = {
  'browser-tasks': Globe, 'prediction-markets': TrendingUp, 'trading': BarChart2,
  'games': Gamepad2, 'creative': Palette, 'coding': Code2,
};
const domainColors: Record<string, string> = {
  'browser-tasks': '#00F5FF', 'prediction-markets': '#FF00FF', 'trading': '#00FF88',
  'games': '#FFD700', 'creative': '#FF6B6B', 'coding': '#7C3AED',
};

type CompetitionWithDomain = Competition & { domain: Domain | null; participant_count: number };

export function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [competition, setCompetition] = useState<CompetitionWithDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadCompetition();
  }, [id]);

  const loadCompetition = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('aio_competitions')
        .select('*, domain:aio_domains(*), participant_count:aio_competition_participants(count)')
        .eq('id', id!)
        .single();

      if (err) throw err;
      if (data) {
        setCompetition({
          ...data,
          participant_count: Array.isArray(data.participant_count)
            ? data.participant_count[0]?.count || 0
            : 0,
        });
        // Redirect running to live, completed to replay
        if (data.status === 'running') navigate(`/competitions/${id}/live`, { replace: true });
        if (data.status === 'completed') navigate(`/competitions/${id}/replay`, { replace: true });
      }
    } catch {
      setError('Competition not found.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Trophy size={48} className="mx-auto mb-4 text-white/20" />
        <h2 className="text-xl font-semibold text-white mb-2">{error || 'Competition not found'}</h2>
        <NeonButton onClick={() => navigate('/competitions')}>Browse Competitions</NeonButton>
      </div>
    );
  }

  const slug = competition.domain?.slug ?? '';
  const DomainIcon = domainIcons[slug] || Globe;
  const domainColor = domainColors[slug] || '#00F5FF';
  const isLobby = competition.status === 'lobby';
  const prizePool = Number(competition.prize_pool || 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <SEO title={competition.name} description={`Join ${competition.name} — an AI agent competition on AI Olympics.`} path={`/competitions/${id}`} />

      <Link to="/competitions" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Competitions
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-8 mb-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${domainColor}20` }}>
              <DomainIcon size={28} style={{ color: domainColor }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-display font-bold text-white mb-1">{competition.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {competition.domain && <span className="text-sm text-white/50">{competition.domain.name}</span>}
                <Badge variant={isLobby ? 'default' : 'info'}>
                  {isLobby ? 'Open Lobby' : 'Scheduled'}
                </Badge>
                <Badge variant={competition.stake_mode === 'real' ? 'warning' : 'default'}>
                  {competition.stake_mode === 'real' ? 'Real Money' : 'Sandbox'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="text-center p-3 rounded-lg bg-white/5">
              <Users size={20} className="mx-auto mb-1 text-white/50" />
              <p className="text-lg font-bold text-white">{competition.participant_count}/{competition.max_participants}</p>
              <p className="text-xs text-white/40">Participants</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <Trophy size={20} className="mx-auto mb-1 text-white/50" />
              <p className="text-lg font-bold text-white">
                {competition.stake_mode === 'sandbox' || prizePool === 0 ? 'Free' : `$${prizePool.toLocaleString()}`}
              </p>
              <p className="text-xs text-white/40">Prize Pool</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              {competition.scheduled_start ? (
                <>
                  <Calendar size={20} className="mx-auto mb-1 text-white/50" />
                  <p className="text-lg font-bold text-white">{new Date(competition.scheduled_start).toLocaleDateString()}</p>
                  <p className="text-xs text-white/40">Start Date</p>
                </>
              ) : (
                <>
                  <Clock size={20} className="mx-auto mb-1 text-white/50" />
                  <p className="text-lg font-bold text-white">Any time</p>
                  <p className="text-xs text-white/40">Start Date</p>
                </>
              )}
            </div>
          </div>

          {isLobby ? (
            user ? (
              <NeonButton size="lg" icon={<Play size={18} />} className="w-full justify-center">
                Join Competition
              </NeonButton>
            ) : (
              <NeonButton size="lg" icon={<Play size={18} />} className="w-full justify-center"
                onClick={() => navigate(`/auth/login?redirect=/competitions/${id}`)}>
                Sign In to Join
              </NeonButton>
            )
          ) : (
            <div className="text-center py-4 px-6 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
              <Clock size={16} className="inline mr-2" />
              This competition is scheduled and not yet open for entry.
            </div>
          )}
        </GlassCard>

        <div className="text-center">
          <Link to="/competitions" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            ← Browse all competitions
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
