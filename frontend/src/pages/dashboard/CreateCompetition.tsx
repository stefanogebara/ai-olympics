import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GlassCard, NeonButton, NeonText, Input, Select } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Trophy, Info, Lock } from 'lucide-react';

// Feature flag: real-money competitions are disabled until legal review + security hardening
const REAL_MONEY_ENABLED = false;

interface DomainOption {
  id: string;
  slug: string;
  name: string;
}

const competitionSchema = z.object({
  name: z.string().min(1, 'Competition name is required').max(100, 'Name must be under 100 characters'),
  domainId: z.string().min(1, 'Please select a domain'),
  entryFee: z.number().min(0, 'Entry fee cannot be negative'),
  maxParticipants: z.number().min(2, 'At least 2 participants required').max(64, 'Maximum 64 participants'),
  scheduledStart: z.string().optional().or(z.literal('')),
});

type CompetitionFormData = z.infer<typeof competitionSchema>;

export function CreateCompetition() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [stakeMode, setStakeMode] = useState<'sandbox' | 'real'>('sandbox');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CompetitionFormData>({
    resolver: zodResolver(competitionSchema),
    defaultValues: {
      name: '',
      domainId: '',
      entryFee: 0,
      maxParticipants: 4,
      scheduledStart: '',
    },
  });

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      const { data, error } = await supabase
        .from('aio_domains')
        .select('id, slug, name')
        .order('name');

      if (error) throw error;
      if (data) {
        setDomains(data);
        if (data.length > 0) setValue('domainId', data[0].id);
      }
    } catch (err) {
      console.error('Failed to load domains:', err);
    }
  };

  const onSubmit = async (data: CompetitionFormData) => {
    setSubmitError('');
    setLoading(true);

    try {
      const { data: result, error: insertError } = await supabase
        .from('aio_competitions')
        .insert({
          name: data.name,
          domain_id: data.domainId || null,
          stake_mode: stakeMode,
          entry_fee: stakeMode === 'real' ? data.entryFee : 0,
          max_participants: data.maxParticipants,
          scheduled_start: data.scheduledStart || null,
          created_by: profile!.id,
          status: 'lobby',
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      navigate(`/competitions/${result.id}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create competition');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/dashboard/competitions')}
        className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to My Competitions
      </button>

      <GlassCard neonBorder className="p-8">
        <h1 className="text-2xl font-display font-bold mb-6">
          Create <NeonText variant="magenta" glow>Competition</NeonText>
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {submitError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {submitError}
            </div>
          )}

          <Input
            label="Competition Name"
            placeholder="e.g. Browser Blitz Championship"
            error={errors.name?.message}
            {...register('name')}
          />

          <Select
            label="Domain"
            error={errors.domainId?.message}
            options={domains.map(d => ({ value: d.id, label: d.name }))}
            {...register('domainId')}
          />

          {/* Stake Mode */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">Stake Mode</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setStakeMode('sandbox')}
                className={`p-4 rounded-xl border transition-all text-left ${
                  stakeMode === 'sandbox'
                    ? 'border-neon-green bg-neon-green/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <p className={`font-semibold ${stakeMode === 'sandbox' ? 'text-neon-green' : 'text-white'}`}>
                  Sandbox
                </p>
                <p className="text-xs text-white/50 mt-1">Free to enter, no prizes</p>
              </button>

              <button
                type="button"
                onClick={() => REAL_MONEY_ENABLED && setStakeMode('real')}
                disabled={!REAL_MONEY_ENABLED}
                className={`p-4 rounded-xl border transition-all text-left relative ${
                  !REAL_MONEY_ENABLED
                    ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                    : stakeMode === 'real'
                    ? 'border-neon-gold bg-neon-gold/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {!REAL_MONEY_ENABLED && (
                  <Lock size={14} className="absolute top-2 right-2 text-white/30" />
                )}
                <p className={`font-semibold ${stakeMode === 'real' ? 'text-neon-gold' : 'text-white'}`}>
                  Real Money
                </p>
                <p className="text-xs text-white/50 mt-1">
                  {REAL_MONEY_ENABLED ? 'Entry fee, real prizes' : 'Coming soon - pending legal review'}
                </p>
              </button>
            </div>
          </div>

          {stakeMode === 'real' && (
            <div>
              <Input
                label="Entry Fee (cents)"
                type="number"
                placeholder="1000"
                error={errors.entryFee?.message}
                {...register('entryFee', { valueAsNumber: true })}
              />
              <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                <Info size={14} />
                <span>10% platform fee applies to prize pool distributions</span>
              </div>
            </div>
          )}

          <Input
            label="Max Participants"
            type="number"
            placeholder="4"
            error={errors.maxParticipants?.message}
            {...register('maxParticipants', { valueAsNumber: true })}
          />

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Scheduled Start (optional)
            </label>
            <input
              type="datetime-local"
              className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white focus:outline-none focus:border-neon-cyan/50 [color-scheme:dark]"
              {...register('scheduledStart')}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <NeonButton type="submit" loading={loading} icon={<Trophy size={18} />}>
              Create Competition
            </NeonButton>
            <NeonButton type="button" variant="ghost" onClick={() => navigate('/dashboard/competitions')}>
              Cancel
            </NeonButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
