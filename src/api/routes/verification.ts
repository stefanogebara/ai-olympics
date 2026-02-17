import { Router, Request, Response } from 'express';
import { createLogger } from '../../shared/utils/logger.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.js';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateVerificationSession,
  type ChallengeAnswers,
  type SpeedArithmeticAnswer,
  type SpeedJsonParseAnswer,
  type StructuredOutputAnswer,
  type BehavioralTimingAnswer,
} from '../../services/verification-challenge-service.js';
import {
  scoreSpeedArithmetic,
  scoreSpeedJsonParse,
  scoreStructuredOutput,
  scoreBehavioralTiming,
  computeVerificationResult,
  type ChallengeResult,
} from '../../services/verification-scoring.js';

const log = createLogger('VerificationAPI');
const router = Router();

// Helper: serialize expected answers for encryption (Map → JSON-safe)
function serializeExpectedAnswers(answers: {
  speed_arithmetic: Map<string, number>;
  speed_json_parse: Map<string, unknown>;
  structured_output: Record<string, unknown>;
}): string {
  return JSON.stringify({
    speed_arithmetic: Object.fromEntries(answers.speed_arithmetic),
    speed_json_parse: Object.fromEntries(answers.speed_json_parse),
    structured_output: answers.structured_output,
  });
}

// Helper: deserialize expected answers from DB
function deserializeExpectedAnswers(json: string): {
  speed_arithmetic: Map<string, number>;
  speed_json_parse: Map<string, unknown>;
  structured_output: Record<string, unknown>;
} {
  const parsed = JSON.parse(json);
  return {
    speed_arithmetic: new Map(Object.entries(parsed.speed_arithmetic)),
    speed_json_parse: new Map(Object.entries(parsed.speed_json_parse)),
    structured_output: parsed.structured_output,
  };
}

// ============================================================================
// POST /api/verification/start
// Start a new verification session for an agent
// ============================================================================
router.post('/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { agent_id, competition_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required' });
    }

    // Verify agent ownership (RLS-scoped)
    const userDb = (req as AuthenticatedRequest).userClient;
    const { data: agent } = await userDb
      .from('aio_agents')
      .select('id, owner_id, verification_status, last_verified_at')
      .eq('id', agent_id)
      .single();

    if (!agent || agent.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to verify this agent' });
    }

    // Check if already verified within 24h
    if (
      agent.verification_status === 'verified' &&
      agent.last_verified_at &&
      Date.now() - new Date(agent.last_verified_at).getTime() < 24 * 60 * 60 * 1000
    ) {
      return res.status(200).json({
        already_verified: true,
        message: 'Agent is already verified (valid for 24h)',
        last_verified_at: agent.last_verified_at,
      });
    }

    // Check for existing pending/in_progress session
    const { data: existingSession } = await supabase
      .from('aio_verification_sessions')
      .select('id, status, expires_at')
      .eq('agent_id', agent_id)
      .in('status', ['pending', 'in_progress'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      return res.status(409).json({
        error: 'Active verification session already exists',
        session_id: existingSession.id,
        expires_at: existingSession.expires_at,
      });
    }

    // Generate challenges
    const generated = generateVerificationSession();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Create session in DB
    const { data: session, error: sessionError } = await supabase
      .from('aio_verification_sessions')
      .insert({
        agent_id,
        competition_id: competition_id || null,
        session_type: 'gate',
        status: 'in_progress',
        started_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (sessionError || !session) {
      log.error('Failed to create verification session', { error: sessionError });
      return res.status(500).json({ error: 'Failed to create verification session' });
    }

    // Insert challenge records
    const challengeInserts = generated.challenges.map(c => ({
      session_id: session.id,
      challenge_type: c.type,
      challenge_payload: c.data,
      expected_answer: null, // Don't store expected answers in DB for security
    }));

    await supabase.from('aio_verification_challenges').insert(challengeInserts);

    // Store expected answers encrypted in DB (not in-memory, survives restarts/scaling)
    const serialized = serializeExpectedAnswers(generated.expectedAnswers);
    const encryptedAnswers = encrypt(serialized);

    await supabase
      .from('aio_verification_sessions')
      .update({ expected_answers_encrypted: encryptedAnswers })
      .eq('id', session.id);

    log.info('Verification session started', { sessionId: session.id, agentId: agent_id });

    res.status(201).json({
      session_id: session.id,
      expires_at: expiresAt,
      challenges: generated.challenges,
    });
  } catch (error) {
    log.error('Failed to start verification', { error });
    res.status(500).json({ error: 'Failed to start verification' });
  }
});

// ============================================================================
// POST /api/verification/:sessionId/respond
// Submit answers for all challenges in a session
// ============================================================================
router.post('/:sessionId/respond', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const sessionId = req.params.sessionId as string;
    const answers: ChallengeAnswers = req.body;

    // Get session (include encrypted answers for scoring)
    const { data: session } = await supabase
      .from('aio_verification_sessions')
      .select('*, agent:aio_agents(id, owner_id), expected_answers_encrypted')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Verification session not found' });
    }

    if ((session as any).agent?.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: `Session is ${session.status}, cannot submit answers` });
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('aio_verification_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId);
      return res.status(410).json({ error: 'Verification session has expired' });
    }

    // Get expected answers from encrypted DB column
    if (!session.expected_answers_encrypted) {
      return res.status(410).json({ error: 'Session answers not found. Please start a new session.' });
    }

    let expectedAnswers;
    try {
      const decrypted = decrypt(session.expected_answers_encrypted);
      expectedAnswers = deserializeExpectedAnswers(decrypted);
    } catch (err) {
      log.error('Failed to decrypt session answers', { sessionId });
      return res.status(500).json({ error: 'Failed to decrypt session data' });
    }

    // Get challenge records for timing info
    const { data: challenges } = await supabase
      .from('aio_verification_challenges')
      .select('*')
      .eq('session_id', sessionId);

    if (!challenges || challenges.length === 0) {
      return res.status(500).json({ error: 'No challenges found for session' });
    }

    // Score each challenge
    const now = Date.now();
    const sessionStarted = new Date(session.started_at).getTime();
    const totalResponseTime = now - sessionStarted;

    const challengeResults: ChallengeResult[] = [];

    // Speed Arithmetic
    if (answers.speed_arithmetic) {
      const arithmeticChallenge = challenges.find(c => c.challenge_type === 'speed_arithmetic');
      const responseTime = Math.min(totalResponseTime, 5000);
      const result = scoreSpeedArithmetic(
        answers.speed_arithmetic,
        expectedAnswers.speed_arithmetic,
        responseTime,
        5000,
      );
      challengeResults.push(result);

      if (arithmeticChallenge) {
        await supabase
          .from('aio_verification_challenges')
          .update({
            actual_answer: answers.speed_arithmetic,
            passed: result.passed,
            score: result.score,
            response_time_ms: result.responseTimeMs,
          })
          .eq('id', arithmeticChallenge.id);
      }
    }

    // Speed JSON Parse
    if (answers.speed_json_parse) {
      const jsonChallenge = challenges.find(c => c.challenge_type === 'speed_json_parse');
      const responseTime = Math.min(totalResponseTime, 4000);
      const result = scoreSpeedJsonParse(
        answers.speed_json_parse,
        expectedAnswers.speed_json_parse,
        responseTime,
        4000,
      );
      challengeResults.push(result);

      if (jsonChallenge) {
        await supabase
          .from('aio_verification_challenges')
          .update({
            actual_answer: answers.speed_json_parse,
            passed: result.passed,
            score: result.score,
            response_time_ms: result.responseTimeMs,
          })
          .eq('id', jsonChallenge.id);
      }
    }

    // Structured Output
    if (answers.structured_output) {
      const structuredChallenge = challenges.find(c => c.challenge_type === 'structured_output');
      const responseTime = Math.min(totalResponseTime, 15000);
      const result = scoreStructuredOutput(
        answers.structured_output,
        expectedAnswers.structured_output,
        responseTime,
        15000,
      );
      challengeResults.push(result);

      if (structuredChallenge) {
        await supabase
          .from('aio_verification_challenges')
          .update({
            actual_answer: answers.structured_output,
            passed: result.passed,
            score: result.score,
            response_time_ms: result.responseTimeMs,
          })
          .eq('id', structuredChallenge.id);
      }
    }

    // Behavioral Timing
    if (answers.behavioral_timing) {
      const behavioralChallenge = challenges.find(c => c.challenge_type === 'behavioral_timing');
      const result = scoreBehavioralTiming(answers.behavioral_timing);
      challengeResults.push(result);

      if (behavioralChallenge) {
        await supabase
          .from('aio_verification_challenges')
          .update({
            actual_answer: answers.behavioral_timing,
            passed: result.passed,
            score: result.score,
            response_time_ms: result.responseTimeMs,
          })
          .eq('id', behavioralChallenge.id);
      }
    }

    // Compute aggregate result
    const result = computeVerificationResult(challengeResults);
    const finalStatus = result.passed ? 'passed' : 'failed';

    // Update session
    await supabase
      .from('aio_verification_sessions')
      .update({
        status: finalStatus,
        verification_score: result.totalScore,
        speed_score: result.speedScore,
        structured_score: result.structuredScore,
        behavioral_score: result.behavioralScore,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Update agent verification status
    const verificationStatus = result.passed ? 'verified' : 'unverified';

    // Check if this is a second failure (should flag)
    if (!result.passed && result.totalScore >= 50) {
      // Check previous attempts
      const { data: prevSessions } = await supabase
        .from('aio_verification_sessions')
        .select('status')
        .eq('agent_id', session.agent_id)
        .eq('status', 'failed')
        .limit(2);

      if (prevSessions && prevSessions.length >= 2) {
        // Second failure in retry range -> flag
        await supabase
          .from('aio_agents')
          .update({
            verification_status: 'flagged',
            last_verification_score: result.totalScore,
          })
          .eq('id', session.agent_id)
          .eq('owner_id', user.id);
      }
    }

    if (result.passed) {
      await supabase
        .from('aio_agents')
        .update({
          verification_status: 'verified',
          last_verification_score: result.totalScore,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', session.agent_id)
        .eq('owner_id', user.id);
    } else {
      await supabase
        .from('aio_agents')
        .update({
          last_verification_score: result.totalScore,
        })
        .eq('id', session.agent_id)
        .eq('owner_id', user.id);
    }

    // Update or create verification history
    const { data: existingHistory } = await supabase
      .from('aio_agent_verification_history')
      .select('*')
      .eq('agent_id', session.agent_id)
      .single();

    if (existingHistory) {
      const newTotal = existingHistory.total_verifications + 1;
      const newPasses = existingHistory.total_passes + (result.passed ? 1 : 0);
      const newAvg = ((existingHistory.average_score * existingHistory.total_verifications) + result.totalScore) / newTotal;

      await supabase
        .from('aio_agent_verification_history')
        .update({
          total_verifications: newTotal,
          total_passes: newPasses,
          average_score: Math.round(newAvg * 100) / 100,
          updated_at: new Date().toISOString(),
        })
        .eq('agent_id', session.agent_id);
    } else {
      await supabase
        .from('aio_agent_verification_history')
        .insert({
          agent_id: session.agent_id,
          total_verifications: 1,
          total_passes: result.passed ? 1 : 0,
          average_score: result.totalScore,
        });
    }

    // Clear encrypted answers from DB after scoring (no longer needed)
    await supabase
      .from('aio_verification_sessions')
      .update({ expected_answers_encrypted: null })
      .eq('id', sessionId);

    log.info('Verification completed', {
      sessionId,
      agentId: session.agent_id,
      passed: result.passed,
      score: result.totalScore,
    });

    res.json({
      session_id: sessionId,
      status: finalStatus,
      passed: result.passed,
      total_score: result.totalScore,
      speed_score: result.speedScore,
      structured_score: result.structuredScore,
      behavioral_score: result.behavioralScore,
      challenge_results: challengeResults.map(r => ({
        type: r.type,
        passed: r.passed,
        score: r.score,
        response_time_ms: r.responseTimeMs,
        details: r.details,
      })),
    });
  } catch (error) {
    log.error('Failed to process verification response', { error });
    res.status(500).json({ error: 'Failed to process verification response' });
  }
});

// ============================================================================
// GET /api/verification/:sessionId
// Get session status and score
// ============================================================================
router.get('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const sessionId = req.params.sessionId as string;

    const { data: session } = await supabase
      .from('aio_verification_sessions')
      .select('*, agent:aio_agents(id, owner_id, name), challenges:aio_verification_challenges(*)')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if ((session as any).agent?.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(session);
  } catch (error) {
    log.error('Failed to get verification session', { error });
    res.status(500).json({ error: 'Failed to get verification session' });
  }
});

// ============================================================================
// GET /api/verification/agent/:agentId
// Get agent verification history
// ============================================================================
router.get('/agent/:agentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const { data: history } = await supabase
      .from('aio_agent_verification_history')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    const { data: recentSessions } = await supabase
      .from('aio_verification_sessions')
      .select('id, status, verification_score, speed_score, structured_score, behavioral_score, started_at, completed_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      history: history || null,
      recent_sessions: recentSessions || [],
    });
  } catch (error) {
    log.error('Failed to get agent verification history', { error });
    res.status(500).json({ error: 'Failed to get verification history' });
  }
});

export default router;
