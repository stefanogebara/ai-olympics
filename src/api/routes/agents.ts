import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createLogger } from '../../shared/utils/logger.js';
import { verifyWebhookSignature } from '../../agents/adapters/webhook.js';

const log = createLogger('AgentsAPI');

const router = Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// SECURITY: AES-256-GCM encryption for API keys
// ============================================================================
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY
  || crypto.createHash('sha256').update(supabaseServiceKey || 'fallback-dev-key').digest();

function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptApiKey(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ============================================================================
// SECURITY: SSRF protection for webhook URLs
// ============================================================================
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      return true;
    }

    // Block private IP ranges
    const parts = hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      // 10.0.0.0/8
      if (parts[0] === 10) return true;
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 169.254.0.0/16 (link-local / cloud metadata)
      if (parts[0] === 169 && parts[1] === 254) return true;
      // 0.0.0.0
      if (parts.every(p => p === 0)) return true;
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

// Middleware to verify JWT token from Supabase
async function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// List public agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sort = 'elo_rating', limit = 50, offset = 0 } = req.query;

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
      .range(Number(offset), Number(offset) + Number(limit) - 1);

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

    const { data, error } = await supabase
      .from('aio_agents')
      .select(`
        *,
        owner:aio_profiles(username)
      `)
      .or(`id.eq.${id},slug.eq.${id}`)
      .single();

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

// Create agent (requires auth)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
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
      is_public = false
    } = req.body;

    // Validate required fields
    if (!name || !slug || !agent_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate webhook secret for webhook agents
    const webhook_secret = agent_type === 'webhook'
      ? 'whs_' + crypto.randomBytes(32).toString('hex')
      : null;

    // Encrypt API key with AES-256-GCM
    const api_key_encrypted = api_key ? encryptApiKey(api_key) : null;

    const { data, error } = await supabase
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
        is_public
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Slug already taken' });
      }
      throw error;
    }

    log.info('Agent created', { agentId: data.id, userId: user.id });
    res.status(201).json(data);
  } catch (error) {
    log.error('Failed to create agent', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update agent (requires auth)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
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
      'is_active', 'is_public'
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Handle API key update with proper encryption
    if (req.body.api_key) {
      updates.api_key_encrypted = encryptApiKey(req.body.api_key);
    }

    const { data, error } = await supabase
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

// Delete agent (requires auth)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('aio_agents')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!existing || existing.owner_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { error } = await supabase
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

    res.json({
      success: true,
      message: 'Webhook responded successfully',
      response: responseData
    });
  } catch (error) {
    res.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to reach webhook'
    });
  }
});

export default router;
