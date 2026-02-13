import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '../../shared/utils/logger.js';
import { encrypt as encryptApiKey, decrypt as decryptApiKey } from '../../shared/utils/crypto.js';
import { serviceClient as supabase, createUserClient, extractToken } from '../../shared/utils/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyWebhookSignature } from '../../agents/adapters/webhook.js';
import { getAllTasks, getTask } from '../../orchestrator/task-registry.js';
import { BROWSER_TOOLS } from '../../agents/adapters/base.js';

const log = createLogger('AgentsAPI');

const router = Router();

// ============================================================================
// SECURITY: SSRF protection for webhook URLs
// ============================================================================
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || !parts.every(p => !isNaN(p))) return false;
  // 0.0.0.0
  if (parts.every(p => p === 0)) return true;
  // 127.0.0.0/8 (full loopback range)
  if (parts[0] === 127) return true;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local / cloud metadata)
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost') {
      return true;
    }

    // Block private IPv4 ranges
    if (isPrivateIpv4(hostname)) return true;

    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1, ::ffff:10.0.0.1)
    if (hostname.startsWith('[') || hostname.includes(':')) {
      const cleaned = hostname.replace(/^\[|\]$/g, '');
      const mapped = cleaned.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      if (mapped) {
        return isPrivateIpv4(mapped[1]);
      }
      // Block loopback variants
      if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1') return true;
    }

    // Block cloud metadata endpoints
    if (hostname === 'metadata.google.internal') return true;

    return false;
  } catch {
    return true; // Invalid URL = blocked
  }
}

// Allowed sort columns for agent listing
const ALLOWED_SORT_COLUMNS = ['elo_rating', 'name', 'created_at', 'total_wins', 'total_competitions'];

// List public agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sort = 'elo_rating', limit = 50, offset = 0 } = req.query;

    // M1: Clamp pagination limits
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    // Whitelist sort columns to prevent column enumeration
    const sortColumn = ALLOWED_SORT_COLUMNS.includes(sort as string) ? (sort as string) : 'elo_rating';

    const { data, error } = await supabase
      .from('aio_agents')
      .select(`
        *,
        owner:aio_profiles(username)
      `)
      .eq('is_active', true)
      .eq('is_public', true)
      .order(sortColumn, { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    log.error('Failed to list agents', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Get single agent
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Sanitize id to prevent PostgREST filter injection
    const sanitizedId = String(id).replace(/[^a-zA-Z0-9\-_]/g, '');
    if (!sanitizedId || sanitizedId !== id) {
      return res.status(400).json({ error: 'Invalid agent identifier' });
    }

    // Use separate queries instead of .or() to avoid filter injection
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedId);
    let query = supabase
      .from('aio_agents')
      .select(`
        *,
        owner:aio_profiles(username)
      `);

    if (isUuid) {
      query = query.eq('id', sanitizedId);
    } else {
      query = query.eq('slug', sanitizedId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Only return full data if public or owned by requester
    const authHeader = req.headers.authorization;
    let isOwner = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      isOwner = user?.id === data.owner_id;
    }

    if (!data.is_public && !isOwner) {
      return res.status(403).json({ error: 'Agent is private' });
    }

    // Remove sensitive data for non-owners
    if (!isOwner) {
      delete data.api_key_encrypted;
      delete data.webhook_secret;
    }

    res.json(data);
  } catch (error) {
    log.error('Failed to get agent', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// Create agent (requires auth, uses user-scoped client for RLS)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userDb = (req as any).userClient;
    const {
      name,
      slug,
      description,
      color,
      agent_type,
      webhook_url,
      provider,
      model,
      api_key,
      system_prompt,
      is_public = false,
      persona_name,
      persona_description,
      persona_style,
      strategy
    } = req.body;

    // Validate required fields
    if (!name || !slug || !agent_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Abuse detection: max 5 agents per user (RLS-scoped via userDb above)
    const { count: agentCount } = await userDb
      .from('aio_agents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    if ((agentCount || 0) >= 5) {
      return res.status(429).json({ error: 'Maximum 5 agents per account. Delete an existing agent first.' });
    }

    // H1: SSRF protection - validate webhook URL at creation time
    if (agent_type === 'webhook' && webhook_url) {
      if (isPrivateUrl(webhook_url)) {
        return res.status(400).json({
          error: 'Webhook URL must be a public HTTPS endpoint. Private IPs, localhost, and internal addresses are not allowed.'
        });
      }
    }

    // Generate webhook secret for webhook agents
    const webhook_secret = agent_type === 'webhook'
      ? 'whs_' + crypto.randomBytes(32).toString('hex')
      : null;

    // H4: Sanitize persona fields - strip control chars, limit length
    const sanitizeText = (s: string | undefined, maxLen: number) =>
      s ? s.replace(/[\x00-\x1f]/g, '').slice(0, maxLen) : null;

    // Encrypt API key with AES-256-GCM
    const api_key_encrypted = api_key ? encryptApiKey(api_key) : null;

    // L1: Validate persona_style against allowed values
    const ALLOWED_STYLES = ['formal', 'casual', 'technical', 'dramatic', 'minimal'];
    const ALLOWED_STRATEGIES = ['aggressive', 'cautious', 'balanced', 'creative', 'analytical'];
    if (persona_style && !ALLOWED_STYLES.includes(persona_style)) {
      return res.status(400).json({ error: `Invalid persona_style. Must be one of: ${ALLOWED_STYLES.join(', ')}` });
    }
    if (strategy && !ALLOWED_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: `Invalid strategy. Must be one of: ${ALLOWED_STRATEGIES.join(', ')}` });
    }

    // Use user-scoped client so RLS enforces ownership
    const { data, error } = await userDb
      .from('aio_agents')
      .insert({
        owner_id: user.id,
        name,
        slug,
        description,
        color: color || '#6B7280',
        agent_type,
        webhook_url: agent_type === 'webhook' ? webhook_url : null,
        webhook_secret,
        provider: agent_type === 'api_key' ? provider : null,
        model: agent_type === 'api_key' ? model : null,
        api_key_encrypted,
        system_prompt,
        is_public,
        persona_name: sanitizeText(persona_name, 100),
        persona_description: sanitizeText(persona_description, 500),
        persona_style: persona_style || null,
        strategy: strategy || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Slug already taken' });
      }
      throw error;
    }

    // M5: Strip sensitive data from response
    delete data.api_key_encrypted;
    delete data.webhook_secret;

    log.info('Agent created', { agentId: data.id, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to create agent', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update agent (requires auth, uses user-scoped client for RLS)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userDb = (req as any).userClient;
    const { id } = req.params;

    // RLS will enforce ownership, but verify explicitly for clear error messages
    const { data: existing } = await userDb
      .from('aio_agents')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!existing || existing.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const allowedFields = [
      'name', 'slug', 'description', 'color',
      'webhook_url', 'provider', 'model', 'system_prompt',
      'is_active', 'is_public',
      'persona_name', 'persona_description', 'persona_style', 'strategy'
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // H1: SSRF protection - validate webhook URL at update time
    if (updates.webhook_url && isPrivateUrl(updates.webhook_url)) {
      return res.status(400).json({
        error: 'Webhook URL must be a public HTTPS endpoint. Private IPs, localhost, and internal addresses are not allowed.'
      });
    }

    // H4: Sanitize persona fields on update
    if (updates.persona_name !== undefined) {
      updates.persona_name = updates.persona_name ? String(updates.persona_name).replace(/[\x00-\x1f]/g, '').slice(0, 100) : null;
    }
    if (updates.persona_description !== undefined) {
      updates.persona_description = updates.persona_description ? String(updates.persona_description).replace(/[\x00-\x1f]/g, '').slice(0, 500) : null;
    }

    // L1: Validate persona_style and strategy on update
    const ALLOWED_STYLES_U = ['formal', 'casual', 'technical', 'dramatic', 'minimal'];
    const ALLOWED_STRATEGIES_U = ['aggressive', 'cautious', 'balanced', 'creative', 'analytical'];
    if (updates.persona_style && !ALLOWED_STYLES_U.includes(updates.persona_style)) {
      return res.status(400).json({ error: `Invalid persona_style` });
    }
    if (updates.strategy && !ALLOWED_STRATEGIES_U.includes(updates.strategy)) {
      return res.status(400).json({ error: `Invalid strategy` });
    }

    // Handle API key update with proper encryption
    if (req.body.api_key) {
      updates.api_key_encrypted = encryptApiKey(req.body.api_key);
    }

    const { data, error } = await userDb
      .from('aio_agents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    log.info('Agent updated', { agentId: id, userId: user.id });
    res.json(data);
  } catch (error) {
    log.error('Failed to update agent', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent (requires auth, uses user-scoped client for RLS)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userDb = (req as any).userClient;
    const { id } = req.params;

    // RLS will enforce ownership via user-scoped client
    const { data: existing } = await userDb
      .from('aio_agents')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!existing || existing.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { error } = await userDb
      .from('aio_agents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    log.info('Agent deleted', { agentId: id, userId: user.id });
    res.status(204).send();
  } catch (error) {
    log.error('Failed to delete agent', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Test webhook endpoint
router.post('/test-webhook', requireAuth, async (req: Request, res: Response) => {
  try {
    const { webhookUrl, webhookSecret } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Missing webhook URL' });
    }

    // SECURITY: Block SSRF - reject private/internal URLs
    if (isPrivateUrl(webhookUrl)) {
      return res.status(400).json({
        error: 'Webhook URL must be a public HTTPS endpoint. Private IPs, localhost, and internal addresses are not allowed.'
      });
    }

    const testPayload = {
      version: '1.0',
      timestamp: Date.now(),
      agentId: 'test',
      agentName: 'Test Agent',
      task: {
        systemPrompt: 'This is a test request from AI Olympics',
        taskPrompt: 'Please respond to verify your webhook is working'
      },
      pageState: {
        url: 'https://example.com',
        title: 'Test Page',
        accessibilityTree: 'button "Submit"'
      },
      previousActions: [],
      turnNumber: 1,
      availableTools: []
    };

    const signature = webhookSecret
      ? 'sha256=' + crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(testPayload))
          .digest('hex')
      : 'none';

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Olympics-Signature': signature,
        'X-AI-Olympics-Test': 'true'
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.json({
        success: false,
        message: `Webhook returned ${response.status}`
      });
    }

    const responseData = await response.json();

    const sanitizedResponse = {
      hasActions: Array.isArray(responseData?.actions) ? responseData.actions.length : 0,
      hasDone: responseData?.done === true
    };
    res.json({
      success: true,
      message: 'Webhook responded successfully',
      response: sanitizedResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to reach webhook'
    });
  }
});

// Get ELO history for an agent
router.get('/:id/elo-history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // M1: Clamp pagination limits
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const { data, error } = await supabase
      .from('aio_elo_history')
      .select(`
        *,
        competition:aio_competitions(name),
        domain:aio_domains(name, slug)
      `)
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Failed to get ELO history', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get ELO history' });
  }
});

// Get domain ratings for an agent
router.get('/:id/domain-ratings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('aio_agent_domain_ratings')
      .select(`
        *,
        domain:aio_domains(name, slug, icon)
      `)
      .eq('agent_id', id)
      .order('elo_rating', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Failed to get domain ratings', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get domain ratings' });
  }
});

// ============================================================================
// SANDBOX / TESTING ENDPOINTS
// ============================================================================

// List available tasks (public, for sandbox UI)
router.get('/sandbox/tasks', (_req: Request, res: Response) => {
  try {
    const tasks = getAllTasks().map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      difficulty: t.difficulty,
      timeLimit: t.timeLimit,
      scoringMethod: t.scoringMethod,
      maxScore: t.maxScore,
    }));
    res.json(tasks);
  } catch (error) {
    log.error('Failed to list tasks', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// Run sandbox test: send a sample task payload to the agent and return the response
router.post('/:id/sandbox', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    // Look up the task
    const task = getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Look up the agent (must be owned by the user) - use RLS-scoped client
    const userDb = (req as any).userClient;
    const { data: agent, error: agentErr } = await userDb
      .from('aio_agents')
      .select('*')
      .eq('id', id)
      .single();

    if (agentErr || !agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to test this agent' });
    }

    // Build the sample payload (matches WebhookRequest format)
    const samplePayload = {
      version: '1.0',
      timestamp: Date.now(),
      agentId: agent.id,
      agentName: agent.name,
      competitionId: 'sandbox-test',
      task: {
        systemPrompt: task.systemPrompt,
        taskPrompt: task.taskPrompt,
      },
      pageState: {
        url: task.startUrl,
        title: `${task.name} - Sandbox Test`,
        accessibilityTree: '[sandbox] button "Start" | input "answer" | heading "' + task.name + '"',
      },
      previousActions: [],
      turnNumber: 1,
      availableTools: BROWSER_TOOLS,
    };

    // For webhook agents: send the payload to their endpoint
    if (agent.agent_type === 'webhook' && agent.webhook_url) {
      // SSRF protection
      if (isPrivateUrl(agent.webhook_url)) {
        return res.status(400).json({
          error: 'Webhook URL points to a private address. Update your agent with a public URL.',
        });
      }

      const body = JSON.stringify(samplePayload);
      const signature = agent.webhook_secret
        ? 'sha256=' + crypto.createHmac('sha256', agent.webhook_secret).update(body).digest('hex')
        : 'none';

      const startTime = Date.now();
      const response = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Olympics-Signature': signature,
          'X-AI-Olympics-Test': 'true',
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        return res.json({
          success: false,
          agentType: 'webhook',
          task: { id: task.id, name: task.name },
          error: `Webhook returned HTTP ${response.status}`,
          responseTime: elapsed,
          requestPayload: samplePayload,
        });
      }

      const responseData = await response.json();
      return res.json({
        success: true,
        agentType: 'webhook',
        task: { id: task.id, name: task.name },
        responseTime: elapsed,
        requestPayload: samplePayload,
        agentResponse: {
          thinking: responseData?.thinking || null,
          actions: Array.isArray(responseData?.actions) ? responseData.actions : [],
          done: responseData?.done || false,
        },
      });
    }

    // For API key agents: verify connectivity by checking the provider
    if (agent.agent_type === 'api_key') {
      const provider = agent.provider || 'unknown';
      const model = agent.model || 'unknown';

      // We can't run a full agent turn without Playwright, but we can verify the config
      return res.json({
        success: true,
        agentType: 'api_key',
        task: { id: task.id, name: task.name },
        provider,
        model,
        message: `API key agent configured with ${provider}/${model}. In a real competition, the platform runs the model and browser on your behalf.`,
        requestPayload: samplePayload,
        note: 'API key agents are executed server-side during competitions. This sandbox shows the payload your agent would receive.',
      });
    }

    return res.status(400).json({
      error: `Unknown agent type: ${agent.agent_type}. Supported: webhook, api_key`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Sandbox test failed', { error: message });
    res.status(500).json({
      success: false,
      error: message.includes('timeout') ? 'Webhook timed out (15s limit)' : 'Sandbox test failed',
    });
  }
});

export default router;
