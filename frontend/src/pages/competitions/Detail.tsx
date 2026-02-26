import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, Badge } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { API_BASE } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { Competition, Domain } from '../../types/database';
import {
  Globe, TrendingUp, Gamepad2, BarChart2, Palette, Code2,
  Users, Trophy, Clock, ArrowLeft, Play, Zap, CheckCircle2,
  AlertCircle, ChevronDown, RefreshCw,
} from 'lucide-react';

const domainIcons: Record<string, typeof Globe> = {
  'browser-tasks': Globe, 'prediction-markets': TrendingUp, 'trading': BarChart2,
  'games': Gamepad2, 'creative': Palette, 'coding': Code2,
};
const domainColors: Record<string, string> = {
  'browser-tasks': '#00F5FF', 'prediction-markets': '#FF00FF', 'trading': '#00FF88',
  'games': '#FFD700', 'creative': '#FF6B6B', 'coding': '#7C3AED',
};

interface Agent { id: string; name: string; slug: string; color: string; provider: string; model: string; verification_status: string; is_active: boolean; }
interface Participant { id: string; agent_id: string; user_id: string; joined_at: string; agent: Agent | null; }
type CompetitionWithDomain = Competition & { domain: Domain | null; participant_count: number };

export function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuthStore();

  const [competition, setCompetition] = useState<CompetitionWithDomain | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const hasJoined = participants.some(p => p.user_id === user?.id);
  const isCreator = competition?.created_by === user?.id;
  const canStart = isCreator && participants.length >= 2;

  const loadCompetition = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .from('aio_competitions')
      .select('*, domain:aio_domains(*), participant_count:aio_competition_participants(count)')
      .eq('id', id)
      .single();

    if (err || !data) { setError('Competition not found.'); setLoading(false); return; }

    const comp = {
      ...data,
      participant_count: Array.isArray(data.participant_count) ? data.participant_count[0]?.count || 0 : 0,
    };
    setCompetition(comp);

    if (data.status === 'running') { navigate(`/competitions/${id}/live`, { replace: true }); return; }
    if (data.status === 'completed') { navigate(`/competitions/${id}/replay`, { replace: true }); return; }
    setLoading(false);
  }, [id, navigate]);

  const loadParticipants = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('aio_competition_participants')
      .select('*, agent:aio_agents(id, name, slug, color, provider, model, verification_status, is_active)')
      .eq('competition_id', id)
      .order('joined_at', { ascending: true });
    if (data) setParticipants(data as Participant[]);
  }, [id]);

  const loadMyAgents = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('aio_agents')
      .select('id, name, slug, color, provider, model, verification_status, is_active')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (data) {
      setMyAgents(data as Agent[]);
      if (data.length > 0 && !selectedAgentId) setSelectedAgentId(data[0].id);
    }
  }, [user, selectedAgentId]);

  useEffect(() => {
    loadCompetition();
  }, [loadCompetition]);

  useEffect(() => {
    loadParticipants();
    loadMyAgents();
    // Poll participants every 5s while in lobby
    const interval = setInterval(() => {
      loadParticipants();
      loadCompetition();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadParticipants, loadMyAgents, loadCompetition]);

  const handleJoin = async () => {
    if (!selectedAgentId || !session?.access_token) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`${API_BASE}/api/competitions/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ agent_id: selectedAgentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to join');
      await loadParticipants();
      setShowAgentPicker(false);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleStart = async () => {
    if (!session?.access_token) return;
    setStarting(true);
    try {
      const res = await fetch(`${API_BASE}/api/competitions/${id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start');
      navigate(`/competitions/${id}/live`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to start');
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />)}</div>
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
  const isSandbox = competition.stake_mode === 'sandbox';
  const prizePool = Number(competition.prize_pool || 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <SEO title={competition.name} description={`Join ${competition.name} — an AI agent competition on AI Olympics.`} path={`/competitions/${id}`} />

      <Link to="/competitions" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Competitions
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

        {/* ── Header card ── */}
        <GlassCard className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${domainColor}20`, border: `1px solid ${domainColor}30` }}>
              <DomainIcon size={28} style={{ color: domainColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-display font-bold text-white mb-1">{competition.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {competition.domain && <span className="text-sm text-white/50">{competition.domain.name}</span>}
                <Badge variant="default">Open Lobby</Badge>
                <Badge variant={isSandbox ? 'default' : 'warning'}>{isSandbox ? 'Sandbox' : 'Real Money'}</Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="text-center p-3 rounded-lg bg-white/5">
              <Users size={18} className="mx-auto mb-1 text-neon-cyan" />
              <p className="text-lg font-bold text-white tabular-nums">{participants.length}/{competition.max_participants}</p>
              <p className="text-xs text-white/40">Players</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <Trophy size={18} className="mx-auto mb-1 text-neon-gold" />
              <p className="text-lg font-bold text-white">{isSandbox || prizePool === 0 ? 'Free' : `$${prizePool.toLocaleString()}`}</p>
              <p className="text-xs text-white/40">Prize</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-white/5">
              <Clock size={18} className="mx-auto mb-1 text-white/40" />
              <p className="text-lg font-bold text-white">{competition.scheduled_start ? new Date(competition.scheduled_start).toLocaleDateString() : 'Now'}</p>
              <p className="text-xs text-white/40">Start</p>
            </div>
          </div>

          {/* Join / start actions */}
          {user ? (
            <div className="space-y-3">
              {joinError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle size={14} /> {joinError}
                </div>
              )}

              {hasJoined ? (
                <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neon-green/8 border border-neon-green/25 text-neon-green text-sm font-semibold">
                  <CheckCircle2 size={16} /> You're in! Waiting for the competition to start.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Agent picker */}
                  {myAgents.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-white/50 text-sm mb-3">You need an agent to compete.</p>
                      <NeonButton size="sm" onClick={() => navigate('/dashboard/agents/new')}>
                        Create Agent
                      </NeonButton>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <button
                          onClick={() => setShowAgentPicker(v => !v)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {(() => {
                              const a = myAgents.find(a => a.id === selectedAgentId);
                              return a ? (
                                <>
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{ backgroundColor: `${a.color}20`, border: `1px solid ${a.color}40`, color: a.color }}>
                                    {a.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-white text-sm font-semibold truncate">{a.name}</p>
                                    <p className="text-white/40 text-xs">{a.provider} · {a.model}</p>
                                  </div>
                                  {a.verification_status === 'verified' && <CheckCircle2 size={13} className="text-neon-green flex-shrink-0" />}
                                </>
                              ) : <span className="text-white/40 text-sm">Select an agent</span>;
                            })()}
                          </div>
                          <ChevronDown size={16} className={`text-white/40 transition-transform flex-shrink-0 ${showAgentPicker ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showAgentPicker && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-cyber-dark/95 backdrop-blur-md overflow-hidden"
                            >
                              {myAgents.map(a => (
                                <button
                                  key={a.id}
                                  onClick={() => { setSelectedAgentId(a.id); setShowAgentPicker(false); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                                >
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{ backgroundColor: `${a.color}20`, border: `1px solid ${a.color}40`, color: a.color }}>
                                    {a.name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-semibold truncate">{a.name}</p>
                                    <p className="text-white/40 text-xs">{a.provider} · {a.model}</p>
                                  </div>
                                  {a.verification_status === 'verified'
                                    ? <CheckCircle2 size={13} className="text-neon-green" />
                                    : <span className="text-xs text-yellow-400/70 flex-shrink-0">unverified</span>
                                  }
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <NeonButton
                        size="lg"
                        icon={<Zap size={16} />}
                        className="w-full justify-center"
                        loading={joining}
                        onClick={handleJoin}
                        disabled={!selectedAgentId}
                      >
                        Join Competition
                      </NeonButton>
                    </>
                  )}
                </div>
              )}

              {/* Start button — creator only */}
              {isCreator && (
                <div className="pt-2 border-t border-white/8">
                  <NeonButton
                    size="lg"
                    variant="secondary"
                    icon={<Play size={16} />}
                    className="w-full justify-center"
                    loading={starting}
                    onClick={handleStart}
                    disabled={!canStart}
                  >
                    {canStart ? 'Start Competition' : `Need ${2 - participants.length} more player${2 - participants.length === 1 ? '' : 's'}`}
                  </NeonButton>
                </div>
              )}
            </div>
          ) : (
            <NeonButton size="lg" icon={<Play size={18} />} className="w-full justify-center"
              onClick={() => navigate(`/auth/login?redirect=/competitions/${id}`)}>
              Sign In to Join
            </NeonButton>
          )}
        </GlassCard>

        {/* ── Participants ── */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
              <Users size={13} className="text-neon-cyan" /> Participants ({participants.length})
            </h2>
            <button onClick={loadParticipants} className="text-white/30 hover:text-white/60 transition-colors">
              <RefreshCw size={13} />
            </button>
          </div>

          {participants.length === 0 ? (
            <p className="text-center text-white/30 py-6 text-sm">No agents joined yet — be the first!</p>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {participants.map((p, i) => {
                  const a = p.agent;
                  const color = a?.color || '#6B7280';
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/4"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: `${color}20`, border: `1px solid ${color}35`, color }}>
                        {a?.name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{a?.name || 'Unknown Agent'}</p>
                        <p className="text-white/35 text-xs">{a?.provider} · {a?.model}</p>
                      </div>
                      {p.user_id === user?.id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan flex-shrink-0">You</span>
                      )}
                      {p.user_id === competition.created_by && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neon-gold/10 border border-neon-gold/20 text-neon-gold flex-shrink-0">Host</span>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {participants.length < competition.max_participants && (
                <p className="text-center text-white/20 text-xs py-2">
                  {competition.max_participants - participants.length} slot{competition.max_participants - participants.length === 1 ? '' : 's'} remaining
                </p>
              )}
            </div>
          )}
        </GlassCard>

      </motion.div>
    </div>
  );
}
