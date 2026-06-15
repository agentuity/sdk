# Agent Guidelines for @agentuity/coder

## Package Overview

Standalone package for the Agentuity Coder service. Provides a simple, ergonomic client for managing Coder Hub sessions, participants, replay data, loop state, and users.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: CoderClient, WebSocket/SSE clients, and types from this package (`api-reference` stays in core for docs)
- **Dependencies**: @agentuity/core, @agentuity/config, @agentuity/client, @agentuity/sandbox, zod

## Usage

```typescript
import { CoderClient } from '@agentuity/coder';

const client = new CoderClient();

// List sessions
const { sessions } = await client.listSessions({ limit: 10 });
for (const session of sessions) {
  console.log(`${session.sessionId}: ${session.label}`);
}

// Create a new session
const session = await client.createSession({
  task: 'Implement feature X',
  workflowMode: 'standard',
});
console.log(`Created session: ${session.sessionId}`);
```

## Publishing

1. Run `bun run build`
2. Publish after `@agentuity/adapter`, `@agentuity/api`, `@agentuity/client`, `@agentuity/config`, `@agentuity/sandbox`
