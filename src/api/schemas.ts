import { z } from 'zod';

// ============================================================================
// PAYMENTS
// ============================================================================

export const stripeDepositSchema = z.object({
  amountCents: z.number().int().min(100).max(10_000_00).optional(),
  amount_cents: z.number().int().min(100).max(10_000_00).optional(),
  email: z.string().email(),
}).refine(data => data.amountCents || data.amount_cents, {
  message: 'amountCents is required',
});

export const cryptoWithdrawSchema = z.object({
  toAddress: z.string().min(10).max(100).optional(),
  to_address: z.string().min(10).max(100).optional(),
  amountCents: z.number().int().min(100).max(10_000_00).optional(),
  amount_cents: z.number().int().min(100).max(10_000_00).optional(),
}).refine(data => data.toAddress || data.to_address, {
  message: 'toAddress is required',
}).refine(data => data.amountCents || data.amount_cents, {
  message: 'amountCents is required',
});

export const cryptoWalletSchema = z.object({
  walletAddress: z.string().min(10).max(100).optional(),
  wallet_address: z.string().min(10).max(100).optional(),
}).refine(data => data.walletAddress || data.wallet_address, {
  message: 'walletAddress is required',
});

export const exchangeCredentialsSchema = z.object({
  exchange: z.string().min(1).max(50),
  credentials: z.record(z.string()),
});

// ============================================================================
// META-MARKETS (BETTING)
// ============================================================================

export const placeBetSchema = z.object({
  outcomeId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
});

// ============================================================================
// AGENTS
// ============================================================================

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  agent_type: z.enum(['webhook', 'api_key', 'sandbox']),
  webhook_url: z.string().url().max(500).optional().nullable(),
  provider: z.string().max(50).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  api_key: z.string().max(500).optional().nullable(),
  system_prompt: z.string().max(5000).optional().nullable(),
  is_public: z.boolean().optional().default(false),
  persona_name: z.string().max(100).optional().nullable(),
  persona_description: z.string().max(500).optional().nullable(),
  persona_style: z.enum(['formal', 'casual', 'technical', 'dramatic', 'minimal']).optional().nullable(),
  strategy: z.enum(['aggressive', 'cautious', 'balanced', 'creative', 'analytical']).optional().nullable(),
});

export const testWebhookSchema = z.object({
  webhook_url: z.string().url().max(500),
  webhook_secret: z.string().max(200).optional(),
});

// ============================================================================
// COMPETITIONS
// ============================================================================

export const createCompetitionSchema = z.object({
  name: z.string().min(1).max(200),
  domain_slug: z.string().max(100).optional().nullable(),
  stake_mode: z.enum(['sandbox', 'real', 'spectator']).optional().default('sandbox'),
  entry_fee: z.number().min(0).max(10000).optional().default(0),
  max_participants: z.number().int().min(2).max(64).optional().default(8),
  scheduled_start: z.string().datetime().optional().nullable(),
  task_ids: z.array(z.string()).optional().nullable(),
});

export const joinCompetitionSchema = z.object({
  agent_id: z.string().uuid(),
});

export const voteSchema = z.object({
  agent_id: z.string().uuid(),
  vote_type: z.enum(['cheer', 'predict_win', 'mvp']),
});

// ============================================================================
// TOURNAMENTS
// ============================================================================

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  domain_id: z.string().uuid().optional().nullable(),
  bracket_type: z.enum(['single-elimination', 'double-elimination', 'round-robin', 'swiss']).optional().default('single-elimination'),
  max_participants: z.number().int().min(2).max(64).optional().default(16),
  task_ids: z.array(z.string()).optional().nullable(),
  best_of: z.number().int().min(1).max(7).optional().default(1),
});

export const joinTournamentSchema = z.object({
  agent_id: z.string().uuid(),
});

// ============================================================================
// CHAMPIONSHIPS
// ============================================================================

export const createChampionshipSchema = z.object({
  name: z.string().min(1).max(200),
  domain_id: z.string().uuid().optional().nullable(),
  total_rounds: z.number().int().min(1).max(20).optional().default(3),
  format: z.enum(['points', 'elimination', 'hybrid']).optional().default('points'),
  points_config: z.record(z.unknown()).optional().nullable(),
  elimination_after_round: z.number().int().min(1).optional().nullable(),
  max_participants: z.number().int().min(2).max(128).optional().default(32),
  entry_requirements: z.record(z.unknown()).optional().nullable(),
  registration_deadline: z.string().datetime().optional().nullable(),
  task_ids: z.array(z.string()).optional().nullable(),
});

export const joinChampionshipSchema = z.object({
  agent_id: z.string().uuid(),
});

// ============================================================================
// ADMIN
// ============================================================================

export const updateUserSchema = z.object({
  is_admin: z.boolean().optional(),
  is_verified: z.boolean().optional(),
}).refine(data => data.is_admin !== undefined || data.is_verified !== undefined, {
  message: 'At least one field (is_admin or is_verified) is required',
});

export const reviewAgentSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(1000).optional().nullable(),
});

export const updateCompetitionStatusSchema = z.object({
  status: z.enum(['lobby', 'starting', 'running', 'completed', 'cancelled']),
});

// ============================================================================
// VERIFICATION
// ============================================================================

export const startVerificationSchema = z.object({
  agent_id: z.string().uuid(),
  competition_id: z.string().uuid().optional(),
});

export const respondVerificationSchema = z.object({
  speed_arithmetic: z.record(z.number()).optional(),
  speed_json_parse: z.record(z.unknown()).optional(),
  structured_output: z.record(z.unknown()).optional(),
  behavioral_timing: z.record(z.unknown()).optional(),
}).refine(data =>
  data.speed_arithmetic || data.speed_json_parse || data.structured_output || data.behavioral_timing,
  { message: 'At least one challenge response is required' }
);

// ============================================================================
// TRADING
// ============================================================================

export const createOrderSchema = z.object({
  market_id: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  amount: z.number().positive().max(1_000_000),
  price: z.number().min(0).max(1).optional(),
  order_type: z.enum(['market', 'limit']).optional().default('market'),
});

// ============================================================================
// GAMES
// ============================================================================

export const gameSubmitSchema = z.object({
  score: z.number().min(0),
  time_ms: z.number().int().min(0).optional(),
  answers: z.unknown().optional(),
  agentId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const puzzleSubmitSchema = z.object({
  puzzleId: z.string().min(1).max(200),
  answer: z.string().min(1).max(500),
  timeMs: z.number().int().min(0).max(600000).optional(),
  agentId: z.string().uuid().optional(),
});

export const sessionSubmitSchema = z.object({
  score: z.number().int().min(0).max(100000),
  correctCount: z.number().int().min(0).max(1000),
  totalQuestions: z.number().int().min(1).max(1000),
  timeSpentMs: z.number().int().min(0).max(3600000),
});
