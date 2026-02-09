import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export function ForgotPassword() {
  const { resetPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await resetPassword(email);

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <GlassCard neonBorder className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-neon-green/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} className="text-neon-green" />
            </div>
            <h1 className="text-2xl font-display font-bold mb-2">
              Check Your <NeonText variant="green" glow>Email</NeonText>
            </h1>
            <p className="text-white/60 mb-6">
              We've sent a password reset link to <strong className="text-white">{email}</strong>
            </p>
            <Link to="/auth/login">
              <NeonButton variant="secondary" className="w-full">
                Back to Sign In
              </NeonButton>
            </Link>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <GlassCard neonBorder className="p-8">
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6"
          >
            <ArrowLeft size={16} />
            Back to sign in
          </Link>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold mb-2">
              Reset <NeonText variant="cyan" glow>Password</NeonText>
            </h1>
            <p className="text-white/60">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              icon={<Mail size={18} />}
              required
            />

            <NeonButton type="submit" className="w-full" loading={loading}>
              Send Reset Link
            </NeonButton>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}
