import Docker from 'dockerode';
import type { SandboxConfig, SandboxState, AgentConfig } from '../shared/types/index.js';
import { config } from '../shared/config.js';
import { createLogger } from '../shared/utils/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('SandboxManager');

// Docker configuration for agent sandboxes
const SANDBOX_IMAGE = 'ai-olympics-agent:latest';
const NETWORK_NAME = 'ai-olympics-network';

interface ContainerInfo {
  id: string;
  sandboxId: string;
  agentId: string;
  wsEndpoint?: string;
  state: SandboxState;
}

export class SandboxManager {
  private docker: Docker;
  private containers: Map<string, ContainerInfo> = new Map();
  private _networkId?: string;

  constructor() {
    // Connect to Docker daemon
    if (process.platform === 'win32') {
      this.docker = new Docker({ socketPath: '//./pipe/docker_engine' });
    } else {
      this.docker = new Docker({ socketPath: config.dockerSocket });
    }
  }

  // Initialize the sandbox environment
  async initialize(): Promise<void> {
    log.info('Initializing sandbox environment');

    // Ensure the network exists
    await this.ensureNetwork();

    // Check if sandbox image exists
    await this.checkImage();

    log.info('Sandbox environment ready');
  }

  // Ensure the Docker network exists
  private async ensureNetwork(): Promise<void> {
    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [NETWORK_NAME] }
      });

      if (networks.length === 0) {
        log.info(`Creating network: ${NETWORK_NAME}`);
        const network = await this.docker.createNetwork({
          Name: NETWORK_NAME,
          Driver: 'bridge',
          Internal: false
        });
        this._networkId = network.id;
      } else {
        this._networkId = networks[0].Id;
      }
    } catch (error) {
      log.error(`Failed to ensure network: ${error}`);
      throw error;
    }
  }

  // Check if the sandbox image exists
  private async checkImage(): Promise<void> {
    try {
      await this.docker.getImage(SANDBOX_IMAGE).inspect();
      log.info(`Sandbox image found: ${SANDBOX_IMAGE}`);
    } catch (error) {
      log.warn(`Sandbox image not found: ${SANDBOX_IMAGE}. Build it with 'npm run docker:build'`);
      // Don't throw - we can still work without Docker in dev mode
    }
  }

  // Create a sandbox for an agent
  async createSandbox(agentConfig: AgentConfig, sandboxConfig: Partial<SandboxConfig> = {}): Promise<SandboxState> {
    const sandboxId = `sandbox-${nanoid(8)}`;

    log.info(`Creating sandbox: ${sandboxId}`, { agentId: agentConfig.id });

    const fullConfig: SandboxConfig = {
      id: sandboxId,
      agentId: agentConfig.id,
      cpuLimit: sandboxConfig.cpuLimit || config.defaults.sandboxCpuLimit,
      memoryLimit: sandboxConfig.memoryLimit || config.defaults.sandboxMemoryLimit,
      timeLimit: sandboxConfig.timeLimit || config.defaults.timeLimit,
      allowedDomains: sandboxConfig.allowedDomains || ['*'],
      blockedDomains: sandboxConfig.blockedDomains || [],
      headless: sandboxConfig.headless ?? false,
      viewport: sandboxConfig.viewport || config.defaults.viewport,
      recordScreen: sandboxConfig.recordScreen ?? true,
      recordActions: sandboxConfig.recordActions ?? true
    };

    const state: SandboxState = {
      id: sandboxId,
      status: 'creating',
      createdAt: Date.now()
    };

    try {
      // Create the container
      const container = await this.docker.createContainer({
        Image: SANDBOX_IMAGE,
        name: sandboxId,
        Env: [
          `AGENT_ID=${agentConfig.id}`,
          `AGENT_PROVIDER=${agentConfig.provider}`,
          `HEADLESS=${fullConfig.headless}`,
          `VIEWPORT_WIDTH=${fullConfig.viewport.width}`,
          `VIEWPORT_HEIGHT=${fullConfig.viewport.height}`,
          // Pass API keys securely
          `ANTHROPIC_API_KEY=${config.anthropicApiKey}`,
          `OPENAI_API_KEY=${config.openaiApiKey}`,
          `GOOGLE_AI_API_KEY=${config.googleAiApiKey}`
        ],
        HostConfig: {
          Memory: fullConfig.memoryLimit * 1024 * 1024,  // Convert MB to bytes
          NanoCpus: fullConfig.cpuLimit * 1e9,  // Convert cores to nanoseconds
          NetworkMode: NETWORK_NAME,
          AutoRemove: true,
          // Security options for sandboxing
          SecurityOpt: ['no-new-privileges'],
          CapDrop: ['ALL'],
          CapAdd: ['SYS_ADMIN']  // Needed for Chrome/Chromium
        },
        ExposedPorts: {
          '9222/tcp': {}  // Chrome DevTools Protocol
        }
      });

      // Start the container
      await container.start();

      // Get container info
      const containerInfo = await container.inspect();
      const wsEndpoint = `ws://${containerInfo.NetworkSettings.Networks[NETWORK_NAME]?.IPAddress}:9222`;

      state.status = 'ready';
      state.containerId = container.id;
      state.browserEndpoint = wsEndpoint;

      // Store container info
      this.containers.set(sandboxId, {
        id: container.id,
        sandboxId,
        agentId: agentConfig.id,
        wsEndpoint,
        state
      });

      log.info(`Sandbox ready: ${sandboxId}`, { containerId: container.id, wsEndpoint });

      return state;

    } catch (error) {
      state.status = 'error';
      state.error = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create sandbox: ${state.error}`, { sandboxId });
      return state;
    }
  }

  // Create a sandbox using local browser (for development without Docker)
  async createLocalSandbox(agentConfig: AgentConfig): Promise<SandboxState> {
    const sandboxId = `local-${nanoid(8)}`;

    log.info(`Creating local sandbox: ${sandboxId}`, { agentId: agentConfig.id });

    const state: SandboxState = {
      id: sandboxId,
      status: 'ready',
      createdAt: Date.now(),
      browserEndpoint: 'local'  // Indicates to use local Playwright
    };

    this.containers.set(sandboxId, {
      id: 'local',
      sandboxId,
      agentId: agentConfig.id,
      wsEndpoint: 'local',
      state
    });

    return state;
  }

  // Get sandbox state
  getSandboxState(sandboxId: string): SandboxState | undefined {
    return this.containers.get(sandboxId)?.state;
  }

  // Stop a sandbox
  async stopSandbox(sandboxId: string): Promise<void> {
    const info = this.containers.get(sandboxId);
    if (!info) {
      log.warn(`Sandbox not found: ${sandboxId}`);
      return;
    }

    log.info(`Stopping sandbox: ${sandboxId}`);

    info.state.status = 'stopping';

    if (info.id !== 'local') {
      try {
        const container = this.docker.getContainer(info.id);
        await container.stop({ t: 5 });
        await container.remove().catch(() => {}); // May already be removed due to AutoRemove
      } catch (error) {
        log.error(`Failed to stop container: ${error}`);
      }
    }

    info.state.status = 'stopped';
    this.containers.delete(sandboxId);

    log.info(`Sandbox stopped: ${sandboxId}`);
  }

  // Stop all sandboxes
  async stopAllSandboxes(): Promise<void> {
    log.info(`Stopping all sandboxes (${this.containers.size})`);

    const stopPromises = Array.from(this.containers.keys()).map(id =>
      this.stopSandbox(id).catch(err => log.error(`Failed to stop ${id}: ${err}`))
    );

    await Promise.all(stopPromises);

    log.info('All sandboxes stopped');
  }

  // Get all active sandboxes
  getActiveSandboxes(): SandboxState[] {
    return Array.from(this.containers.values())
      .filter(c => c.state.status === 'ready' || c.state.status === 'running')
      .map(c => c.state);
  }

  // Clean up old containers (garbage collection)
  async cleanup(): Promise<void> {
    log.info('Cleaning up sandbox environment');

    await this.stopAllSandboxes();

    // Also clean up any orphaned containers from previous runs
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { name: ['sandbox-'] }
      });

      for (const containerInfo of containers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.stop({ t: 1 }).catch(() => {});
          await container.remove().catch(() => {});
          log.info(`Cleaned up orphaned container: ${containerInfo.Names[0]}`);
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    } catch (error) {
      log.warn(`Cleanup error: ${error}`);
    }
  }
}

// Singleton instance
export const sandboxManager = new SandboxManager();

export default SandboxManager;
