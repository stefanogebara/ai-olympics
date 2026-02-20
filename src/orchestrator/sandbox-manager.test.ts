import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock objects are available inside vi.mock factory functions
const { mockContainer, mockDocker } = vi.hoisted(() => {
  const mockContainer = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      NetworkSettings: {
        Networks: {
          'ai-olympics-network': { IPAddress: '172.17.0.2' },
        },
      },
    }),
  };

  const mockDocker = {
    listNetworks: vi.fn().mockResolvedValue([{ Id: 'network-1' }]),
    createNetwork: vi.fn().mockResolvedValue({ id: 'network-new' }),
    getImage: vi.fn().mockReturnValue({ inspect: vi.fn().mockResolvedValue({}) }),
    createContainer: vi.fn().mockResolvedValue({
      ...mockContainer,
      id: 'container-abc123',
    }),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    listContainers: vi.fn().mockResolvedValue([]),
  };

  return { mockContainer, mockDocker };
});

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => mockDocker),
}));

vi.mock('../shared/config.js', () => ({
  config: {
    dockerSocket: '/var/run/docker.sock',
    anthropicApiKey: 'test-anthropic-key',
    openaiApiKey: '',
    googleAiApiKey: '',
    defaults: {
      sandboxCpuLimit: 2,
      sandboxMemoryLimit: 4096,
      timeLimit: 120,
      viewport: { width: 1280, height: 720 },
    },
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

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('test1234'),
}));

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

import { SandboxManager } from './sandbox-manager.js';
import type { AgentConfig } from '../shared/types/index.js';

const mockAgent: AgentConfig = {
  id: 'agent-1',
  name: 'Claude',
  provider: 'claude',
  model: 'claude-sonnet',
  color: '#D97706',
};

const mockAgent2: AgentConfig = {
  id: 'agent-2',
  name: 'GPT-4',
  provider: 'openai',
  model: 'gpt-4',
  color: '#10B981',
};

describe('SandboxManager', () => {
  let manager: SandboxManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SandboxManager();
  });

  // =========================================================================
  // constructor
  // =========================================================================
  describe('constructor', () => {
    it('creates a SandboxManager instance', () => {
      expect(manager).toBeInstanceOf(SandboxManager);
    });
  });

  // =========================================================================
  // initialize
  // =========================================================================
  describe('initialize', () => {
    it('ensures network exists', async () => {
      await manager.initialize();
      expect(mockDocker.listNetworks).toHaveBeenCalled();
    });

    it('creates network when none exists', async () => {
      mockDocker.listNetworks.mockResolvedValueOnce([]);
      await manager.initialize();
      expect(mockDocker.createNetwork).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: 'ai-olympics-network',
          Driver: 'bridge',
        }),
      );
    });

    it('reuses existing network', async () => {
      mockDocker.listNetworks.mockResolvedValueOnce([{ Id: 'existing-net-id' }]);
      await manager.initialize();
      expect(mockDocker.createNetwork).not.toHaveBeenCalled();
    });

    it('checks for sandbox image', async () => {
      await manager.initialize();
      expect(mockDocker.getImage).toHaveBeenCalledWith('ai-olympics-agent:latest');
    });

    it('does not throw when image is missing', async () => {
      mockDocker.getImage.mockReturnValueOnce({
        inspect: vi.fn().mockRejectedValue(new Error('not found')),
      });
      await expect(manager.initialize()).resolves.toBeUndefined();
    });

    it('throws when network creation fails', async () => {
      mockDocker.listNetworks.mockRejectedValueOnce(new Error('Docker daemon unavailable'));
      await expect(manager.initialize()).rejects.toThrow('Docker daemon unavailable');
    });
  });

  // =========================================================================
  // createLocalSandbox
  // =========================================================================
  describe('createLocalSandbox', () => {
    it('creates a local sandbox with ready status', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      expect(state.status).toBe('ready');
    });

    it('generates an ID with local- prefix', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      expect(state.id).toMatch(/^local-/);
    });

    it('sets browserEndpoint to local', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      expect(state.browserEndpoint).toBe('local');
    });

    it('sets createdAt timestamp', async () => {
      const before = Date.now();
      const state = await manager.createLocalSandbox(mockAgent);
      expect(state.createdAt).toBeGreaterThanOrEqual(before);
      expect(state.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('stores the sandbox in containers map', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      const retrieved = manager.getSandboxState(state.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(state.id);
    });

    it('can create multiple local sandboxes', async () => {
      const state1 = await manager.createLocalSandbox(mockAgent);
      const state2 = await manager.createLocalSandbox(mockAgent2);

      expect(state1.id).toBe(state2.id); // Same nanoid mock, but different agent
      // Both should be retrievable (though same ID due to mock)
      const active = manager.getActiveSandboxes();
      // Due to same nanoid mock, they overwrite each other
      expect(active.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // createSandbox (Docker)
  // =========================================================================
  describe('createSandbox', () => {
    it('creates a Docker container', async () => {
      const state = await manager.createSandbox(mockAgent);
      expect(mockDocker.createContainer).toHaveBeenCalled();
      expect(state.status).toBe('ready');
    });

    it('starts the container', async () => {
      await manager.createSandbox(mockAgent);
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('generates sandbox ID with sandbox- prefix', async () => {
      const state = await manager.createSandbox(mockAgent);
      expect(state.id).toMatch(/^sandbox-/);
    });

    it('sets containerId from Docker', async () => {
      const state = await manager.createSandbox(mockAgent);
      expect(state.containerId).toBe('container-abc123');
    });

    it('sets browserEndpoint from container network info', async () => {
      const state = await manager.createSandbox(mockAgent);
      expect(state.browserEndpoint).toBe('ws://172.17.0.2:9222');
    });

    it('uses default config values', async () => {
      await manager.createSandbox(mockAgent);

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      // Memory: 4096 MB = 4096 * 1024 * 1024 bytes
      expect(createCall.HostConfig.Memory).toBe(4096 * 1024 * 1024);
      // CPU: 2 cores = 2 * 1e9 nanoseconds
      expect(createCall.HostConfig.NanoCpus).toBe(2e9);
    });

    it('uses provided sandbox config overrides', async () => {
      await manager.createSandbox(mockAgent, {
        cpuLimit: 4,
        memoryLimit: 8192,
        timeLimit: 300,
      });

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      expect(createCall.HostConfig.Memory).toBe(8192 * 1024 * 1024);
      expect(createCall.HostConfig.NanoCpus).toBe(4e9);
    });

    it('sets environment variables for the agent', async () => {
      await manager.createSandbox(mockAgent);

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      expect(createCall.Env).toContain('AGENT_ID=agent-1');
      expect(createCall.Env).toContain('AGENT_PROVIDER=claude');
    });

    it('applies security options', async () => {
      await manager.createSandbox(mockAgent);

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      expect(createCall.HostConfig.SecurityOpt).toContain('no-new-privileges');
      expect(createCall.HostConfig.CapDrop).toContain('ALL');
      expect(createCall.HostConfig.ReadonlyRootfs).toBe(true);
    });

    it('returns error state when container creation fails', async () => {
      mockDocker.createContainer.mockRejectedValueOnce(new Error('Image not found'));

      const state = await manager.createSandbox(mockAgent);
      expect(state.status).toBe('error');
      expect(state.error).toBe('Image not found');
    });

    it('stores sandbox in containers map on success', async () => {
      const state = await manager.createSandbox(mockAgent);
      const retrieved = manager.getSandboxState(state.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('ready');
    });
  });

  // =========================================================================
  // getSandboxState
  // =========================================================================
  describe('getSandboxState', () => {
    it('returns state for existing sandbox', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      const retrieved = manager.getSandboxState(state.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(state.id);
    });

    it('returns undefined for non-existent sandbox', () => {
      const result = manager.getSandboxState('nonexistent-sandbox');
      expect(result).toBeUndefined();
    });

    it('returns undefined for empty string ID', () => {
      const result = manager.getSandboxState('');
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // stopSandbox
  // =========================================================================
  describe('stopSandbox', () => {
    it('stops a Docker sandbox container', async () => {
      const state = await manager.createSandbox(mockAgent);
      await manager.stopSandbox(state.id);

      expect(mockDocker.getContainer).toHaveBeenCalled();
      expect(mockContainer.stop).toHaveBeenCalled();
    });

    it('removes the container after stopping', async () => {
      const state = await manager.createSandbox(mockAgent);
      await manager.stopSandbox(state.id);

      expect(mockContainer.remove).toHaveBeenCalled();
    });

    it('sets status to stopped', async () => {
      const state = await manager.createSandbox(mockAgent);
      await manager.stopSandbox(state.id);

      // The sandbox should be removed from the containers map
      expect(manager.getSandboxState(state.id)).toBeUndefined();
    });

    it('does not make Docker calls for local sandbox', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      vi.clearAllMocks();

      await manager.stopSandbox(state.id);

      expect(mockDocker.getContainer).not.toHaveBeenCalled();
      expect(mockContainer.stop).not.toHaveBeenCalled();
    });

    it('removes local sandbox from containers map', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      await manager.stopSandbox(state.id);

      expect(manager.getSandboxState(state.id)).toBeUndefined();
    });

    it('handles non-existent sandbox gracefully', async () => {
      await expect(manager.stopSandbox('nonexistent')).resolves.toBeUndefined();
    });

    it('handles Docker stop errors gracefully', async () => {
      const state = await manager.createSandbox(mockAgent);
      mockContainer.stop.mockRejectedValueOnce(new Error('Container already stopped'));

      await expect(manager.stopSandbox(state.id)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // stopAllSandboxes
  // =========================================================================
  describe('stopAllSandboxes', () => {
    it('stops all active sandboxes', async () => {
      // We need unique nanoid values for different sandboxes
      let idCounter = 0;
      const { nanoid } = await import('nanoid');
      (nanoid as ReturnType<typeof vi.fn>).mockImplementation(() => `id-${++idCounter}`);

      await manager.createLocalSandbox(mockAgent);
      await manager.createLocalSandbox(mockAgent2);

      await manager.stopAllSandboxes();

      expect(manager.getActiveSandboxes()).toHaveLength(0);
    });

    it('handles empty containers map', async () => {
      await expect(manager.stopAllSandboxes()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // getActiveSandboxes
  // =========================================================================
  describe('getActiveSandboxes', () => {
    it('returns empty array when no sandboxes exist', () => {
      expect(manager.getActiveSandboxes()).toEqual([]);
    });

    it('returns sandboxes with ready status', async () => {
      await manager.createLocalSandbox(mockAgent);
      const active = manager.getActiveSandboxes();
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe('ready');
    });

    it('returns sandboxes with ready and running status', async () => {
      let idCounter = 0;
      const { nanoid } = await import('nanoid');
      (nanoid as ReturnType<typeof vi.fn>).mockImplementation(() => `id-${++idCounter}`);

      const state1 = await manager.createLocalSandbox(mockAgent);
      const state2 = await manager.createLocalSandbox(mockAgent2);

      // Manually set one to running
      state2.status = 'running';

      const active = manager.getActiveSandboxes();
      expect(active).toHaveLength(2);
      const statuses = active.map(s => s.status);
      expect(statuses).toContain('ready');
      expect(statuses).toContain('running');
    });

    it('excludes stopped sandboxes', async () => {
      const state = await manager.createLocalSandbox(mockAgent);
      await manager.stopSandbox(state.id);

      expect(manager.getActiveSandboxes()).toHaveLength(0);
    });

    it('excludes error sandboxes', async () => {
      mockDocker.createContainer.mockRejectedValueOnce(new Error('fail'));
      await manager.createSandbox(mockAgent);

      // Error state sandbox is not stored in the containers map
      expect(manager.getActiveSandboxes()).toHaveLength(0);
    });
  });

  // =========================================================================
  // cleanup
  // =========================================================================
  describe('cleanup', () => {
    it('stops all sandboxes', async () => {
      await manager.createLocalSandbox(mockAgent);
      await manager.cleanup();

      expect(manager.getActiveSandboxes()).toHaveLength(0);
    });

    it('cleans up orphaned Docker containers', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([
        { Id: 'orphan-1', Names: ['/sandbox-orphan-1'] },
        { Id: 'orphan-2', Names: ['/sandbox-orphan-2'] },
      ]);

      await manager.cleanup();

      expect(mockDocker.listContainers).toHaveBeenCalledWith(
        expect.objectContaining({
          all: true,
          filters: { name: ['sandbox-'] },
        }),
      );
      expect(mockDocker.getContainer).toHaveBeenCalledWith('orphan-1');
      expect(mockDocker.getContainer).toHaveBeenCalledWith('orphan-2');
    });

    it('handles cleanup errors for orphaned containers gracefully', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([
        { Id: 'orphan-err', Names: ['/sandbox-err'] },
      ]);
      mockDocker.getContainer.mockReturnValueOnce({
        stop: vi.fn().mockRejectedValue(new Error('already stopped')),
        remove: vi.fn().mockRejectedValue(new Error('already removed')),
      });

      await expect(manager.cleanup()).resolves.toBeUndefined();
    });

    it('handles Docker listContainers error gracefully', async () => {
      mockDocker.listContainers.mockRejectedValueOnce(new Error('Docker unavailable'));

      await expect(manager.cleanup()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Secret management
  // =========================================================================
  describe('secret management', () => {
    it('cleans up secrets when stopping a Docker sandbox', async () => {
      const fs = await import('fs');
      const state = await manager.createSandbox(mockAgent);

      // Secrets were written during createSandbox via getSecretBinds
      expect(fs.default.mkdirSync).toHaveBeenCalled();

      await manager.stopSandbox(state.id);

      // Cleanup should have been called
      expect(fs.default.rmSync).toHaveBeenCalled();
    });
  });
});
