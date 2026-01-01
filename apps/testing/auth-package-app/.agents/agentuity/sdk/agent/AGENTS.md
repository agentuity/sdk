# Agents Folder Guide

This folder contains AI agents for your Agentuity application. Each agent is organized in its own subdirectory.

## Generated Types

The `src/generated/` folder contains auto-generated TypeScript files:

- `registry.ts` - Agent registry with strongly-typed agent definitions and schema types
- `routes.ts` - Route registry for API, WebSocket, and SSE endpoints
- `app.ts` - Application entry point (regenerated on every build)

**Important:** Never edit files in `src/generated/` - they are overwritten on every build.

Import generated types in your agents:

```typescript
import type { HelloInput, HelloOutput } from '../generated/registry';
```

## Directory Structure

Each agent folder must contain:

- **agent.ts** (required) - Agent definition with schema and handler

Example structure:

```
src/agent/
├── hello/
│   └── agent.ts
├── process-data/
│   └── agent.ts
└── (generated files in src/generated/)
```

**Note:** HTTP routes are defined separately in `src/api/` - see the API folder guide for details.

## Creating an Agent

### Basic Agent (agent.ts)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('my-agent', {
	description: 'What this agent does',
	schema: {
		input: s.object({
			name: s.string(),
			age: s.number(),
		}),
		output: s.string(),
	},
	handler: async (ctx, input) => {
		// Access context: ctx.app, ctx.config, ctx.logger, ctx.kv, ctx.vector, ctx.stream
		return `Hello, ${input.name}! You are ${input.age} years old.`;
	},
});

export default agent;
```

### Agent with Lifecycle (setup/shutdown)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('lifecycle-agent', {
	description: 'Agent with setup and shutdown',
	schema: {
		input: s.object({ message: s.string() }),
		output: s.object({ result: s.string() }),
	},
	setup: async (app) => {
		// Initialize resources (runs once on startup)
		// app contains: appName, version, startedAt, config
		return {
			agentId: `agent-${Math.random().toString(36).substr(2, 9)}`,
			connectionPool: ['conn-1', 'conn-2'],
		};
	},
	handler: async (ctx, input) => {
		// Access setup config via ctx.config (fully typed)
		ctx.logger.info('Agent ID:', ctx.config.agentId);
		ctx.logger.info('Connections:', ctx.config.connectionPool);
		return { result: `Processed: ${input.message}` };
	},
	shutdown: async (app, config) => {
		// Cleanup resources (runs on shutdown)
		console.log('Shutting down agent:', config.agentId);
	},
});

export default agent;
```

### Agent with Event Listeners

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('event-agent', {
	schema: {
		input: s.object({ data: s.string() }),
		output: s.string(),
	},
	handler: async (ctx, input) => {
		return `Processed: ${input.data}`;
	},
});

agent.addEventListener('started', (eventName, agent, ctx) => {
	ctx.logger.info('Agent started');
});

agent.addEventListener('completed', (eventName, agent, ctx) => {
	ctx.logger.info('Agent completed');
});

agent.addEventListener('errored', (eventName, agent, ctx, error) => {
	ctx.logger.error('Agent errored:', error);
});

export default agent;
```

## Agent Context (ctx)

The handler receives a context object with:

- **ctx.app** - Application state (appName, version, startedAt, config from createApp)
- **ctx.config** - Agent-specific config (from setup return value, fully typed)
- **ctx.logger** - Structured logger (info, warn, error, debug, trace)
- **ctx.tracer** - OpenTelemetry tracer for custom spans
- **ctx.sessionId** - Unique session identifier
- **ctx.kv** - Key-value storage
- **ctx.vector** - Vector storage for embeddings
- **ctx.stream** - Stream storage for real-time data
- **ctx.state** - In-memory request-scoped state (Map)
- **ctx.thread** - Thread information for multi-turn conversations
- **ctx.session** - Session information
- **ctx.waitUntil** - Schedule background tasks

## Examples

### Using Key-Value Storage

```typescript
handler: async (ctx, input) => {
	await ctx.kv.set('user:123', { name: 'Alice', age: 30 });
	const user = await ctx.kv.get('user:123');
	await ctx.kv.delete('user:123');
	const keys = await ctx.kv.list('user:*');
	return user;
};
```

### Using Vector Storage

```typescript
handler: async (ctx, input) => {
	await ctx.vector.upsert('docs', [
		{ id: '1', values: [0.1, 0.2, 0.3], metadata: { text: 'Hello' } },
	]);
	const results = await ctx.vector.query('docs', [0.1, 0.2, 0.3], { topK: 5 });
	return results;
};
```

### Using Streams

```typescript
handler: async (ctx, input) => {
	const stream = await ctx.stream.create('agent-logs');
	await ctx.stream.write(stream.id, 'Processing step 1');
	await ctx.stream.write(stream.id, 'Processing step 2');
	return { streamId: stream.id };
};
```

### Background Tasks with waitUntil

```typescript
handler: async (ctx, input) => {
	// Schedule background work that continues after response
	ctx.waitUntil(async () => {
		await ctx.kv.set('processed', Date.now());
		ctx.logger.info('Background task complete');
	});

	return { status: 'processing' };
};
```

### Calling Another Agent

```typescript
// Import the agent directly
import otherAgent from '../other-agent/agent';

handler: async (ctx, input) => {
	const result = await otherAgent.run({ data: input.value });
	return `Other agent returned: ${result}`;
};
```

## Subagents (Nested Agents)

Agents can have subagents organized one level deep. This is useful for grouping related functionality.

### Directory Structure for Subagents

```
src/agent/
└── team/              # Parent agent
    ├── agent.ts       # Parent agent
    ├── members/       # Subagent
    │   └── agent.ts
    └── tasks/         # Subagent
        └── agent.ts
```

### Parent Agent

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('team', {
	description: 'Team Manager',
	schema: {
		input: s.object({ action: s.union([s.literal('info'), s.literal('count')]) }),
		output: s.object({
			message: s.string(),
			timestamp: s.string(),
		}),
	},
	handler: async (ctx, { action }) => {
		return {
			message: 'Team parent agent - manages members and tasks',
			timestamp: new Date().toISOString(),
		};
	},
});

export default agent;
```

### Subagent (Accessing Parent)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import parentAgent from '../agent';

const agent = createAgent('team.members', {
	description: 'Members Subagent',
	schema: {
		input: s.object({
			action: s.union([s.literal('list'), s.literal('add'), s.literal('remove')]),
			name: s.optional(s.string()),
		}),
		output: s.object({
			members: s.array(s.string()),
			parentInfo: s.optional(s.string()),
		}),
	},
	handler: async (ctx, { action, name }) => {
		// Call parent agent directly
		const parentResult = await parentAgent.run({ action: 'info' });
		const parentInfo = `Parent says: ${parentResult.message}`;

		let members = ['Alice', 'Bob'];
		if (action === 'add' && name) {
			members.push(name);
		}

		return { members, parentInfo };
	},
});

export default agent;
```

### Key Points About Subagents

- **One level deep**: Only one level of nesting is supported (no nested subagents)
- **Access parent**: Import and call parent agents directly
- **Agent names**: Subagents have dotted names like `"team.members"`
- **Shared context**: Subagents share the same app context (kv, logger, etc.)

## Rules

- Each agent folder name becomes the agent's route name (e.g., `hello/` → `/agent/hello`)
- **agent.ts** must export default the agent instance
- The first argument to `createAgent()` is the agent name (must match folder structure)
- Input/output schemas are enforced with @agentuity/schema validation
- Setup return value type automatically flows to ctx.config (fully typed)
- Use ctx.logger for logging, not console.log
- Import agents directly to call them (recommended approach)
- Subagents are one level deep only (team/members/, not team/members/subagent/)

<!-- prompt_hash: 9a71bb6d5544990d6ab3ecdf143b3a5caad26ce2e250df3b728a8d70bbf1fbad -->
