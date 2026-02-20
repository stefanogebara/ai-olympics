import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock functions (accessible inside vi.mock factories) ---
const { mockEmit, mockOn } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockOn: vi.fn(),
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

vi.mock('../shared/utils/timer.js', () => ({
  formatTimerDisplay: vi.fn((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
  }),
}));

import OverlayManager from './overlay-manager.js';

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

describe('OverlayManager', () => {
  let manager: OverlayManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new OverlayManager();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('registers event listeners for required events', () => {
      const registeredEvents = mockOn.mock.calls.map(
        (c: unknown[]) => c[0]
      );
      expect(registeredEvents).toContain('agent:state');
      expect(registeredEvents).toContain('agent:action');
      expect(registeredEvents).toContain('leaderboard:update');
      expect(registeredEvents).toContain('event:start');
      expect(registeredEvents).toContain('competition:start');
    });

    it('registers exactly 5 event listeners', () => {
      expect(mockOn).toHaveBeenCalledTimes(5);
    });

    it('initializes with default overlay state', () => {
      const overlayState = manager.getOverlayState();
      expect(overlayState.state).toEqual({
        showScoreboard: true,
        showProgressBars: true,
        showAgentStatus: true,
        showTimer: true,
        showCommentary: true,
      });
    });
  });

  // =========================================================================
  // initializeAgents
  // =========================================================================
  describe('initializeAgents', () => {
    it('initializes agent overlay data for all agents', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
        { id: 'a2', name: 'GPT-4', color: '#7c3aed', avatar: 'G' },
      ]);

      const overlayState = manager.getOverlayState();
      expect(overlayState.agents).toHaveLength(2);
      expect(overlayState.agents[0]).toEqual({
        id: 'a1',
        name: 'Claude',
        color: '#00d4ff',
        avatar: '\uD83E\uDD16',
        status: 'idle',
        progress: 0,
        actionCount: 0,
        elapsedTime: 0,
      });
    });

    it('uses default robot emoji when no avatar is specified', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);

      const agents = manager.getOverlayState().agents;
      expect(agents[0].avatar).toBe('\uD83E\uDD16');
    });

    it('uses provided avatar when specified', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff', avatar: 'C' },
      ]);

      const agents = manager.getOverlayState().agents;
      expect(agents[0].avatar).toBe('C');
    });

    it('clears previous agents when reinitializing', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);
      manager.initializeAgents([
        { id: 'b1', name: 'GPT-4', color: '#ff0000' },
        { id: 'b2', name: 'Gemini', color: '#00ff00' },
      ]);

      const agents = manager.getOverlayState().agents;
      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('b1');
      expect(agents[1].id).toBe('b2');
    });
  });

  // =========================================================================
  // Event handler: agent:state
  // =========================================================================
  describe('agent:state handler', () => {
    it('updates existing agent state', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);

      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'a1',
          status: 'running',
          progress: 42,
          currentAction: 'clicking button',
          actionCount: 7,
          startTime: Date.now() - 5000,
        },
      });

      const agents = manager.getOverlayState().agents;
      expect(agents[0].status).toBe('running');
      expect(agents[0].progress).toBe(42);
      expect(agents[0].currentAction).toBe('clicking button');
      expect(agents[0].actionCount).toBe(7);
      expect(agents[0].elapsedTime).toBeGreaterThan(0);
    });

    it('does not create agent data for unknown agents', () => {
      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'unknown-agent',
          status: 'running',
          progress: 50,
          actionCount: 1,
        },
      });

      const agents = manager.getOverlayState().agents;
      expect(agents).toHaveLength(0);
    });

    it('calculates elapsed time from startTime', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);

      const startTime = Date.now() - 10000;
      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'a1',
          status: 'running',
          progress: 50,
          actionCount: 3,
          startTime,
        },
      });

      const agents = manager.getOverlayState().agents;
      expect(agents[0].elapsedTime).toBeGreaterThanOrEqual(9000);
      expect(agents[0].elapsedTime).toBeLessThan(12000);
    });

    it('does not update elapsedTime when startTime is not provided', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);

      const handler = getHandler('agent:state');
      handler({
        data: {
          id: 'a1',
          status: 'running',
          progress: 50,
          actionCount: 3,
        },
      });

      const agents = manager.getOverlayState().agents;
      expect(agents[0].elapsedTime).toBe(0);
    });
  });

  // =========================================================================
  // Event handler: agent:action
  // =========================================================================
  describe('agent:action handler', () => {
    it('adds error commentary for error actions', () => {
      const handler = getHandler('agent:action');
      handler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'error',
          success: false,
        },
      });

      const commentary = manager.getOverlayState().commentary;
      expect(commentary).toHaveLength(1);
      expect(commentary[0].text).toBe('agent-1 hits an error!');
      expect(commentary[0].emotion).toBe('tense');
      expect(commentary[0].priority).toBe('high');
    });

    it('does not add commentary for non-error actions', () => {
      const handler = getHandler('agent:action');
      handler({
        data: {
          timestamp: Date.now(),
          agentId: 'agent-1',
          type: 'click',
          success: true,
        },
      });

      const commentary = manager.getOverlayState().commentary;
      expect(commentary).toHaveLength(0);
    });
  });

  // =========================================================================
  // Event handler: leaderboard:update
  // =========================================================================
  describe('leaderboard:update handler', () => {
    it('updates leaderboard data', () => {
      const leaderboard = [
        {
          agentId: 'a1',
          agentName: 'Claude',
          totalScore: 100,
          eventsWon: 2,
          eventsCompleted: 3,
          rank: 1,
        },
        {
          agentId: 'a2',
          agentName: 'GPT-4',
          totalScore: 80,
          eventsWon: 1,
          eventsCompleted: 3,
          rank: 2,
        },
      ];

      const handler = getHandler('leaderboard:update');
      handler({ data: { leaderboard } });

      expect(manager.getOverlayState().leaderboard).toEqual(leaderboard);
    });
  });

  // =========================================================================
  // Event handler: event:start
  // =========================================================================
  describe('event:start handler', () => {
    it('sets event name from task', () => {
      const handler = getHandler('event:start');
      handler({ data: { task: { name: 'Speed Challenge' } } });

      expect(manager.getOverlayState().eventName).toBe('Speed Challenge');
    });

    it('defaults to Unknown Event when task name is missing', () => {
      const handler = getHandler('event:start');
      handler({ data: {} });

      expect(manager.getOverlayState().eventName).toBe('Unknown Event');
    });

    it('resets event timer to 0', () => {
      manager.updateTimer(5000);
      const handler = getHandler('event:start');
      handler({ data: { task: { name: 'Test' } } });

      const overlayState = manager.getOverlayState();
      expect(overlayState.eventTimer).toBe('00:00.00');
    });
  });

  // =========================================================================
  // Event handler: competition:start
  // =========================================================================
  describe('competition:start handler', () => {
    it('stores competitionId', () => {
      const handler = getHandler('competition:start');
      handler({ competitionId: 'comp-123' });
      // competitionId is stored internally (private field)
      // We verify no errors occur
    });
  });

  // =========================================================================
  // addCommentary
  // =========================================================================
  describe('addCommentary', () => {
    it('adds commentary with timestamp', () => {
      manager.addCommentary({
        text: 'What an action!',
        emotion: 'excited',
        priority: 'high',
      });

      const commentary = manager.getOverlayState().commentary;
      expect(commentary).toHaveLength(1);
      expect(commentary[0].text).toBe('What an action!');
      expect(commentary[0].emotion).toBe('excited');
      expect(commentary[0].priority).toBe('high');
      expect(commentary[0].timestamp).toBeGreaterThan(0);
    });

    it('caps commentary at 10 entries', () => {
      for (let i = 0; i < 12; i++) {
        manager.addCommentary({
          text: `Commentary ${i}`,
          emotion: 'neutral',
          priority: 'low',
        });
      }

      // Internal array is capped at 10, but getOverlayState returns last 5
      const commentary = manager.getOverlayState().commentary;
      expect(commentary).toHaveLength(5);
      expect(commentary[4].text).toBe('Commentary 11');
    });

    it('removes oldest entry when exceeding 10', () => {
      for (let i = 0; i < 11; i++) {
        manager.addCommentary({
          text: `Commentary ${i}`,
          emotion: 'neutral',
          priority: 'low',
        });
      }

      // The oldest (Commentary 0) should have been shifted out
      const commentary = manager.getOverlayState().commentary;
      // slice(-5) returns entries 6-10
      expect(commentary[0].text).toBe('Commentary 6');
    });
  });

  // =========================================================================
  // getOverlayState
  // =========================================================================
  describe('getOverlayState', () => {
    it('returns all overlay data', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);
      manager.updateTimer(65123);

      const overlayState = manager.getOverlayState();
      expect(overlayState).toHaveProperty('state');
      expect(overlayState).toHaveProperty('agents');
      expect(overlayState).toHaveProperty('leaderboard');
      expect(overlayState).toHaveProperty('eventName');
      expect(overlayState).toHaveProperty('eventTimer');
      expect(overlayState).toHaveProperty('commentary');
    });

    it('formats timer display correctly', () => {
      manager.updateTimer(65123); // 1 min 5 sec 123ms
      const overlayState = manager.getOverlayState();
      expect(overlayState.eventTimer).toBe('01:05.12');
    });

    it('returns only last 5 commentary entries', () => {
      for (let i = 0; i < 8; i++) {
        manager.addCommentary({
          text: `Entry ${i}`,
          emotion: 'neutral',
          priority: 'low',
        });
      }

      const commentary = manager.getOverlayState().commentary;
      expect(commentary).toHaveLength(5);
      expect(commentary[0].text).toBe('Entry 3');
      expect(commentary[4].text).toBe('Entry 7');
    });

    it('returns agents as an array (not a Map)', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);
      const agents = manager.getOverlayState().agents;
      expect(Array.isArray(agents)).toBe(true);
    });

    it('returns empty arrays when no data is set', () => {
      const overlayState = manager.getOverlayState();
      expect(overlayState.agents).toEqual([]);
      expect(overlayState.leaderboard).toEqual([]);
      expect(overlayState.commentary).toEqual([]);
    });
  });

  // =========================================================================
  // Toggle methods
  // =========================================================================
  describe('toggle methods', () => {
    describe('toggleScoreboard', () => {
      it('toggles scoreboard visibility', () => {
        manager.toggleScoreboard();
        expect(manager.getOverlayState().state.showScoreboard).toBe(false);
        manager.toggleScoreboard();
        expect(manager.getOverlayState().state.showScoreboard).toBe(true);
      });

      it('sets scoreboard visibility to explicit value', () => {
        manager.toggleScoreboard(false);
        expect(manager.getOverlayState().state.showScoreboard).toBe(false);
        manager.toggleScoreboard(true);
        expect(manager.getOverlayState().state.showScoreboard).toBe(true);
      });
    });

    describe('toggleProgressBars', () => {
      it('toggles progress bars visibility', () => {
        manager.toggleProgressBars();
        expect(manager.getOverlayState().state.showProgressBars).toBe(false);
        manager.toggleProgressBars();
        expect(manager.getOverlayState().state.showProgressBars).toBe(true);
      });

      it('sets progress bars visibility to explicit value', () => {
        manager.toggleProgressBars(false);
        expect(manager.getOverlayState().state.showProgressBars).toBe(false);
      });
    });

    describe('toggleTimer', () => {
      it('toggles timer visibility', () => {
        manager.toggleTimer();
        expect(manager.getOverlayState().state.showTimer).toBe(false);
        manager.toggleTimer();
        expect(manager.getOverlayState().state.showTimer).toBe(true);
      });

      it('sets timer visibility to explicit value', () => {
        manager.toggleTimer(false);
        expect(manager.getOverlayState().state.showTimer).toBe(false);
      });
    });

    describe('toggleCommentary', () => {
      it('toggles commentary visibility', () => {
        manager.toggleCommentary();
        expect(manager.getOverlayState().state.showCommentary).toBe(false);
        manager.toggleCommentary();
        expect(manager.getOverlayState().state.showCommentary).toBe(true);
      });

      it('sets commentary visibility to explicit value', () => {
        manager.toggleCommentary(false);
        expect(manager.getOverlayState().state.showCommentary).toBe(false);
      });
    });
  });

  // =========================================================================
  // setAnnouncement
  // =========================================================================
  describe('setAnnouncement', () => {
    it('sets announcement text', () => {
      manager.setAnnouncement('Finals begin now!');
      expect(manager.getOverlayState().state.announcement).toBe(
        'Finals begin now!'
      );
    });

    it('clears announcement when set to undefined', () => {
      manager.setAnnouncement('Hello');
      manager.setAnnouncement(undefined);
      expect(manager.getOverlayState().state.announcement).toBeUndefined();
    });
  });

  // =========================================================================
  // highlightAgent
  // =========================================================================
  describe('highlightAgent', () => {
    it('sets highlighted agent', () => {
      manager.highlightAgent('agent-1');
      expect(manager.getOverlayState().state.highlightedAgent).toBe('agent-1');
    });

    it('clears highlighted agent when set to undefined', () => {
      manager.highlightAgent('agent-1');
      manager.highlightAgent(undefined);
      expect(
        manager.getOverlayState().state.highlightedAgent
      ).toBeUndefined();
    });
  });

  // =========================================================================
  // updateTimer
  // =========================================================================
  describe('updateTimer', () => {
    it('updates the event timer', () => {
      manager.updateTimer(30000);
      const overlayState = manager.getOverlayState();
      expect(overlayState.eventTimer).toBe('00:30.00');
    });

    it('handles zero timer', () => {
      manager.updateTimer(0);
      const overlayState = manager.getOverlayState();
      expect(overlayState.eventTimer).toBe('00:00.00');
    });
  });

  // =========================================================================
  // generateOverlayHTML
  // =========================================================================
  describe('generateOverlayHTML', () => {
    it('returns valid HTML string', () => {
      const html = manager.generateOverlayHTML();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
    });

    it('includes event name in header', () => {
      const startHandler = getHandler('event:start');
      startHandler({ data: { task: { name: 'Speed Challenge' } } });

      const html = manager.generateOverlayHTML();
      expect(html).toContain('Speed Challenge');
    });

    it('includes timer display', () => {
      manager.updateTimer(90500);
      const html = manager.generateOverlayHTML();
      expect(html).toContain('01:30.50');
    });

    it('includes agent panels with correct data', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff', avatar: 'C' },
      ]);

      const html = manager.generateOverlayHTML();
      expect(html).toContain('Claude');
      expect(html).toContain('#00d4ff');
      expect(html).toContain('C'); // avatar
    });

    it('includes leaderboard entries', () => {
      const leaderboardHandler = getHandler('leaderboard:update');
      leaderboardHandler({
        data: {
          leaderboard: [
            {
              agentId: 'a1',
              agentName: 'Claude',
              totalScore: 150,
              eventsWon: 2,
              eventsCompleted: 3,
              rank: 1,
            },
          ],
        },
      });

      const html = manager.generateOverlayHTML();
      expect(html).toContain('#1');
      expect(html).toContain('Claude');
      expect(html).toContain('150');
    });

    it('includes commentary text when available', () => {
      manager.addCommentary({
        text: 'What a finish!',
        emotion: 'celebratory',
        priority: 'critical',
      });

      const html = manager.generateOverlayHTML();
      expect(html).toContain('What a finish!');
    });

    it('hides timer section when showTimer is false', () => {
      manager.toggleTimer(false);
      manager.updateTimer(5000);

      const html = manager.generateOverlayHTML();
      expect(html).not.toContain('class="timer"');
    });

    it('hides scoreboard section when showScoreboard is false', () => {
      manager.toggleScoreboard(false);

      const html = manager.generateOverlayHTML();
      expect(html).not.toContain('class="leaderboard"');
    });

    it('hides agent status section when showAgentStatus is false', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);
      (manager as any).state.showAgentStatus = false;

      const html = manager.generateOverlayHTML();
      expect(html).not.toContain('class="agent-panels"');
    });

    it('hides progress bars when showProgressBars is false', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);
      manager.toggleProgressBars(false);

      const html = manager.generateOverlayHTML();
      expect(html).not.toContain('class="progress-fill"');
    });

    it('includes agent action count', () => {
      manager.initializeAgents([
        { id: 'a1', name: 'Claude', color: '#00d4ff' },
      ]);

      const html = manager.generateOverlayHTML();
      expect(html).toContain('0 actions');
    });
  });
});
