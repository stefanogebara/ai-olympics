/**
 * Seed script: creates platform "house" agents + recurring competitions per domain.
 *
 * Usage:
 *   npx tsx scripts/seed-competitions.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, API_KEY_ENCRYPTION_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── inline encrypt (mirrors src/shared/utils/crypto.ts) ──────────────────────
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function encrypt(plaintext: string): string {
  const encKey = process.env.API_KEY_ENCRYPTION_KEY ?? '';
  if (!encKey) throw new Error('API_KEY_ENCRYPTION_KEY not set');
  const key = Buffer.from(encKey.padEnd(32, '0').slice(0, 32));
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const DOMAIN_CONFIGS = [
  {
    slug: 'browser-tasks',
    name: 'Browser Tasks Daily',
    description: 'Claude models race through real web tasks — forms, navigation, data extraction.',
    recurrence: 'daily' as const,
    taskIds: ['form-blitz', 'shopping-cart', 'navigation-maze'],
  },
  {
    slug: 'games',
    name: 'Games Gauntlet',
    description: 'Trivia, math, word puzzles, and logic challenges — who thinks fastest?',
    recurrence: 'every_6h' as const,
    taskIds: ['trivia', 'math', 'word', 'logic'],
  },
  {
    slug: 'coding',
    name: 'Coding Arena',
    description: 'Debug code, play code golf, and ace API challenges.',
    recurrence: 'daily' as const,
    taskIds: ['code-debug', 'code-golf'],
  },
  {
    slug: 'creative',
    name: 'Creative Showdown',
    description: 'Writing challenges, design prompts, and pitch deck battles.',
    recurrence: 'daily' as const,
    taskIds: ['writing-challenge', 'pitch-deck'],
  },
];

// House agents — uses ANTHROPIC_API_KEY via encrypted storage
const HOUSE_AGENTS = [
  {
    name: 'Claude Sonnet (House)',
    slug: 'house-claude-sonnet',
    provider: 'claude',
    model: 'claude-sonnet-4-5-20250929',
    color: '#D97706',
    personaStyle: 'balanced',
    strategy: 'balanced',
  },
  {
    name: 'Claude Haiku (House)',
    slug: 'house-claude-haiku',
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    color: '#00F5FF',
    personaStyle: 'technical',
    strategy: 'aggressive',
  },
  {
    name: 'Claude Opus (House)',
    slug: 'house-claude-opus',
    provider: 'claude',
    model: 'claude-opus-4-6',
    color: '#FF00FF',
    personaStyle: 'analytical',
    strategy: 'cautious',
  },
];

async function getOrCreateSystemUser(): Promise<string> {
  // Look for existing system user
  const { data: existing } = await supabase
    .from('aio_profiles')
    .select('id')
    .eq('username', 'ai-olympics-system')
    .single();

  if (existing) {
    console.log('Using existing system user:', existing.id);
    return existing.id;
  }

  // Create via auth admin API
  const { data: authUser, error } = await supabase.auth.admin.createUser({
    email: 'system@ai-olympics.internal',
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { username: 'ai-olympics-system' },
  });

  if (error || !authUser.user) {
    throw new Error(`Failed to create system user: ${error?.message}`);
  }

  // Upsert profile
  await supabase.from('aio_profiles').upsert({
    id: authUser.user.id,
    username: 'ai-olympics-system',
    display_name: 'AI Olympics',
  });

  console.log('Created system user:', authUser.user.id);
  return authUser.user.id;
}

async function getOrCreateHouseAgents(ownerId: string): Promise<Map<string, string>> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');

  const encryptedKey = encrypt(anthropicKey);
  const agentIds = new Map<string, string>();

  for (const agent of HOUSE_AGENTS) {
    const { data: existing } = await supabase
      .from('aio_agents')
      .select('id')
      .eq('slug', agent.slug)
      .single();

    if (existing) {
      console.log(`Agent already exists: ${agent.name} (${existing.id})`);
      agentIds.set(agent.slug, existing.id);
      continue;
    }

    const { data, error } = await supabase
      .from('aio_agents')
      .insert({
        owner_id: ownerId,
        name: agent.name,
        slug: agent.slug,
        description: `Platform house agent — ${agent.model}`,
        color: agent.color,
        agent_type: 'api_key',
        provider: agent.provider,
        model: agent.model,
        api_key_encrypted: encryptedKey,
        persona_style: agent.personaStyle,
        strategy: agent.strategy,
        is_active: true,
        is_public: true,
        verification_status: 'verified',
        last_verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`Failed to create agent ${agent.name}:`, error?.message);
      continue;
    }

    console.log(`Created agent: ${agent.name} (${data.id})`);
    agentIds.set(agent.slug, data.id);
  }

  return agentIds;
}

async function getDomainId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('aio_domains')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id ?? null;
}

async function seedCompetition(
  domainConfig: typeof DOMAIN_CONFIGS[0],
  ownerId: string,
  agentIds: Map<string, string>
): Promise<void> {
  const domainId = await getDomainId(domainConfig.slug);
  if (!domainId) {
    console.warn(`Domain not found: ${domainConfig.slug}, skipping`);
    return;
  }

  // Skip if an active/lobby competition already exists for this domain
  const { data: existing } = await supabase
    .from('aio_competitions')
    .select('id')
    .eq('domain_id', domainId)
    .in('status', ['lobby', 'running', 'scheduled'])
    .eq('auto_start', true)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`Active competition already exists for ${domainConfig.slug}, skipping`);
    return;
  }

  // Schedule start 10 minutes from now
  const scheduledStart = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { data: comp, error } = await supabase
    .from('aio_competitions')
    .insert({
      name: domainConfig.name,
      description: domainConfig.description,
      domain_id: domainId,
      task_ids: domainConfig.taskIds,
      max_participants: 4,
      stake_mode: 'sandbox',
      entry_fee: 0,
      status: 'lobby',
      auto_start: true,
      recurrence_interval: domainConfig.recurrence,
      scheduled_start: scheduledStart,
      created_by: ownerId,
    })
    .select('id')
    .single();

  if (error || !comp) {
    console.error(`Failed to create competition for ${domainConfig.slug}:`, error?.message);
    return;
  }

  console.log(`Created competition: ${domainConfig.name} (${comp.id}), starts at ${scheduledStart}`);

  // Add all house agents as participants
  const participants = Array.from(agentIds.values()).map((agentId) => ({
    competition_id: comp.id,
    agent_id: agentId,
    owner_id: ownerId,
    status: 'joined',
  }));

  const { error: partErr } = await supabase
    .from('aio_competition_participants')
    .insert(participants);

  if (partErr) {
    console.error(`Failed to add participants:`, partErr.message);
  } else {
    console.log(`  Added ${participants.length} house agents`);
  }
}

async function main() {
  console.log('🏟️  Seeding AI Olympics competitions...\n');

  const ownerId = await getOrCreateSystemUser();
  const agentIds = await getOrCreateHouseAgents(ownerId);

  if (agentIds.size < 2) {
    throw new Error('Need at least 2 house agents to seed competitions');
  }

  for (const domainConfig of DOMAIN_CONFIGS) {
    await seedCompetition(domainConfig, ownerId, agentIds);
  }

  console.log('\n✅ Seeding complete!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
