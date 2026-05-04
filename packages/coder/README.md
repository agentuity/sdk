# @agentuity/coder

Standalone package for the Agentuity Coder service. Provides a simple, ergonomic client for managing Coder Hub sessions, participants, replay data, loop state, and users.

## Installation

```bash
npm install @agentuity/coder
```

## Quick Start

```typescript
import { CoderClient } from '@agentuity/coder';

const client = new CoderClient();

// List sessions
const { sessions } = await client.listSessions({ limit: 10 });
for (const session of sessions) {
  console.log(`${session.sessionId}: ${session.label} (${session.status})`);
}

// Create a new session
const session = await client.createSession({
  task: 'Implement feature X',
  workflowMode: 'standard',
});
console.log(`Created session: ${session.sessionId}`);

// Create a session from a saved workspace
const workspaceSession = await client.createSession({
  task: 'Test workspace startup',
  workspaceId: 'ws_...',
});
console.log(`Created workspace session: ${workspaceSession.sessionId}`);

// Manage workspace snapshot inputs
const validation = await client.validateWorkspaceDependencies(['git', 'nodejs']);
if (validation.invalid.length > 0) {
  throw new Error(validation.invalid.map((pkg) => pkg.error).join(', '));
}

const workspace = await client.createWorkspace({
  name: 'Node workspace',
  scope: 'org',
  dependencies: ['git', 'nodejs'],
  setupScript: 'corepack enable',
});

await client.updateWorkspace(workspace.id, {
  setupScript: 'corepack enable && bun install',
});

await client.refreshWorkspaceSnapshot(workspace.id);

// Get session details
const details = await client.getSession(session.sessionId);
console.log(`Task: ${details.task}`);

// Archive a session
await client.archiveSession(session.sessionId);
```

## Configuration

```typescript
const client = new CoderClient({
  apiKey: 'your-api-key',
  url: 'https://your-coder-hub-url.example.com',
  orgId: 'your-org-id',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_CODER_URL` | Override Coder Hub API URL | Auto-discovered via Catalyst |

## API Reference

### `CoderClient`

Main client for interacting with the Coder Hub API.

#### Constructor

```typescript
new CoderClient(options?: CoderClientOptions)
```

Options:
- `apiKey` - API key (defaults to `AGENTUITY_SDK_KEY` env var)
- `url` - Coder Hub API URL (defaults to `AGENTUITY_CODER_URL` env var, or auto-discovered)
- `region` - Region for Catalyst URL resolution (defaults to `AGENTUITY_REGION` env var)
- `orgId` - Organization ID for multi-tenant operations
- `logger` - Custom logger instance

#### Methods

- `getUrl()` - Get the resolved Coder Hub base URL
- `createSession(body)` - Create a new coder session
- `getSession(sessionId)` - Get session details
- `updateSession(sessionId, body)` - Update a session
- `listSessions(params?)` - List sessions with optional filtering
- `deleteSession(sessionId)` - Permanently delete a session
- `archiveSession(sessionId)` - Archive an active session
- `resumeSession(sessionId)` - Resume an archived session
- `listConnectableSessions(params?)` - List sessions the caller can connect to
- `getReplay(sessionId, params?)` - Get replay data for a session
- `listParticipants(sessionId, params?)` - List session participants
- `listEventHistory(sessionId, params?)` - List historical events for a session
- `getLoopState(sessionId, params?)` - Get loop-mode state for a session
- `listUsers(params?)` - List known users in the coder hub

## License

Apache-2.0
