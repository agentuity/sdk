# Agents Folder Guide

This folder contains AI agents for your Agentuity application. Each agent is organized in its own subdirectory.

## Directory Structure

Each agent folder must contain:
- **agent.ts** (required) - Agent definition with metadata, schema, and handler
- **route.ts** (optional) - HTTP routes for the agent endpoint

Example structure:
```
src/agent/
├── hello/
│   ├── agent.ts
│   └── route.ts
├── process-data/
│   ├── agent.ts
│   └── route.ts
└── registry.generated.ts (auto-generated)
```

## Creating an Agent

### Basic Agent (agent.ts)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'My Agent',
		description: 'What this agent does',
	},
	schema: {
		input: s.object({ 
			name: s.string(),
			age: s.number() 
		}),
		output: s.string(),
	},
	handler: async (c, input) => {
		// Access context: c.app, c.config, c.logger, c.kv, c.vector, c.stream
		return `Hello, ${input.name}! You are ${input.age} years old.`;
	},
});

export default agent;
```

### Agent with Lifecycle (setup/shutdown)

```typescript
import { createAgent, type AppState } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Lifecycle Agent',
		description: 'Agent with setup and shutdown',
	},
	schema: {
		input: s.object({ message: s.string() }),
		output: s.object({ result: s.string() }),
	},
	setup: async (app: AppState) => {
		// Initialize resources (runs once on startup)
		console.log('Setting up agent for app:', app.appName);
		return {
			agentId: `agent-${Math.random().toString(36).substr(2, 9)}`,
			connectionPool: ['conn-1', 'conn-2'],
		};
	},
	handler: async (ctx, input) => {
		// Access setup config via ctx.config (fully typed)
		console.log('Agent ID:', ctx.config.agentId);
		console.log('Connections:', ctx.config.connectionPool);
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
const agent = createAgent({
	// ... configuration
});

agent.addEventListener('started', (eventName, agent, ctx) => {
	console.log('Agent started:', ctx.config.agentId);
});

agent.addEventListener('completed', (eventName, agent, ctx) => {
	console.log('Agent completed');
});

export default agent;
```

## Creating Routes (route.ts)

Routes expose HTTP endpoints for your agent:

```typescript
import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

// GET /agent/hello
router.get('/', async (c) => {
	const result = await c.agent.hello.run({ name: 'World', age: 25 });
	return c.text(result);
});

// POST /agent/hello with validation
router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.hello.run(data);
	return c.text(result);
});

export default router;
```

## Agent Context (c)

The handler receives a context object with:

- **c.app** - Application state (appName, version, startedAt, config)
- **c.config** - Agent-specific config (from setup return value, fully typed)
- **c.logger** - Structured logger (info, warn, error, debug, trace)
- **c.kv** - Key-value storage
- **c.vector** - Vector storage
- **c.stream** - Stream management (create, list, delete)
- **c.agent** - Access to other agents (c.agent.otherAgent.run())

## Context in Routes (c)

Route handlers have additional context:

- **c.req** - Hono request object
- **c.var.logger** - Logger instance
- **Import agents directly** - Import and call agents directly instead of using c.var.agent

## Examples

### Using Key-Value Storage

```typescript
handler: async (c, input) => {
	await c.kv.set('user:123', { name: 'Alice', age: 30 });
	const user = await c.kv.get('user:123');
	return user;
}
```

### Using Streams

```typescript
handler: async (c, input) => {
	const stream = await c.stream.create('output', {
		metadata: { createdBy: 'my-agent' },
		contentType: 'text/plain',
	});
	await stream.write('Hello from stream');
	await stream.close();
	return { streamId: stream.id, url: stream.url };
}
```

### Calling Another Agent

```typescript
handler: async (c, input) => {
	const result = await c.agent.otherAgent.run({ data: input.value });
	return `Other agent returned: ${result}`;
}
```

## Subagents (Nested Agents)

Agents can have subagents organized one level deep. This is useful for grouping related functionality.

### Directory Structure for Subagents

```
src/agent/
└── team/              # Parent agent
    ├── agent.ts       # Parent agent
    ├── route.ts       # Parent routes
    ├── members/       # Subagent
    │   ├── agent.ts
    │   └── route.ts
    └── tasks/         # Subagent
        ├── agent.ts
        └── route.ts
```

### Parent Agent

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		name: 'Team Manager',
	},
	schema: {
		input: s.object({ action: s.union([s.literal('info'), s.literal('count')]) }),
		output: s.object({ 
			message: s.string(),
			timestamp: s.string() 
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

const agent = createAgent({
	metadata: {
		name: 'Members Subagent',
	},
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
		// Access parent agent
		const parentResult = await ctx.agent.team.run({ action: 'info' });
		const parentInfo = `Parent says: ${parentResult.message}`;
		
		// Subagent logic here
		let members = ['Alice', 'Bob'];
		if (action === 'add' && name) {
			members.push(name);
		}
		
		return { members, parentInfo };
	},
});

export default agent;
```

### Accessing Subagents from Routes

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// Call parent agent
	const teamInfo = await c.agent.team.run({ action: 'info' });
	
	// Call subagents (nested access)
	const members = await c.agent.team.members.run({ action: 'list' });
	const tasks = await c.agent.team.tasks.run({ action: 'list' });
	
	return c.json({ teamInfo, members, tasks });
});

export default router;
```

### Subagent Routes

Routes for subagents automatically mount under the parent path:

- Parent: `/agent/team`
- Subagent: `/agent/team/members`
- Subagent: `/agent/team/tasks`

### Key Points About Subagents

- **One level deep**: Only one level of nesting is supported (no nested subagents)
- **Access parent**: Subagents can call their parent via `ctx.agent.parentName.run()`
- **Agent names**: Subagents have dotted names like `"team.members"`
- **Route hierarchy**: Routes inherit parent path structure
- **Shared context**: Subagents share the same app context (kv, logger, etc.)

## Rules

- Each agent folder name becomes the agent's route name (e.g., `hello/` → `/agent/hello`)
- **agent.ts** must export default the agent instance
- **route.ts** must export default the router instance
- Input/output schemas are enforced with @agentuity/schema validation
- Setup return value type automatically flows to ctx.config (fully typed)
- Use c.logger for logging, not console.log
- Agent names in routes are accessed via c.agent.{folderName}
- Subagents are one level deep only (team/members/, not team/members/subagent/)
- Subagent routes mount under parent path (/agent/team/members)
- Agents do not necessary need a route.ts file if they aren't exposed externally
