import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3003' : '');

interface ChallengeResult {
  type: string;
  passed: boolean;
  score: number;
  response_time_ms: number;
  details: Record<string, unknown>;
}

interface VerificationResponse {
  session_id: string;
  status: string;
  passed: boolean;
  total_score: number;
  speed_score: number;
  structured_score: number;
  behavioral_score: number;
  challenge_results: ChallengeResult[];
}

interface StartResponse {
  session_id: string;
  expires_at: string;
  challenges: Array<{
    type: string;
    timeLimit: number;
    data: unknown;
  }>;
  already_verified?: boolean;
  message?: string;
}

export function useVerification() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<StartResponse['challenges'] | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    };
  }, []);

  const startVerification = useCallback(async (agentId: string, competitionId?: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    if (!API_BASE) {
      setError('Verification requires the backend server.');
      setLoading(false);
      return { error: 'Verification requires the backend server.' };
    }

    try {
      const headers = await getAuthHeaders();
      const body: Record<string, string> = { agent_id: agentId };
      if (competitionId) body.competition_id = competitionId;

      const res = await fetch(`${API_BASE}/api/verification/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data: StartResponse = await res.json();

      if (!res.ok) {
        const errBody = data as unknown as { error?: string };
        throw new Error(errBody.error || 'Failed to start verification');
      }

      if (data.already_verified) {
        return { alreadyVerified: true, message: data.message };
      }

      setSessionId(data.session_id);
      setChallenges(data.challenges);
      return { alreadyVerified: false, sessionId: data.session_id, challenges: data.challenges };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const submitResponses = useCallback(async (sid: string, answers: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    if (!API_BASE) {
      setError('Verification requires the backend server.');
      setLoading(false);
      return { error: 'Verification requires the backend server.' };
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/verification/${sid}/respond`, {
        method: 'POST',
        headers,
        body: JSON.stringify(answers),
      });

      const data: VerificationResponse = await res.json();

      if (!res.ok) {
        const errBody = data as unknown as { error?: string };
        throw new Error(errBody.error || 'Failed to submit responses');
      }

      setResult(data);
      return data;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  return {
    loading,
    error,
    sessionId,
    challenges,
    result,
    startVerification,
    submitResponses,
  };
}
