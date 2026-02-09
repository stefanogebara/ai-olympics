import type { AgentConfig } from '../../shared/types/index.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('BaseAdapter');

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
    this.systemPrompt = systemPrompt;
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
