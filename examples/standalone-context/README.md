# Standalone Context Example

This example demonstrates how to use `createAgentContext()` to execute agents outside of HTTP request contexts.

## Use Cases

- **Discord Bots**: Execute agents in response to Discord messages
- **Cron Jobs**: Run scheduled tasks with agents
- **WebSocket Callbacks**: Handle WebSocket events with agents
- **Background Workers**: Process queue jobs with agents
- **CLI Tools**: Build command-line tools powered by agents

## What's Included

This example provides the same infrastructure as HTTP requests:

- ✅ OpenTelemetry tracing with proper span hierarchy
- ✅ Session and thread management (save/restore)
- ✅ Background task handling (`ctx.waitUntil`)
- ✅ Session event tracking (start/complete)
- ✅ Access to all services (kv, stream, vector)
- ✅ Full logging with correlation

## Running the Example

```bash
bun run test
```

## Examples Demonstrated

1. **Simple one-off execution** - Create context, run agent, done
2. **Reuse context** - Create once, use for multiple agent calls
3. **Custom session ID** - Track sessions with your own IDs (e.g., Discord message IDs)
4. **Agent sequences** - Run multiple agents in a workflow

## Code Walkthrough

### Basic Usage

```typescript
import { createAgentContext } from '@agentuity/runtime';
import myAgent from './agents/my-agent';

const ctx = createAgentContext();
const result = await ctx.invoke(() => myAgent.run(input));
```

### Discord Bot Example

```typescript
client.on('messageCreate', async (message) => {
  const ctx = createAgentContext({ 
    sessionId: message.id,
    trigger: 'discord'
  });
  
  const response = await ctx.invoke(() => 
    chatAgent.run({ message: message.content })
  );
  
  await message.reply(response.text);
});
```

### Cron Job Example

```typescript
cron.schedule('0 * * * *', async () => {
  const ctx = createAgentContext({ trigger: 'cron' });
  await ctx.invoke(() => cleanupAgent.run());
});
```

## API Reference

### `createAgentContext(options?)`

Creates a standalone agent context for non-HTTP execution.

**Options:**
- `sessionId?: string` - Custom session ID (auto-generated if not provided)
- `trigger?: string` - Trigger type for telemetry (`'discord'`, `'cron'`, `'websocket'`, `'manual'`)
- `thread?: Thread` - Custom thread for conversation state
- `session?: Session` - Custom session
- `parentContext?: Context` - Parent OpenTelemetry context for distributed tracing

**Returns:** `StandaloneAgentContext`

### `ctx.invoke(fn, options?)`

Executes a function within the agent context.

**Parameters:**
- `fn: () => Promise<T>` - Function to execute (typically `() => agent.run(input)`)
- `options?.spanName?: string` - Custom span name for OpenTelemetry

**Returns:** `Promise<T>` - The function's return value

**Features:**
- Creates OpenTelemetry span
- Restores/saves session and thread
- Sends session events (start/complete)
- Waits for background tasks
- Handles errors and telemetry

## Observability

All invocations are fully traced with OpenTelemetry:

- Spans created for each invocation
- Session events tracked (if configured)
- Background tasks monitored
- Errors automatically recorded

Check your OpenTelemetry backend to see the traces!
