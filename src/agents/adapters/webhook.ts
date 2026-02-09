import crypto from 'crypto';
import type { AgentConfig } from '../../shared/types/index.js';
import { createLogger } from '../../shared/utils/logger.js';
import { BaseAgentAdapter, type PageState, type AgentTurnResult, type ToolCall, BROWSER_TOOLS } from './base.js';

const log = createLogger('WebhookAdapter');

// Extended agent config for webhook agents
export interface WebhookAgentConfig extends AgentConfig {
  webhookUrl: string;
  webhookSecret: string;
}

// Request payload sent to user's webhook
export interface WebhookRequest {
  version: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  competitionId?: string;
  task: {
    systemPrompt: string;
    taskPrompt: string;
  };
  pageState: {
    url: string;
    title: string;
    accessibilityTree: string;
    error?: string;
  };
  previousActions: ToolCall[];
  turnNumber: number;
  availableTools: typeof BROWSER_TOOLS;
}

// Expected response from user's webhook
export interface WebhookResponse {
  thinking?: string;
  actions: Array<{
    tool: string;
    args: Record<string, unknown>;
  }>;
  done?: boolean;
  result?: unknown;
}

/**
 * Webhook Agent Adapter
 *
 * Allows users to host their own agent endpoints. AI Olympics sends
 * the page state and receives actions to execute.
 *
 * ## Security
 * - Requests are signed using HMAC-SHA256
 * - Signature is included in X-AI-Olympics-Signature header
 * - Timestamp prevents replay attacks (5 minute window)
 *
 * ## Request/Response Format
 *
 * Request to webhook:
 * ```json
 * {
 *   "version": "1.0",
 *   "timestamp": 1704067200000,
 *   "agentId": "abc123",
 *   "task": { "systemPrompt": "...", "taskPrompt": "..." },
 *   "pageState": { "url": "...", "title": "...", "accessibilityTree": "..." },
 *   "previousActions": [...],
 *   "turnNumber": 5,
 *   "availableTools": [...]
 * }
 * ```
 *
 * Expected response:
 * ```json
 * {
 *   "thinking": "I need to click the submit button",
 *   "actions": [
 *     { "tool": "click", "args": { "element": "Submit" } }
 *   ],
 *   "done": false
 * }
 * ```
 */
export class WebhookAgentAdapter extends BaseAgentAdapter {
  private webhookUrl: string;
  private webhookSecret: string;
  private previousActions: ToolCall[] = [];
  private turnNumber: number = 0;
  private competitionId?: string;

  constructor(config: WebhookAgentConfig) {
    super(config);
    this.webhookUrl = config.webhookUrl;
    this.webhookSecret = config.webhookSecret;
  }

  setCompetitionId(id: string): void {
    this.competitionId = id;
  }

  initialize(systemPrompt: string, taskPrompt: string): void {
    super.initialize(systemPrompt, taskPrompt);
    this.previousActions = [];
    this.turnNumber = 0;
  }

  reset(): void {
    super.reset();
    this.previousActions = [];
    this.turnNumber = 0;
  }

  async processTurn(pageState: PageState): Promise<AgentTurnResult> {
    this.turnNumber++;

    const request: WebhookRequest = {
      version: '1.0',
      timestamp: Date.now(),
      agentId: this.id,
      agentName: this.name,
      competitionId: this.competitionId,
      task: {
        systemPrompt: this.systemPrompt,
        taskPrompt: this.taskPrompt,
      },
      pageState: {
        url: pageState.url,
        title: pageState.title,
        accessibilityTree: pageState.accessibilityTree,
        error: pageState.error,
      },
      previousActions: this.previousActions,
      turnNumber: this.turnNumber,
      availableTools: BROWSER_TOOLS,
    };

    const signature = this.signRequest(request);

    log.info(`Sending webhook request to ${this.webhookUrl}`, {
      agentId: this.id,
      turnNumber: this.turnNumber,
    });

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Olympics-Signature': signature,
          'X-AI-Olympics-Timestamp': request.timestamp.toString(),
          'X-AI-Olympics-Agent-Id': this.id,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Webhook returned error`, {
          agentId: this.id,
          status: response.status,
          error: errorText,
        });
        throw new Error(`Webhook error: ${response.status} - ${errorText}`);
      }

      const webhookResponse = await response.json() as WebhookResponse;
      return this.parseResponse(webhookResponse);
    } catch (error) {
      log.error(`Failed to call webhook`, {
        agentId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return a failed result
      return {
        thinking: `Webhook call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolCalls: [],
        done: true,
        result: { error: true, message: 'Webhook unavailable' },
      };
    }
  }

  /**
   * Sign the request using HMAC-SHA256
   */
  private signRequest(request: WebhookRequest): string {
    const payload = JSON.stringify(request);
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Parse the webhook response into agent turn result
   */
  private parseResponse(response: WebhookResponse): AgentTurnResult {
    const toolCalls: ToolCall[] = [];

    // Convert webhook response actions to tool calls
    if (response.actions && Array.isArray(response.actions)) {
      for (const action of response.actions) {
        if (action.tool && typeof action.tool === 'string') {
          const toolCall: ToolCall = {
            name: action.tool,
            arguments: action.args || {},
          };
          toolCalls.push(toolCall);
          this.previousActions.push(toolCall);
        }
      }
    }

    // Check if the agent signaled done
    const isDone = response.done === true ||
      toolCalls.some(tc => tc.name === 'done');

    return {
      thinking: response.thinking,
      toolCalls,
      done: isDone,
      result: response.result,
    };
  }

  protected parseToolCalls(_response: unknown): ToolCall[] {
    // Not used for webhook adapter - parsing happens in parseResponse
    return [];
  }
}

/**
 * Verify a webhook signature
 * Use this in your webhook handler to verify requests are from AI Olympics
 *
 * Example:
 * ```typescript
 * app.post('/webhook', (req, res) => {
 *   const signature = req.headers['x-ai-olympics-signature'];
 *   const timestamp = req.headers['x-ai-olympics-timestamp'];
 *
 *   if (!verifyWebhookSignature(req.body, signature, 'your-secret')) {
 *     return res.status(401).json({ error: 'Invalid signature' });
 *   }
 *
 *   // Check timestamp to prevent replay attacks
 *   const ts = parseInt(timestamp);
 *   if (Date.now() - ts > 5 * 60 * 1000) {
 *     return res.status(401).json({ error: 'Request expired' });
 *   }
 *
 *   // Process the request...
 * });
 * ```
 */
export function verifyWebhookSignature(
  payload: unknown,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = `sha256=${
    crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex')
  }`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function verifyWebhookRequest(
  payload: unknown,
  signature: string,
  timestamp: string,
  secret: string,
  windowMs: number = REPLAY_WINDOW_MS
): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > windowMs) {
    return false;
  }
  return verifyWebhookSignature(payload, signature, secret);
}
