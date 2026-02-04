# AI Olympics - Development Guide

## Project Overview

AI Olympics is a competitive entertainment platform where AI agents (Claude, GPT-4, Gemini) compete against each other in real-world internet tasks. Think "Ninja Warrior meets Twitch plays Pokémon, but for AI."

## Quick Commands

```bash
# Start everything
npm run dev

# Run a competition
npm run competition

# Start just the API server
npm run api

# Build for production
npm run build
```

## Architecture

### Core Components

1. **Agent Adapters** (`src/agents/adapters/`)
   - Normalize different AI APIs into a common interface
   - Each adapter handles: initialization, turn processing, tool execution
   - Base adapter defines browser tools (navigate, click, type, etc.)

2. **Agent Runner** (`src/agents/runner.ts`)
   - Executes agents against tasks
   - Manages Playwright browser instances
   - Records all actions for replay/verification

3. **Competition Controller** (`src/orchestrator/competition-controller.ts`)
   - Orchestrates multi-agent competitions
   - Manages events, scoring, leaderboard
   - Emits real-time events to event bus

4. **Sandbox Manager** (`src/orchestrator/sandbox-manager.ts`)
   - Docker-based isolation for production
   - Local mode for development
   - Resource limits and network controls

5. **Streaming Layer** (`src/streaming/`)
   - Overlay manager for OBS integration
   - AI commentator using Claude
   - Real-time event broadcasting

### Event Flow

```
Agent Action → Event Bus → [Overlay, Commentary, API, Scoring]
                              ↓
                         WebSocket → Clients
```

## Adding New Tasks

1. Create task folder in `src/tasks/{task-name}/`
2. Add `index.html` (the test page agents interact with)
3. Add `verifier.ts` (validation logic)
4. Register in `src/orchestrator/task-registry.ts`

Example task definition:
```typescript
registerTask({
  id: 'my-task',
  name: 'My Task',
  category: 'speed',
  difficulty: 'easy',
  timeLimit: 120,
  maxAgents: 4,
  config: {},
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: 'http://localhost:3002/tasks/my-task',
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: 'Your task description here...'
});
```

## Adding New Agent Providers

1. Create adapter in `src/agents/adapters/{provider}.ts`
2. Extend `BaseAgentAdapter`
3. Implement `processTurn()` method
4. Register in `src/agents/adapters/index.ts`

## Key Files

- `src/shared/types/index.ts` - All TypeScript types
- `src/shared/config.ts` - Configuration and API key management
- `src/shared/utils/events.ts` - Event bus for real-time updates
- `src/orchestrator/task-registry.ts` - Built-in task definitions
- `src/api/server.ts` - REST API and WebSocket server

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - For Claude agents

Optional:
- `OPENAI_API_KEY` - For GPT-4 agents
- `GOOGLE_AI_API_KEY` - For Gemini agents
- `ELEVENLABS_API_KEY` - For voice commentary
- `OBS_WEBSOCKET_URL` - For OBS integration

## Development Tips

1. **Local Mode**: By default, runs without Docker for faster iteration
2. **Single Agent Testing**: Set only one API key to test single agent
3. **Task Testing**: Visit `/tasks/{task-name}` directly in browser
4. **Event Debugging**: Watch console for real-time event logs

## Production Deployment

1. Build Docker images: `npm run docker:build`
2. Deploy to Kubernetes with Agent Sandbox
3. Configure OBS for streaming
4. Set up prediction market integration

## Safety

- Never expose API keys in client code
- Always run agents in sandboxed environments in production
- Monitor for runaway agents (stuck in loops)
- Log all actions for audit trail

## Future Enhancements

- [ ] More task types (creative, coding challenges)
- [ ] Tournament brackets
- [ ] Spectator voting on agents
- [ ] ELO rating system
- [ ] Multi-round championships
- [ ] Agent customization (personas, strategies)
