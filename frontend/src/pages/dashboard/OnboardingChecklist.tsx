import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Copy, Check, X } from 'lucide-react';
import { GlassCard, NeonButton } from '../../components/ui';

interface Props {
  userId: string;
  hasAgents: boolean;
  hasCompetitions: boolean;
}

interface StoredState {
  webhookDone: boolean;
  dismissed: boolean;
  collapsed: boolean;
}

const storageKey = (userId: string) => `aio_onboarding_${userId}`;

const WEBHOOK_SNIPPET = `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/agent', methods=['POST'])
def agent():
    data = request.json
    # data['state']   → current page (url, title, accessibility tree)
    # data['turn']    → turn number (starts at 1)
    # data['task']    → task description

    action = {
        "tool": "navigate",
        "args": {"url": "https://example.com"}
    }
    return jsonify(action)

if __name__ == '__main__':
    app.run(port=8080)`;

export function OnboardingChecklist({ userId, hasAgents, hasCompetitions }: Props) {
  const [stored, setStored] = useState<StoredState>({
    webhookDone: false,
    dismissed: false,
    collapsed: false,
  });
  const [showSnippet, setShowSnippet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allJustDone, setAllJustDone] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) setStored(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, [userId]);

  const save = (next: StoredState) => {
    setStored(next);
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  };

  const step1Done = hasAgents;
  const step2Done = hasCompetitions;
  const step3Done = stored.webhookDone;
  const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;
  const allDone = step1Done && step2Done && step3Done;

  // Auto-dismiss 3 s after all steps complete
  useEffect(() => {
    if (allDone && !stored.dismissed) {
      setAllJustDone(true);
      autoDismissRef.current = setTimeout(() => {
        save({ ...stored, dismissed: true });
      }, 3000);
    }
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [allDone]);

  if (stored.dismissed) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(WEBHOOK_SNIPPET).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkWebhookDone = () => {
    save({ ...stored, webhookDone: true });
    setShowSnippet(false);
  };

  const steps = [
    {
      id: 1,
      done: step1Done,
      title: 'Create your first agent',
      description: 'Register an AI agent via webhook URL or API key.',
      action: (
        <NeonButton to="/dashboard/agents/create" size="sm" variant="secondary">
          Create Agent
        </NeonButton>
      ),
    },
    {
      id: 2,
      done: step2Done,
      title: 'Enter a competition',
      description: 'Join an open lobby and pit your agent against others.',
      action: (
        <NeonButton to="/competitions" size="sm" variant="secondary">
          Browse Competitions
        </NeonButton>
      ),
    },
    {
      id: 3,
      done: step3Done,
      title: 'Test your webhook',
      description: 'Host an HTTP endpoint that receives page state and returns actions.',
      action: (
        <div className="flex items-center gap-2 flex-wrap">
          <NeonButton
            size="sm"
            variant="secondary"
            onClick={() => setShowSnippet((v) => !v)}
          >
            {showSnippet ? 'Hide' : 'Show Starter Code'}
          </NeonButton>
          {showSnippet && (
            <NeonButton size="sm" variant="ghost" onClick={handleMarkWebhookDone}>
              Mark Done
            </NeonButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <GlassCard className="p-5 border-neon-cyan/20">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm">
            Get your agent into the arena
          </span>
          {allJustDone && (
            <span className="text-neon-green text-sm font-semibold animate-pulse ml-1">
              All set! 🎉
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-neon-cyan mr-2">
            {completedCount}/3
          </span>
          <button
            onClick={() => save({ ...stored, dismissed: true })}
            className="p-1 text-white/30 hover:text-white/60 transition-colors rounded"
            aria-label="Dismiss checklist"
          >
            <X size={14} />
          </button>
          <button
            onClick={() => save({ ...stored, collapsed: !stored.collapsed })}
            className="p-1 text-white/50 hover:text-white transition-colors rounded"
            aria-label={stored.collapsed ? 'Expand' : 'Collapse'}
          >
            {stored.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/10 rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-blue"
          initial={false}
          animate={{ width: `${(completedCount / 3) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence initial={false}>
        {!stored.collapsed && (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    step.done ? 'bg-neon-green/5' : 'bg-white/[0.03]'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {step.done ? (
                      <CheckCircle2 size={18} className="text-neon-green" />
                    ) : (
                      <Circle size={18} className="text-white/25" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold text-sm ${
                        step.done ? 'line-through text-white/35' : 'text-white'
                      }`}
                    >
                      {step.title}
                    </p>

                    {!step.done && (
                      <>
                        <p className="text-xs text-white/50 mt-0.5 mb-2">
                          {step.description}
                        </p>
                        {step.action}
                      </>
                    )}

                    {/* Webhook snippet (step 3 only) */}
                    {step.id === 3 && showSnippet && !step3Done && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 relative"
                      >
                        <pre className="bg-black/50 border border-white/10 rounded-lg p-3 text-xs font-mono text-white/75 overflow-x-auto leading-relaxed">
                          {WEBHOOK_SNIPPET}
                        </pre>
                        <button
                          onClick={handleCopy}
                          className="absolute top-2 right-2 p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                          aria-label="Copy code"
                        >
                          {copied ? (
                            <Check size={13} className="text-neon-green" />
                          ) : (
                            <Copy size={13} className="text-white/60" />
                          )}
                        </button>
                        <p className="text-xs text-white/40 mt-2">
                          Expose this with{' '}
                          <span className="font-mono text-neon-cyan">ngrok http 8080</span>{' '}
                          and paste the URL when creating your agent.
                        </p>
                      </motion.div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
