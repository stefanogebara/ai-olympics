import type { AgentConfig } from '../../shared/types/index.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('BaseAdapter');

// ============================================================================
// AGENT INPUT SANITIZATION
// ============================================================================

const PERSONA_NAME_MAX_LENGTH = 100;
const PERSONA_DESC_MAX_LENGTH = 300;
const PERSONA_STYLE_MAX_LENGTH = 100;

// Characters allowed in persona fields: alphanumeric, common punctuation, spaces
const SAFE_CHARS_RE = /[^a-zA-Z0-9\s.,!?;:'"()\-–—&@#%+=/\[\]{}]/g;

// Unicode homoglyph mappings - confusable characters that look like ASCII
// Based on Unicode confusables (TR39) for prompt injection evasion
const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0455': 's', '\u0458': 'j',
  '\u04bb': 'h', '\u0501': 'd', '\u051b': 'q', '\u051d': 'w',
  '\u2170': 'i', '\u2171': 'ii', '\u2172': 'iii', '\u2173': 'iv', '\u2174': 'v',
  '\uff41': 'a', '\uff42': 'b', '\uff43': 'c', '\uff44': 'd', '\uff45': 'e',
  '\uff46': 'f', '\uff47': 'g', '\uff48': 'h', '\uff49': 'i', '\uff4a': 'j',
  '\uff4b': 'k', '\uff4c': 'l', '\uff4d': 'm', '\uff4e': 'n', '\uff4f': 'o',
  '\uff50': 'p', '\uff51': 'q', '\uff52': 'r', '\uff53': 's', '\uff54': 't',
  '\uff55': 'u', '\uff56': 'v', '\uff57': 'w', '\uff58': 'x', '\uff59': 'y',
  '\uff5a': 'z',
  '\u200b': '',  // zero-width space
  '\u200c': '',  // zero-width non-joiner
  '\u200d': '',  // zero-width joiner
  '\u2060': '',  // word joiner
  '\ufeff': '',  // zero-width no-break space (BOM)
};

/**
 * Normalize Unicode to defeat homoglyph-based injection evasion.
 * 1. NFKC normalization (decomposes + recomposes compatibility chars)
 * 2. Map known Cyrillic/fullwidth/confusable characters to ASCII
 * 3. Strip zero-width characters
 */
function normalizeUnicode(input: string): string {
  // NFKC normalization handles fullwidth -> ASCII, ligatures, etc.
  let normalized = input.normalize('NFKC');

  // Map remaining homoglyphs that NFKC doesn't catch (e.g. Cyrillic)
  let result = '';
  for (const char of normalized) {
    result += HOMOGLYPH_MAP[char] ?? char;
  }

  return result;
}

// Patterns that indicate prompt injection attempts (case-insensitive, word-boundary-aware)
const INJECTION_PATTERNS = [
  // "Ignore/disregard/forget previous" variants
  /\bignore\s+(all\s+)?(previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above|earlier)\b/i,
  /\bforget\s+(all\s+)?(previous|prior|above|earlier)\b/i,
  // Override/change instructions
  /\boverride\s+(system|instruction|prompt|rule)/i,
  /\bnew\s+instruction/i,
  /\bchange\s+(your|the)\s+(role|instruction|prompt|rule)/i,
  // Identity manipulation
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(if|though)?\s*(you\s+are|a)\b/i,
  /\bpretend\s+(you\s+are|to\s+be)\b/i,
  /\broleplay\s+(as|like)\b/i,
  /\bfrom\s+now\s+on\b/i,
  /\bswitch\s+to\s+(a\s+)?new\s+(mode|persona|role)\b/i,
  // Role/message separators (ChatML, markdown headers used as separators)
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,
  /\bhuman\s*:\s*/i,
  /#{3,}/,                            // ### or more (markdown separators used to inject)
  /\[INST\]/i,                        // Llama-style instruction tags
  /<\|im_start\|>/i,                  // ChatML tags
  /<\|im_end\|>/i,
  // Known jailbreak terms
  /\b(jailbreak|DAN|bypass|hack)\b/i,
  /\bdo\s+anything\s+now\b/i,
  // Code/markup injection
  /```/,                              // code fences (often used in injection)
  /<\/?[a-z]+/i,                      // HTML/XML tags
  /\{[{%]/,                           // template syntax
  // Multi-line separator patterns (newlines used to create fake message boundaries)
  /\n{2,}\s*(system|assistant|user|human)\s*:/i,
];

/**
 * Sanitize a persona field value.
 * 1. Normalize Unicode (NFKC + homoglyph mapping)
 * 2. Strip control characters and non-safe characters
 * 3. Collapse whitespace
 * 4. Check for injection patterns (on both original and normalized)
 * 5. Enforce length limit
 * Returns the sanitized string, or empty string if injection detected.
 */
export function sanitizePersonaField(raw: string, maxLength: number): string {
  if (!raw || typeof raw !== 'string') return '';

  // Normalize Unicode first to defeat homoglyph evasion
  let clean = normalizeUnicode(raw);

  // Strip control characters (U+0000-U+001F, U+007F-U+009F)
  clean = clean.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // Replace non-safe characters
  clean = clean.replace(SAFE_CHARS_RE, '');

  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  // Check for injection patterns - reject entire field if detected
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      log.warn('Prompt injection attempt detected in persona field', {
        pattern: pattern.source,
        fieldPreview: clean.slice(0, 50),
      });
      return '';
    }
  }

  // Enforce length limit
  return clean.slice(0, maxLength);
}

// Browser tool definitions that agents can use
export interface BrowserTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

// Standard browser tools available to all agents
export const BROWSER_TOOLS: BrowserTool[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' }
      },
      required: ['url']
    }
  },
  {
    name: 'click',
    description: 'Click on an element identified by its accessible name or role',
    parameters: {
      type: 'object',
      properties: {
        element: { type: 'string', description: 'The accessible name, role, or text content of the element to click' },
        index: { type: 'number', description: 'If multiple matches, the index to click (0-based)' }
      },
      required: ['element']
    }
  },
  {
    name: 'type',
    description: 'Type text into an input field',
    parameters: {
      type: 'object',
      properties: {
        element: { type: 'string', description: 'The accessible name or label of the input field' },
        text: { type: 'string', description: 'The text to type' },
        clear: { type: 'boolean', description: 'Whether to clear the field first' }
      },
      required: ['element', 'text']
    }
  },
  {
    name: 'select',
    description: 'Select an option from a dropdown',
    parameters: {
      type: 'object',
      properties: {
        element: { type: 'string', description: 'The accessible name of the select element' },
        option: { type: 'string', description: 'The option text or value to select' }
      },
      required: ['element', 'option']
    }
  },
  {
    name: 'scroll',
    description: 'Scroll the page',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction to scroll' },
        amount: { type: 'number', description: 'Pixels to scroll (default 500)' }
      },
      required: ['direction']
    }
  },
  {
    name: 'wait',
    description: 'Wait for a condition or time',
    parameters: {
      type: 'object',
      properties: {
        condition: { type: 'string', description: 'What to wait for: "load", "network", or element selector' },
        timeout: { type: 'number', description: 'Max time to wait in ms' }
      },
      required: ['condition']
    }
  },
  {
    name: 'submit',
    description: 'Submit a form',
    parameters: {
      type: 'object',
      properties: {
        form: { type: 'string', description: 'The form identifier or button to click to submit' }
      },
      required: []
    }
  },
  {
    name: 'api_call',
    description: 'Make an HTTP API call to interact with backend services (e.g., browse markets, place bets, check portfolio). Returns the JSON response body.',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method (GET or POST)' },
        url: { type: 'string', description: 'The full URL to call (e.g., {API_BASE}/api/predictions/events)' },
        body: { type: 'string', description: 'JSON request body for POST requests (must be valid JSON string)' }
      },
      required: ['method', 'url']
    }
  },
  {
    name: 'done',
    description: 'Signal that the task is complete',
    parameters: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the task was completed successfully' },
        result: { type: 'string', description: 'Any result data to return' }
      },
      required: ['success']
    }
  }
];

// The result of an agent's turn
export interface AgentTurnResult {
  thinking?: string;
  toolCalls: ToolCall[];
  done: boolean;
  result?: unknown;
  /** Token usage reported by the model API (for cost tracking) */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ToolCall {
  id?: string;  // Tool call ID from the API (needed for tool results)
  name: string;
  arguments: Record<string, unknown>;
}

// Page state provided to the agent
export interface PageState {
  url: string;
  title: string;
  accessibilityTree: string;  // Simplified DOM representation
  screenshot?: string;  // Base64 if using vision
  error?: string;
}

// Abstract base class for all agent adapters
export abstract class BaseAgentAdapter {
  protected config: AgentConfig;
  protected systemPrompt: string = '';
  protected taskPrompt: string = '';
  protected conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get provider(): string {
    return this.config.provider;
  }

  // Initialize the agent with task instructions
  initialize(systemPrompt: string, taskPrompt: string): void {
    let finalSystemPrompt = systemPrompt;

    // Inject persona into system prompt with robust sanitization
    if (this.config.personaName) {
      const safeName = sanitizePersonaField(this.config.personaName, PERSONA_NAME_MAX_LENGTH);
      const safeDesc = this.config.personaDescription
        ? sanitizePersonaField(this.config.personaDescription, PERSONA_DESC_MAX_LENGTH)
        : '';
      const safeStyle = this.config.personaStyle
        ? sanitizePersonaField(this.config.personaStyle, PERSONA_STYLE_MAX_LENGTH)
        : '';

      // Only inject if the name survived sanitization
      if (safeName) {
        const personaPrefix = `You are ${safeName}.${safeDesc ? ` ${safeDesc}.` : ''}${safeStyle ? ` Your communication style is ${safeStyle}.` : ''}\n\n`;
        finalSystemPrompt = personaPrefix + finalSystemPrompt;
      } else {
        log.warn('Persona name was rejected by sanitization, using default prompt', { agentId: this.id });
      }
    }

    // Inject strategy modifier
    const strategyModifiers: Record<string, string> = {
      aggressive: 'Prioritize speed. Take risks. Skip verification.',
      cautious: 'Double-check everything. Prefer accuracy over speed.',
      creative: 'Try unconventional approaches. Think outside the box.',
      analytical: 'Break down problems systematically. Consider all options.',
    };
    const modifier = this.config.strategy && strategyModifiers[this.config.strategy];
    if (modifier) {
      finalSystemPrompt = finalSystemPrompt + `\n\nStrategy: ${modifier}`;
    }

    this.systemPrompt = finalSystemPrompt;
    this.taskPrompt = taskPrompt;
    this.conversationHistory = [];
    log.info(`Agent ${this.name} initialized`, { agentId: this.id });
  }

  // Reset the agent state
  reset(): void {
    this.conversationHistory = [];
    log.info(`Agent ${this.name} reset`, { agentId: this.id });
  }

  // Process a turn: given page state, return actions to take
  abstract processTurn(pageState: PageState): Promise<AgentTurnResult>;

  // Get available tools for this agent
  getTools(): BrowserTool[] {
    return BROWSER_TOOLS;
  }

  // Build the prompt for the current turn
  protected buildTurnPrompt(pageState: PageState): string {
    return `
Current page state:
- URL: ${pageState.url}
- Title: ${pageState.title}
${pageState.error ? `- Error: ${pageState.error}` : ''}

Accessibility tree (interactive elements):
${pageState.accessibilityTree}

Based on the task and current page state, decide what action to take next.
Use the provided tools to interact with the page.
When the task is complete, call the 'done' tool with success=true.
`.trim();
  }

  // Parse tool calls from the model response
  protected abstract parseToolCalls(response: unknown): ToolCall[];
}
