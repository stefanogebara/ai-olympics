/**
 * Tests for sandbox-manager.ts
 *
 * Covers: initialize, ensureNetwork, checkImage, createSandbox,
 * createLocalSandbox, getSandboxState, stopSandbox, stopAllSandboxes,
 * getActiveSandboxes, cleanup, getSecretBinds/cleanupSecrets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockListNetworks,
  mockCreateNetwork,
  mockGetImage,
  mockCreateContainer,
  mockGetContainer,
  mockListContainers,
  MockDocker,
  mockMkdirSync,
  mockWriteFileSync,
  mockRmSync,
  mockNanoid,
  mockTmpdir,
  mockConfig,
} = vi.hoisted(() => {
  const mockListNetworks = vi.fn();
  const mockCreateNetwork = vi.fn();
  const mockGetImage = vi.fn();
  const mockCreateContainer = vi.fn();
  const mockGetContainer = vi.fn();
  const mockListContainers = vi.fn();

  // Class mock so `new Dockerode()` works in Vitest 4.x ESM
  class MockDocker {
    listNetworks = mockListNetworks;
    createNetwork = mockCreateNetwork;
    getImage = mockGetImage;
    createContainer = mockCreateContainer;
    getContainer = mockGetContainer;
    listContainers = mockListContainers;
  }

  const mockMkdirSync = vi.fn();
  const mockWriteFileSync = vi.fn();
  const mockRmSync = vi.fn();

  const mockNanoid = vi.fn().mockReturnValue('abc12345');
  const mockTmpdir = vi.fn().mockReturnValue('/tmp');

  const mockConfig = {
    dockerSocket: '/var/run/docker.sock',
    anthropicApiKey: 'sk-ant-test',
    openaiApiKey: 'sk-openai-test',
    googleAiApiKey: '',
    defaults: {
      sandboxCpuLimit: 2,
      sandboxMemoryLimit: 4096,
      timeLimit: 300,
      viewport: { width: 1280, height: 720 },
    },
  };

  return {
    mockListNetworks, mockCreateNetwork, mockGetImage,
    mockCreateContainer, mockGetContainer, mockListContainers,
    MockDocker,
    mockMkdirSync, mockWriteFileSync, mockRmSync,
    mockNanoid, mockTmpdir, mockConfig,
  };
});

vi.mock('dockerode', () => ({ default: MockDocker }));
vi.mock('fs', () => ({
  default: { mkdirSync: mockMkdirSync, writeFileSync: mockWriteFileSync, rmSync: mockRmSync },
}));
vi.mock('os', () => ({ default: { tmpdir: mockTmpdir } }));
vi.mock('nanoid', () => ({ nanoid: mockNanoid }));
vi.mock('../shared/config.js', () => ({ config: mockConfig }));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SandboxManager } from './sandbox-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainerMock(ipAddress = '172.17.0.2') {
  return {
    id: 'container-abc123',
    start: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      NetworkSettings: {
        Networks: {
          'ai-olympics-network': { IPAddress: ipAddress },
        },
      },
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

const agentConfig = {
  id: 'agent-1',
  name: 'Test Agent',
  provider: 'claude' as const,
  model: 'claude-sonnet-4-5',
  color: '#ff0000',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let manager: SandboxManager;

beforeEach(() => {
  vi.resetAllMocks();
  mockNanoid.mockReturnValue('abc12345');
  mockTmpdir.mockReturnValue('/tmp');

  // Default Docker stubs
  mockListNetworks.mockResolvedValue([{ Id: 'net-existing' }]);
  mockCreateNetwork.mockResolvedValue({ id: 'net-new' });
  mockGetImage.mockReturnValue({ inspect: vi.fn().mockResolvedValue({}) });
  mockListContainers.mockResolvedValue([]);

  // Restore config
  mockConfig.anthropicApiKey = 'sk-ant-test';
  mockConfig.openaiApiKey = 'sk-openai-test';
  mockConfig.googleAiApiKey = '';

  manager = new SandboxManager();
});

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

describe('initialize', () => {
  it('calls listNetworks with the correct name filter', async () => {
    await manager.initialize();
    expect(mockListNetworks).toHaveBeenCalledWith({ filters: { name: ['ai-olympics-network'] } });
  });

  it('stores existing network ID without creating a new one', async () => {
    mockListNetworks.mockResolvedValue([{ Id: 'net-existing' }]);
    await manager.initialize();
    expect(mockCreateNetwork).not.toHaveBeenCalled();
    expect((manager as unknown as { _networkId: string })._networkId).toBe('net-existing');
  });

  it('creates a network when none exists and stores its ID', async () => {
    mockListNetworks.mockResolvedValue([]);
    mockCreateNetwork.mockResolvedValue({ id: 'net-new' });
    await manager.initialize();
    expect(mockCreateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ Name: 'ai-olympics-network', Driver: 'bridge' })
    );
    expect((manager as unknown as { _networkId: string })._networkId).toBe('net-new');
  });

  it('does not throw when sandbox image is missing (dev mode)', async () => {
    mockGetImage.mockReturnValue({ inspect: vi.fn().mockRejectedValue(new Error('not found')) });
    await expect(manager.initialize()).resolves.toBeUndefined();
  });

  it('throws when ensureNetwork fails', async () => {
    mockListNetworks.mockRejectedValue(new Error('Docker unreachable'));
    await expect(manager.initialize()).rejects.toThrow('Docker unreachable');
  });
});

// ---------------------------------------------------------------------------
// createSandbox
// ---------------------------------------------------------------------------

describe('createSandbox', () => {
  it('returns a ready state with container ID and WS endpoint', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    const state = await manager.createSandbox(agentConfig);

    expect(state.status).toBe('ready');
    expect(state.containerId).toBe('container-abc123');
    expect(state.browserEndpoint).toBe('ws://172.17.0.2:9222');
  });

  it('passes correct env and host config to createContainer', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    await manager.createSandbox(agentConfig, { headless: true, cpuLimit: 1, memoryLimit: 2048 });

    const call = mockCreateContainer.mock.calls[0][0];
    expect(call.Image).toBe('ai-olympics-agent:latest');
    expect(call.Env).toContain('AGENT_ID=agent-1');
    expect(call.Env).toContain('AGENT_PROVIDER=claude');
    expect(call.Env).toContain('HEADLESS=true');
    expect(call.HostConfig.Memory).toBe(2048 * 1024 * 1024);
    expect(call.HostConfig.NanoCpus).toBe(1e9);
    expect(call.HostConfig.NetworkMode).toBe('ai-olympics-network');
    expect(call.HostConfig.ReadonlyRootfs).toBe(true);
    expect(call.HostConfig.SecurityOpt).toContain('no-new-privileges');
    expect(call.HostConfig.CapDrop).toContain('ALL');
  });

  it('stores the container info in the internal map', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    const state = await manager.createSandbox(agentConfig);

    expect(manager.getSandboxState(state.id)).toBeDefined();
    expect(manager.getSandboxState(state.id)?.status).toBe('ready');
  });

  it('returns error state (without throwing) when Docker createContainer fails', async () => {
    mockCreateContainer.mockRejectedValue(new Error('Docker socket error'));

    const state = await manager.createSandbox(agentConfig);

    expect(state.status).toBe('error');
    expect(state.error).toContain('Docker socket error');
  });

  it('uses defaults from config when sandboxConfig fields are omitted', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    await manager.createSandbox(agentConfig);

    const call = mockCreateContainer.mock.calls[0][0];
    expect(call.HostConfig.Memory).toBe(mockConfig.defaults.sandboxMemoryLimit * 1024 * 1024);
    expect(call.HostConfig.NanoCpus).toBe(mockConfig.defaults.sandboxCpuLimit * 1e9);
  });
});

// ---------------------------------------------------------------------------
// getSecretBinds (tested via createSandbox)
// ---------------------------------------------------------------------------

describe('getSecretBinds', () => {
  it('writes non-empty API keys as secret files and returns bind mounts', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    await manager.createSandbox(agentConfig);

    // anthropicApiKey and openaiApiKey are set; googleAiApiKey is empty → 2 writes
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('anthropic_api_key'),
      'sk-ant-test',
      expect.objectContaining({ mode: 0o400 })
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('openai_api_key'),
      'sk-openai-test',
      expect.objectContaining({ mode: 0o400 })
    );

    const binds: string[] = mockCreateContainer.mock.calls[0][0].HostConfig.Binds;
    expect(binds.length).toBe(2);
    expect(binds[0]).toContain('anthropic_api_key');
    expect(binds[0]).toContain('/run/secrets/anthropic_api_key:ro');
  });

  it('skips empty API key values', async () => {
    mockConfig.anthropicApiKey = '';
    mockConfig.openaiApiKey = '';
    mockConfig.googleAiApiKey = '';
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);

    await manager.createSandbox(agentConfig);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    const binds: string[] = mockCreateContainer.mock.calls[0][0].HostConfig.Binds;
    expect(binds.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createLocalSandbox
// ---------------------------------------------------------------------------

describe('createLocalSandbox', () => {
  it('returns a ready state with browserEndpoint "local"', async () => {
    const state = await manager.createLocalSandbox(agentConfig);
    expect(state.status).toBe('ready');
    expect(state.browserEndpoint).toBe('local');
  });

  it('stores the sandbox in the containers map', async () => {
    const state = await manager.createLocalSandbox(agentConfig);
    expect(manager.getSandboxState(state.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getSandboxState
// ---------------------------------------------------------------------------

describe('getSandboxState', () => {
  it('returns the state for a known sandbox', async () => {
    const state = await manager.createLocalSandbox(agentConfig);
    const retrieved = manager.getSandboxState(state.id);
    expect(retrieved?.id).toBe(state.id);
  });

  it('returns undefined for an unknown sandbox', () => {
    expect(manager.getSandboxState('unknown-id')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stopSandbox
// ---------------------------------------------------------------------------

describe('stopSandbox', () => {
  it('is a no-op when sandbox is not found', async () => {
    await manager.stopSandbox('missing-id');
    expect(mockGetContainer).not.toHaveBeenCalled();
  });

  it('stops and removes the Docker container for a Docker-backed sandbox', async () => {
    const container = makeContainerMock();
    mockCreateContainer.mockResolvedValue(container);
    const state = await manager.createSandbox(agentConfig);

    mockGetContainer.mockReturnValue(container);
    await manager.stopSandbox(state.id);

    expect(container.stop).toHaveBeenCalledWith({ t: 5 });
    expect(container.remove).toHaveBeenCalled();
  });

  it('removes the sandbox from the containers map', async () => {
    const state = await manager.createLocalSandbox(agentConfig);
    expect(manager.getSandboxState(state.id)).toBeDefined();

    await manager.stopSandbox(state.id);

    expect(manager.getSandboxState(state.id)).toBeUndefined();
  });

  it('cleans up secret files matching the agent ID', async () => {
    const secretDir = '/tmp/aio-secrets-agent-1-abc12345';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).secretDirs.add(secretDir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).containers.set('sb-1', {
      id: 'local',
      sandboxId: 'sb-1',
      agentId: 'agent-1',
      state: { id: 'sb-1', status: 'ready', createdAt: Date.now() },
    });

    await manager.stopSandbox('sb-1');

    expect(mockRmSync).toHaveBeenCalledWith(secretDir, { recursive: true, force: true });
  });

  it('continues gracefully when Docker stop fails', async () => {
    const container = makeContainerMock();
    container.stop.mockRejectedValue(new Error('already stopped'));
    mockCreateContainer.mockResolvedValue(container);
    const state = await manager.createSandbox(agentConfig);
    mockGetContainer.mockReturnValue(container);

    await expect(manager.stopSandbox(state.id)).resolves.toBeUndefined();
    expect(manager.getSandboxState(state.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stopAllSandboxes
// ---------------------------------------------------------------------------

describe('stopAllSandboxes', () => {
  it('stops every active sandbox', async () => {
    const s1 = await manager.createLocalSandbox({ ...agentConfig, id: 'agent-1' });
    const s2 = await manager.createLocalSandbox({ ...agentConfig, id: 'agent-2' });

    await manager.stopAllSandboxes();

    expect(manager.getSandboxState(s1.id)).toBeUndefined();
    expect(manager.getSandboxState(s2.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getActiveSandboxes
// ---------------------------------------------------------------------------

describe('getActiveSandboxes', () => {
  it('returns only ready and running sandboxes', async () => {
    await manager.createLocalSandbox(agentConfig);
    // Manually add a stopped sandbox
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).containers.set('stopped-1', {
      id: 'local',
      sandboxId: 'stopped-1',
      agentId: 'agent-x',
      state: { id: 'stopped-1', status: 'stopped', createdAt: Date.now() },
    });

    const active = manager.getActiveSandboxes();

    expect(active.length).toBe(1);
    expect(active[0].status).toBe('ready');
  });

  it('returns empty array when no sandboxes are active', () => {
    expect(manager.getActiveSandboxes()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('stops all managed sandboxes and attempts to remove orphaned containers', async () => {
    const orphan = makeContainerMock();
    mockListContainers.mockResolvedValue([{ Id: 'orphan-1', Names: ['/sandbox-old'] }]);
    mockGetContainer.mockReturnValue(orphan);

    await manager.createLocalSandbox(agentConfig);
    await manager.cleanup();

    expect(manager.getActiveSandboxes()).toEqual([]);
    expect(mockListContainers).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { name: ['sandbox-'] } })
    );
    expect(orphan.stop).toHaveBeenCalled();
    expect(orphan.remove).toHaveBeenCalled();
  });

  it('completes without throwing when listContainers fails', async () => {
    mockListContainers.mockRejectedValue(new Error('Docker gone'));
    await expect(manager.cleanup()).resolves.toBeUndefined();
  });
});
