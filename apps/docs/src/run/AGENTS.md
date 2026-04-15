# Run Scripts Guide

This folder contains standalone demo scripts that showcase Agentuity SDK features. These scripts can be run locally or executed in cloud sandboxes via the SDK Explorer web UI.

## Purpose

- **Local development**: Test SDK features with `bun run src/run/{script}.ts`
- **Cloud sandboxes**: Scripts are executed in isolated cloud environments via the web UI
- **Reference implementations**: Each script demonstrates a specific SDK capability

## Directory Structure

```text
src/run/
├── AGENTS.md            # This file
├── hello.ts             # Basic agent invocation
├── invoke.ts            # Generic agent invoker
├── agent-calls.ts       # Agent invocation with background tasks
├── ai-gateway.ts        # Multi-provider LLM calls
├── chat.ts              # Conversational agent with state
├── database.ts          # SQL/database demo
├── email.ts             # Outbound email demo
├── schedule.ts          # Managed schedules lifecycle demo
├── durable-stream.ts    # Persistent streams with public URLs
├── handler-context.ts   # AgentContext API exploration
├── kv.ts                # Key-value storage
├── objectstore.ts       # S3/object storage
├── queue.ts             # Queue publish and cleanup demo
├── sse-stream.ts        # Server-Sent Events streaming
├── streaming.ts         # Raw text streaming
├── vector.ts            # Vector search
├── webrtc.ts            # WebRTC signaling simulation
├── websocket.ts         # WebSocket protocol simulation
└── model-arena.ts       # LLM-as-judge pattern
```

## Script Reference

### hello.ts - Basic Agent Invocation

Demonstrates the simplest agent invocation pattern using `ctx.invoke()`.

```bash
bun run src/run/hello.ts '{"name":"World"}'
```

### invoke.ts - Generic Agent Invoker

Dynamic agent loader that can run any agent by name via command line.

```bash
bun run src/run/invoke.ts <agent-name> '<json-input>'
```

### agent-calls.ts - Agent Invocation Patterns

Demonstrates `agent.run()` for agent invocation and `ctx.waitUntil()` for background tasks.

```bash
bun run src/run/agent-calls.ts '{"name":"World"}'
```

### ai-gateway.ts - Multi-Provider AI

Calls both OpenAI and Anthropic in parallel through the Agentuity gateway. No API keys needed locally.

```bash
bun run src/run/ai-gateway.ts '{"prompt":"Tell me a joke"}'
```

### chat.ts - Conversational Agent

Demonstrates thread state persistence and message history management with sliding window.

```bash
bun run src/run/chat.ts '{"message":"Hello!"}'
```

### database.ts - Database Querying

Demonstrates a database-backed agent invocation pattern.

```bash
bun run src/run/database.ts '{"query":"summary","seedData":true}'
```

### email.ts - Outbound Email

Demonstrates sending an email, then polling the outbound record for final status.

```bash
bun run src/run/email.ts '{"template":"welcome"}'
```

### schedule.ts - Managed Schedules

Demonstrates create → inspect → list deliveries → cleanup using `ScheduleClient`.

```bash
bun run src/run/schedule.ts '{"expression":"* * * * *"}'
```

### durable-stream.ts - Persistent Streams

Creates durable streams with shareable public URLs.

```bash
bun run src/run/durable-stream.ts '{"content":"Hello world"}'
```

### handler-context.ts - Context API Exploration

Shows the full `ctx` object API surface: identifiers, logging, storage, state management.

```bash
bun run src/run/handler-context.ts '{}'
```

### kv.ts - Key-Value Storage

Demonstrates KV storage workflow: set → get → delete with TTL support.

```bash
bun run src/run/kv.ts '{}'
```

### objectstore.ts - Object Storage

Demonstrates Bun's S3 API: write → read → delete workflow.

```bash
bun run src/run/objectstore.ts '{}'
```

### queue.ts - Queue Publishing

Demonstrates create → publish → cleanup for queue workflows.

```bash
bun run src/run/queue.ts '{}'
```

### sse-stream.ts - SSE Streaming

Demonstrates SSE-style streaming using `streamText()`.

```bash
bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
```

### streaming.ts - Raw Text Streaming

Demonstrates basic text streaming with `streamText()`.

```bash
bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
```

### vector.ts - Vector Search

Demonstrates semantic search: upsert → search → cleanup. Text is auto-embedded.

```bash
bun run src/run/vector.ts '{"query":"comfortable chair"}'
```

### websocket.ts - WebSocket Protocol Simulation

Demonstrates the protocol flow behind the Explorer WebSocket route.

```bash
bun run src/run/websocket.ts '{}'
```

### webrtc.ts - WebRTC Signaling Simulation

Demonstrates the signaling flow behind the Explorer WebRTC route.

```bash
bun run src/run/webrtc.ts '{}'
```

### model-arena.ts - LLM-as-Judge

Compares competing model outputs using structured evaluation with Zod schema validation.

```bash
bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
```

## Relationship to Sandbox

Scripts in this folder are **baked into the sandbox snapshot** for fast execution:

1. Scripts are included in the snapshot via `create-deps-snapshot.sh` (uploaded to `/home/agentuity/src/run/`)
2. **scripts.ts** (`src/api/sandbox/scripts.ts`) contains script names and default inputs for validation
3. When users click "Run" in the web UI, the sandbox executes: `bun run src/run/{scriptName}.ts {jsonInput}`
4. No file injection at runtime — scripts are already on disk in the snapshot

## Adding a New Script

1. **Create the script file:**

```typescript
// src/run/newscript.ts
import { invoke } from '@agentuity/runtime';

await invoke(async (ctx) => {
	const input = JSON.parse(process.argv[2] || '{}');

	// Your SDK demonstration code here
	const result = await ctx.kv.set('key', { value: input.data });

	console.log('---OUTPUT---');
	console.log(JSON.stringify({ success: true, result }, null, 2));
	console.log('---OUTPUT---');
});
```

2. **Regenerate script metadata:**

```bash
bun run generate:scripts
```

This updates `src/api/sandbox/scripts.ts` with the new script name and default input.

3. **Rebuild the sandbox snapshot** to include the new script (see `scripts/create-deps-snapshot.sh`).

4. **Add demo to demo-config.tsx** (if adding to web UI):

```typescript
// src/web/demo-config.tsx - Add to DEMOS array
{
  id: 'newscript',
  title: 'New Script',
  subtitle: 'Short description',
  description: 'Longer description for landing page',
  category: 'services', // or 'basics', 'io-patterns', 'examples'
  component: NewScriptDemo,
  codeExample: CODE_EXAMPLES.newscript,
  sandboxEnabled: true,
  sandboxScript: 'newscript',
  sandboxInput: { data: 'default' },
  // ...
}
```

## Script Patterns

### Output Format

All scripts output results wrapped in markers for sandbox parsing:

```typescript
console.log('---OUTPUT---');
console.log(JSON.stringify(result, null, 2));
console.log('---OUTPUT---');
```

### Input Parsing

Scripts receive JSON input via command line:

```typescript
const input = JSON.parse(process.argv[2] || '{}');
const { name = 'World' } = input;
```

### Context Access

Use `createAgentContext()` and `ctx.invoke()` for standalone execution:

```typescript
import { createAgentContext } from '@agentuity/runtime';
import myAgent from '../agent/myagent/agent';

const ctx = createAgentContext();

// Wrap agent calls in ctx.invoke()
const result = await ctx.invoke(() => myAgent.run({ input: 'value' }));

// Access context services
ctx.logger.info('Result', { result });
```

For background tasks, use `getAgentContext()` inside the invoke closure:

```typescript
import { createAgentContext, getAgentContext } from '@agentuity/runtime';

const ctx = createAgentContext();

await ctx.invoke(async () => {
	const innerCtx = getAgentContext();

	// Schedule background work
	innerCtx.waitUntil(
		(async () => {
			// This runs after main execution
		})()
	);
});
```

### Cleanup Philosophy

Most scripts delete/cleanup their demo data to avoid polluting storage:

```typescript
// Create
await ctx.kv.set(key, value);

// Use
const result = await ctx.kv.get(key);

// Cleanup
await ctx.kv.delete(key);
```

## Rules

- Scripts should be self-contained demonstrations
- Always cleanup demo data after use
- Use `---OUTPUT---` markers for sandbox-compatible output
- Parse input from `process.argv[2]` with sensible defaults
- When updating a script, run `bun run generate:scripts` and rebuild the snapshot
