import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock functions (accessible inside vi.mock factories) ---
const { mockCreate, mockEmit, mockOn } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockEmit: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../shared/config.js', () => ({
  config: { anthropicApiKey: 'test-key' },
}));

vi.mock('../shared/utils/events.js', () => ({
  eventBus: {
    emit: mockEmit,
    on: mockOn,
  },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import AICommentator from './commentary.js';

// Helper: capture registered event handlers from mockOn calls
function getHandler(eventName: string): ((...args: unknown[]) => void) {
  const call = mockOn.mock.calls.find(
    (c: unknown[]) => c[0] === eventName
  );
  if (!call) {
    throw new Error(`No handler registered for event "${eventName}"`);
  }
  return call[1] as (...args: unknown[]) => void;
}

// Helper: build a mock Anthropic response
function mockAnthropicResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

describe('AICommentator', () => {
  let commentator: AICommentator;

  beforeEach(() => {
    vi.clearAllMocks();
    commentator = new AICommentator();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('registers event listeners for all required events', () => {
      const registeredEvents = mockOn.mock.calls.map(
        (c: unknown[]) => c[0]
      );
      expect(registeredEvents).toContain('event:start');
      expect(registeredEvents).toContain('agent:state');
      expect(registeredEvents).toContain('agent:action');
      expect(registeredEvents).toContain('agent:complete');
      expect(registeredEvents).toContain('event:end');
    });

    it('registers exactly 5 event listeners', () => {
      expect(mockOn).toHaveBeenCalledTimes(5);
    });

    it('creates an Anthropic client when API key is present', async () => {
      // The constructor created a client since config.anthropicApiKey = 'test-key'
      const mod = await import('@anthropic-ai/sdk');
      expect(mod.default).toHaveBeenCalledWith({ apiKey: 'test-key' });
    });
  });

  // =========================================================================
  // setEnabled
  // =========================================================================
  describe('setEnabled', () => {
    it('enables commentary', () => {
      commentator.setEnabled(true);
      // No error thrown
    });

    it('disables commentary', () => {
      commentator.setEnabled(true);
      commentator.setEnabled(false);
      // No error thrown
    });

    it('can be toggled multiple times', () => {
      commentator.setEnabled(true);
      commentator.setEnabled(false);
      commentator.setEnabled(true);
      // No error thrown; each call is valid
    });
  });

  // =========================================================================
  // Event handler: event:start
  // =========================================================================
  describe('event:start handler', () => {
    it('updates context eventName from task name', () => {
      const handler = getHandler('event:start');
      handler({ data: { task: { name: 'Speed Run' } } });
      // Stored internally; verified via opening commentary prompt in later tests
    });

    it('defaults to Unknown Event when no task name', () => {
      const handler = getHandler('event:start');
      handler({ data: {} });
      // No error thrown even with missing task
    });
  });

  // =========================================================================
  // Event handler: agent:state
  // =========================================================================
  describe('agent:state handler', () => {
    it('adds a new agent to context', () => {
      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'agent-1',
          status: 'running',
          progress: 50,
          actionCount: 5,
        },
      });
      // No error thrown; agent is stored internally
    });

    it('updates an existing agent in context', () => {
      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'agent-1',
          status: 'running',
          progress: 50,
          actionCount: 5,
        },
      });
      handler({
        data: {
          id: 'agent-1',
          status: 'completed',
          progress: 100,
          actionCount: 10,
        },
      });
      // No error thrown; agent context is updated in place
    });
  });

  // =========================================================================
  // Event handler: agent:action
  // =========================================================================
  describe('agent:action handler', () => {
    it('adds an action to recentActions', () => {
      const handler = getHandler('agent:action');
      handler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });
      // Action is stored internally; no error thrown
    });

    it('caps recentActions at 10 entries', () => {
      const handler = getHandler('agent:action');
      for (let i = 0; i < 12; i++) {
        handler({
          data: {
            timestamp: Date.now(),
            agentId: 'agent-1',
            type: 'click',
            success: true,
          },
        });
      }
      // Verify the internal array has at most 10 entries
      const recentActions = (commentator as any).context.recentActions;
      expect(recentActions.length).toBe(10);
    });
  });

  // =========================================================================
  // Event handler: agent:complete
  // =========================================================================
  describe('agent:complete handler', () => {
    it('triggers completion commentary when enabled', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('Agent finishes strong!')
      );

      const handler = getHandler('agent:complete');
      await handler({ data: { agentId: 'agent-1' } });

      expect(mockCreate).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        'commentary:update',
        expect.objectContaining({
          type: 'commentary:update',
          data: expect.objectContaining({
            text: 'Agent finishes strong!',
          }),
        })
      );
    });

    it('does not trigger completion commentary when disabled', async () => {
      commentator.setEnabled(false);
      const handler = getHandler('agent:complete');
      await handler({ data: { agentId: 'agent-1' } });

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Event handler: event:end
  // =========================================================================
  describe('event:end handler', () => {
    it('triggers closing commentary when enabled', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('What a race!')
      );

      const handler = getHandler('event:end');
      await handler();

      expect(mockCreate).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        'commentary:update',
        expect.objectContaining({
          type: 'commentary:update',
          data: expect.objectContaining({
            text: 'What a race!',
            emotion: 'celebratory',
            priority: 'critical',
          }),
        })
      );
    });

    it('does not trigger closing commentary when disabled', async () => {
      commentator.setEnabled(false);
      const handler = getHandler('event:end');
      await handler();

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // generateOpeningCommentary (via event:start handler)
  // =========================================================================
  describe('generateOpeningCommentary', () => {
    it('calls Anthropic API when enabled and emits commentary:update', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('Welcome to the Speed Run!')
      );

      const handler = getHandler('event:start');
      await handler({ data: { task: { name: 'Speed Run' } } });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 100,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Speed Run'),
            }),
          ]),
        })
      );

      expect(mockEmit).toHaveBeenCalledWith(
        'commentary:update',
        expect.objectContaining({
          type: 'commentary:update',
          data: expect.objectContaining({
            text: 'Welcome to the Speed Run!',
            emotion: 'excited',
            priority: 'high',
          }),
        })
      );
    });

    it('does not call Anthropic API when disabled', async () => {
      commentator.setEnabled(false);

      const handler = getHandler('event:start');
      await handler({ data: { task: { name: 'Speed Run' } } });

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      commentator.setEnabled(true);
      mockCreate.mockRejectedValue(new Error('API down'));

      const handler = getHandler('event:start');
      // Should not throw
      await handler({ data: { task: { name: 'Speed Run' } } });

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // hasCloseRace (indirectly tested via maybeGenerateCommentary)
  // =========================================================================
  describe('hasCloseRace (indirect)', () => {
    it('triggers race commentary when agents are within 15% progress', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('Neck and neck!')
      );

      // Set up two running agents with close progress
      const stateHandler = getHandler('agent:state');
      stateHandler({
        data: { id: 'agent-1', status: 'running', progress: 50, actionCount: 5 },
      });
      stateHandler({
        data: { id: 'agent-2', status: 'running', progress: 55, actionCount: 4 },
      });

      // Force lastCommentary to be old enough so maybeGenerateCommentary fires
      (commentator as any).lastCommentary = 0;

      const actionHandler = getHandler('agent:action');
      await actionHandler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    it('does not trigger race commentary with fewer than 2 running agents', async () => {
      commentator.setEnabled(true);

      const stateHandler = getHandler('agent:state');
      stateHandler({
        data: { id: 'agent-1', status: 'running', progress: 50, actionCount: 5 },
      });

      (commentator as any).lastCommentary = 0;

      const actionHandler = getHandler('agent:action');
      await actionHandler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('does not trigger race commentary when progress difference exceeds 15%', async () => {
      commentator.setEnabled(true);

      const stateHandler = getHandler('agent:state');
      stateHandler({
        data: { id: 'agent-1', status: 'running', progress: 50, actionCount: 5 },
      });
      stateHandler({
        data: { id: 'agent-2', status: 'running', progress: 80, actionCount: 4 },
      });

      (commentator as any).lastCommentary = 0;

      const actionHandler = getHandler('agent:action');
      await actionHandler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // emitCommentary structure
  // =========================================================================
  describe('emitCommentary', () => {
    it('emits correct event structure with trimmed text', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('  Great action!  ')
      );

      const handler = getHandler('event:end');
      await handler();

      expect(mockEmit).toHaveBeenCalledWith(
        'commentary:update',
        expect.objectContaining({
          type: 'commentary:update',
          timestamp: expect.any(Number),
          competitionId: '',
          data: expect.objectContaining({
            timestamp: expect.any(Number),
            text: 'Great action!',
            emotion: 'celebratory',
            priority: 'critical',
          }),
        })
      );
    });
  });

  // =========================================================================
  // Error commentary
  // =========================================================================
  describe('error commentary', () => {
    it('generates error commentary for recent failed actions', async () => {
      commentator.setEnabled(true);
      mockCreate.mockResolvedValue(
        mockAnthropicResponse('Oh no, a setback!')
      );

      // Set up an agent (no close race since only 1 running)
      const stateHandler = getHandler('agent:state');
      stateHandler({
        data: { id: 'agent-1', status: 'running', progress: 10, actionCount: 1 },
      });

      (commentator as any).lastCommentary = 0;

      const actionHandler = getHandler('agent:action');
      await actionHandler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'navigate',
          success: false,
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 80,
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('error'),
            }),
          ]),
        })
      );
    });
  });

  // =========================================================================
  // maybeGenerateCommentary rate limiting
  // =========================================================================
  describe('maybeGenerateCommentary rate limiting', () => {
    it('does not generate commentary if interval has not elapsed', async () => {
      commentator.setEnabled(true);

      // Set lastCommentary to now so interval check fails
      (commentator as any).lastCommentary = Date.now();

      const stateHandler = getHandler('agent:state');
      stateHandler({
        data: { id: 'agent-1', status: 'running', progress: 50, actionCount: 5 },
      });
      stateHandler({
        data: { id: 'agent-2', status: 'running', progress: 52, actionCount: 4 },
      });

      const actionHandler = getHandler('agent:action');
      await actionHandler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
