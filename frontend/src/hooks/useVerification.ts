import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE } from '../lib/api';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/verification` : '';

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

    if (!API_BASE && !EDGE_FN_URL) {
      setError('Verification is unavailable. No backend or Edge Function configured.');
      setLoading(false);
      return { error: 'Verification is unavailable.' };
    }

    try {
      const headers = await getAuthHeaders();
      const body: Record<string, string> = { agent_id: agentId };
      if (competitionId) body.competition_id = competitionId;

      const url = API_BASE
        ? `${API_BASE}/api/verification/start`
        : `${EDGE_FN_URL}?action=start`;

      const res = await fetch(url, {
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

    if (!API_BASE && !EDGE_FN_URL) {
      setError('Verification is unavailable. No backend or Edge Function configured.');
      setLoading(false);
      return { error: 'Verification is unavailable.' };
    }

    try {
      const headers = await getAuthHeaders();
      const url = API_BASE
        ? `${API_BASE}/api/verification/${sid}/respond`
        : `${EDGE_FN_URL}?action=respond&session_id=${sid}`;

      const res = await fetch(url, {
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
