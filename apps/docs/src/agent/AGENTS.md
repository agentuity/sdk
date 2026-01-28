# Agents Folder Guide

This folder contains AI agents for your Agentuity application. Each agent is organized in its own subdirectory.

## Directory Structure

Each agent folder must contain:

- **agent.ts** (required) - Agent definition with schema and handler

Optional supporting files:

- **lib.ts**, **types.ts**, **prompts.ts** - Helper modules
- **sample-data.json** - Sample data for the agent
- **context.txt** - Context documents for LLM

Example structure:

```text
src/agent/
├── hello/
│   └── agent.ts
├── chat/
│   ├── agent.ts
│   └── agentuity-context.txt
├── model-arena/
│   ├── agent.ts
│   ├── lib.ts
│   ├── types.ts
│   └── prompts.ts
├── vector/
│   ├── agent.ts
│   └── sample-products.json
└── evals/
    ├── agent.ts
    └── eval.ts
```

**Note:** HTTP routes are in `src/api/`, not in agent folders.

## Creating an Agent

### Basic Agent (agent.ts)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('hello', {
	description: 'Simple greeting agent',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.string(),
	},
	handler: async (ctx, { name }) => {
		ctx.logger.info('Greeting', { name });
		return `Hello, ${name}!`;
	},
});

export default agent;
```

The first argument is the agent name, followed by the configuration object.

### Agent with LLM Integration

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const agent = createAgent('chat', {
	description: 'Conversational agent with AI responses',
	schema: {
		input: s.object({ message: s.string() }),
		output: s.string(),
	},
	handler: async (ctx, { message }) => {
		const { text } = await generateText({
			model: google('gemini-3-flash-preview'),
			prompt: message,
		});
		return text;
	},
});

export default agent;
```

### Agent with State (Thread/Session)

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('stateful', {
	description: 'Agent with persistent state',
	schema: {
		input: s.object({ message: s.string() }),
		output: s.object({ response: s.string(), turnCount: s.number() }),
	},
	handler: async (ctx, { message }) => {
		// Thread state persists across requests (conversation history)
		const history = (await ctx.thread.state.get<string[]>('history')) || [];
		history.push(message);
		await ctx.thread.state.set('history', history);

		// Session state is ephemeral (per-request metadata)
		await ctx.session.state.set('lastMessage', message);

		return {
			response: `You said: ${message}`,
			turnCount: history.length,
		};
	},
});

export default agent;
```

## Agent Context (ctx)

The handler receives a context object with:

- **ctx.logger** - Structured logger (info, warn, error, debug, trace)
- **ctx.kv** - Key-value storage
- **ctx.vector** - Vector storage
- **ctx.stream** - Durable stream management (create, list, delete)
- **ctx.agent** - Access to other agents for agent-to-agent calls
- **ctx.thread.state** - Persistent state across requests (conversation history)
- **ctx.session.state** - Ephemeral state for single request
- **ctx.sessionId** - Current session identifier
- **ctx.threadId** - Current thread identifier

## Calling Agents

### From API Routes (most common)

Import the agent directly and call `.run()`:

```typescript
// src/api/hello/route.ts
import { createRouter } from '@agentuity/runtime';
import helloAgent from '../../agent/hello/agent';

const router = createRouter();

router.post('/', helloAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const text = await helloAgent.run(data);
	return c.text(text);
});

export default router;
```

### From Run Scripts (standalone execution)

Use `createAgentContext()` and wrap calls in `ctx.invoke()`:

```typescript
// src/run/hello.ts
import { createAgentContext } from '@agentuity/runtime';
import helloAgent from '../agent/hello/agent';

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = createAgentContext();

const result = await ctx.invoke(() => helloAgent.run(input));

console.log('---OUTPUT---');
console.log(result);
```

### From Agent Handlers (agent-to-agent)

Use `ctx.agent.{name}.run()` for agent-to-agent communication:

```typescript
handler: async (ctx, input) => {
	// Call another agent via ctx.agent
	const result = await ctx.agent.otherAgent.run({ data: input.value });
	return `Other agent returned: ${result}`;
};
```

## Examples

### Using Key-Value Storage

```typescript
handler: async (c, input) => {
	await c.kv.set('user:123', { name: 'Alice', age: 30 });
	const user = await c.kv.get('user:123');
	return user;
};
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
};
```

### Calling Another Agent

```typescript
handler: async (c, input) => {
	const result = await c.agent.otherAgent.run({ data: input.value });
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
	description: 'Team manager agent',
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

const agent = createAgent('team.members', {
	description: 'Team members subagent',
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

### Calling Subagents from API Routes

Import agents directly:

```typescript
// In src/api/team/route.ts
import { createRouter } from '@agentuity/runtime';
import teamAgent from '../../agent/team/agent';
import membersAgent from '../../agent/team/members/agent';
import tasksAgent from '../../agent/team/tasks/agent';

const router = createRouter();

router.get('/', async (c) => {
	// Call agents directly
	const teamInfo = await teamAgent.run({ action: 'info' });
	const members = await membersAgent.run({ action: 'list' });
	const tasks = await tasksAgent.run({ action: 'list' });

	return c.json({ teamInfo, members, tasks });
});

export default router;
```

### Key Points About Subagents

- **One level deep**: Only one level of nesting is supported (no nested subagents)
- **Access parent**: Subagents can call their parent via `ctx.agent.parentName.run()`
- **Agent names**: Subagents have dotted names like `"team.members"`
- **Shared context**: Subagents share the same app context (kv, logger, etc.)

## Rules

- **agent.ts** must export default the agent instance
- Agent name is the first argument to `createAgent('name', {...})`
- Input/output schemas are enforced with @agentuity/schema validation
- Use `ctx.logger` for logging in agents (or `c.var.logger` in routes), not console.log
- **From routes**: Import agent directly, call `agent.run()`
- **From handlers**: Use `ctx.agent.{agentName}.run()` for agent-to-agent calls
- **From run scripts**: Wrap in `ctx.invoke()`, import agent directly
- Subagents are one level deep only (team/members/, not team/members/subagent/)
- HTTP routes for agents go in `src/api/`, not in agent folders
