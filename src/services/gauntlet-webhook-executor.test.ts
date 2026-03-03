import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGauntletWebhook } from './gauntlet-webhook-executor.js';
import { chromium } from 'playwright';
import { GauntletRunner } from './gauntlet-runner.js';
import { pickWeeklyTasks } from './gauntlet-tasks.js';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));
vi.mock('./gauntlet-runner.js');
vi.mock('./gauntlet-tasks.js');

const mockLocator = {
  ariaSnapshot: vi.fn().mockResolvedValue('- WebArea'),
};

const mockPage = {
  url: vi.fn().mockReturnValue('https://example.com'),
  goto: vi.fn().mockResolvedValue(null),
  close: vi.fn().mockResolvedValue(undefined),
  locator: vi.fn().mockReturnValue(mockLocator),
  isClosed: vi.fn().mockReturnValue(false),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockRunner = {
  runId: 'run-123',
  startTask: vi.fn(),
  recordFrame: vi.fn(),
  completeTask: vi.fn().mockResolvedValue({ score: 100, qualityPct: 1.0 }),
  finalize: vi.fn().mockResolvedValue({ totalScore: 500 }),
};

const mockTasks = [
  {
    id: 'web-001',
    title: 'OpenAI CEO',
    prompt: 'Find the CEO of OpenAI',
    timeLimitMs: 300_000,
    category: 'web-research' as const,
    verifierType: 'llm-judge' as const,
    verifierConfig: {},
    criteria: 'Sam Altman',
  },
];

// Minimal global fetch mock
global.fetch = vi.fn();

describe('executeGauntletWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as unknown as ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never);
    vi.mocked(pickWeeklyTasks).mockReturnValue(mockTasks as ReturnType<typeof pickWeeklyTasks>);
  });

  it('calls webhook each turn and finalises with completed on done action', async () => {
    // Webhook responds with 'done' on first turn
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ action: 'done', payload: 'Sam Altman, 2023' }),
    } as Response);

    await executeGauntletWebhook({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      webhookUrl: 'https://user-server.example.com/agent/turn',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://user-server.example.com/agent/turn');
    const body = JSON.parse(options.body as string);
    expect(body.run_id).toBe('run-123');
    expect(body.task_index).toBe(0);
    expect(body.task.id).toBe('web-001');

    expect(mockRunner.startTask).toHaveBeenCalledWith(0);
    expect(mockRunner.completeTask).toHaveBeenCalledWith(0, mockTasks[0], 'Sam Altman, 2023', expect.anything());
    expect(mockRunner.finalize).toHaveBeenCalledWith('completed');
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('executes a navigate action then done', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ action: 'navigate', payload: 'https://openai.com/about', reasoning: 'Check about page' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ action: 'done', payload: 'Sam Altman, 2023' }),
      } as Response);

    await executeGauntletWebhook({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      webhookUrl: 'https://user-server.example.com/agent/turn',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockPage.goto).toHaveBeenCalledWith('https://openai.com/about', expect.anything());
    expect(mockRunner.recordFrame).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'navigate', payload: 'https://openai.com/about', reasoning: 'Check about page' })
    );
    expect(mockRunner.finalize).toHaveBeenCalledWith('completed');
  });

  it('rejects internal/private IPs (SSRF protection)', async () => {
    await executeGauntletWebhook({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      webhookUrl: 'http://192.168.1.1/agent',
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRunner.finalize).toHaveBeenCalledWith('failed');
  });

  it('finalises with failed if webhook returns non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    await executeGauntletWebhook({
      runner: mockRunner as unknown as GauntletRunner,
      runId: 'run-123',
      weekNumber: 10,
      year: 2026,
      webhookUrl: 'https://user-server.example.com/agent/turn',
    });

    expect(mockRunner.finalize).toHaveBeenCalledWith('failed');
  });
});
