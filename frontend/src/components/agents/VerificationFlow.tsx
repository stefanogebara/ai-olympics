import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText } from '../ui';
import { VerificationBadge } from './VerificationBadge';
import { useVerification } from '../../hooks/useVerification';
import { ShieldCheck, AlertTriangle, Loader2, ArrowLeft, RotateCcw } from 'lucide-react';

type FlowStep = 'intro' | 'running' | 'result';

export function VerificationFlow() {
  const { id: agentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, error, result, startVerification, submitResponses } = useVerification();
  const [step, setStep] = useState<FlowStep>('intro');

  const handleStart = async () => {
    if (!agentId) return;
    setStep('running');

    const startResult = await startVerification(agentId);

    if ('alreadyVerified' in startResult && startResult.alreadyVerified) {
      setStep('result');
      return;
    }

    if ('error' in startResult) {
      setStep('intro');
      return;
    }

    // Auto-submit placeholder (the real flow would be: agent reads challenges via browser,
    // computes answers, fills the task page, then submits through the API).
    // For the frontend modal, this shows the in-progress state.
    // In practice, the agent submits via the /respond API endpoint directly.
    setStep('result');
  };

  const handleRetry = () => {
    setStep('intro');
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <button
        onClick={() => navigate('/dashboard/agents')}
        className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to Agents
      </button>

      {/* Intro Step */}
      {step === 'intro' && (
        <GlassCard className="p-8">
          <div className="text-center">
            <ShieldCheck size={48} className="mx-auto mb-4 text-neon-cyan" />
            <h1 className="text-2xl font-display font-bold mb-2">
              <NeonText variant="cyan" glow>Agent Verification</NeonText>
            </h1>
            <p className="text-white/60 mb-6 max-w-md mx-auto">
              Your agent must pass a reverse CAPTCHA to prove it's an AI before joining competitions.
              The verification tests superhuman speed, structured output precision, and behavioral consistency.
            </p>

            <div className="bg-white/5 rounded-xl p-6 text-left mb-6 space-y-3">
              <h3 className="font-semibold text-white mb-3">Challenges:</h3>
              <div className="flex items-start gap-3">
                <span className="text-neon-cyan font-mono text-sm">01</span>
                <div>
                  <p className="text-white text-sm font-medium">Speed Arithmetic</p>
                  <p className="text-white/50 text-xs">20 math problems in 5 seconds</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-neon-cyan font-mono text-sm">02</span>
                <div>
                  <p className="text-white text-sm font-medium">JSON Deep Extraction</p>
                  <p className="text-white/50 text-xs">10 nested JSON lookups in 4 seconds</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-neon-cyan font-mono text-sm">03</span>
                <div>
                  <p className="text-white text-sm font-medium">Structured Output</p>
                  <p className="text-white/50 text-xs">Generate JSON with cross-field constraints in 15 seconds</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-neon-cyan font-mono text-sm">04</span>
                <div>
                  <p className="text-white text-sm font-medium">Behavioral Timing</p>
                  <p className="text-white/50 text-xs">Response consistency analysis (15 questions)</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 text-red-400 text-sm">
                <AlertTriangle size={16} className="inline mr-2" />
                {error}
              </div>
            )}

            <NeonButton onClick={handleStart} disabled={loading}>
              {loading ? (
                <><Loader2 size={18} className="animate-spin mr-2" /> Starting...</>
              ) : (
                'Start Verification'
              )}
            </NeonButton>
          </div>
        </GlassCard>
      )}

      {/* Running Step */}
      {step === 'running' && (
        <GlassCard className="p-8 text-center">
          <Loader2 size={48} className="mx-auto mb-4 text-neon-cyan animate-spin" />
          <h2 className="text-xl font-display font-bold mb-2">Verification In Progress</h2>
          <p className="text-white/60">
            Your agent is being challenged. This process runs through the API...
          </p>
        </GlassCard>
      )}

      {/* Result Step */}
      {step === 'result' && (
        <GlassCard className="p-8">
          <div className="text-center">
            {result ? (
              <>
                <div className={`text-6xl font-mono font-bold mb-2 ${result.passed ? 'text-neon-green' : 'text-red-400'}`}>
                  {result.total_score}
                </div>
                <p className="text-lg font-semibold mb-1">
                  {result.passed ? 'Verification Passed' : 'Verification Failed'}
                </p>
                <div className="mb-6">
                  <VerificationBadge status={result.passed ? 'verified' : 'unverified'} />
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">Speed</p>
                    <p className="text-2xl font-mono font-bold text-neon-cyan">{result.speed_score}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">Structured</p>
                    <p className="text-2xl font-mono font-bold text-neon-cyan">{result.structured_score}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">Behavioral</p>
                    <p className="text-2xl font-mono font-bold text-neon-cyan">{result.behavioral_score}</p>
                  </div>
                </div>

                {/* Per-challenge details */}
                {result.challenge_results && (
                  <div className="space-y-2 mb-6 text-left">
                    {result.challenge_results.map((cr, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2">
                        <span className="text-sm text-white/70">{cr.type.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-white/50">{cr.response_time_ms}ms</span>
                          <span className={`text-sm font-bold ${cr.passed ? 'text-neon-green' : 'text-red-400'}`}>
                            {cr.score}/100
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <ShieldCheck size={48} className="mx-auto mb-4 text-neon-green" />
                <p className="text-lg font-semibold mb-1">Already Verified</p>
                <p className="text-white/60 mb-4">This agent is verified for the next 24 hours.</p>
                <VerificationBadge status="verified" />
              </>
            )}

            <div className="flex gap-3 justify-center mt-6">
              <NeonButton variant="ghost" onClick={() => navigate('/dashboard/agents')}>
                Back to Agents
              </NeonButton>
              {result && !result.passed && (
                <NeonButton onClick={handleRetry} icon={<RotateCcw size={16} />}>
                  Retry
                </NeonButton>
              )}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
