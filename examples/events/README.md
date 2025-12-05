# Agent Events Example

Demonstrates how to use agent event listeners to track agent execution lifecycle.

## Features

- Event listeners: `started`, `completed`, `errored`
- Global event handlers
- State tracking across events
- Error handling patterns

## Running

```bash
cd examples/events
bun install
bun run build
bun run dev
```

## Usage

```bash
curl http://localhost:3500/agent/events
```

The agent will fire events during execution, visible in server logs.

## Key Concepts

### Event Types

- **started** - Fires when agent begins execution
- **completed** - Fires when agent completes successfully
- **errored** - Fires when agent throws an error

### Adding Event Listeners

```typescript
import { createAgent } from '@agentuity/runtime';

const agent = createAgent('my-agent', {
	handler: async (ctx) => {
		return 'result';
	},
});

// Add event listeners
agent.addEventListener('started', (eventName, agent, context) => {
	console.log('Agent started:', agent.metadata.name);
});

agent.addEventListener('completed', (eventName, agent, context) => {
	console.log('Agent completed:', agent.metadata.name);
});

agent.addEventListener('errored', (eventName, agent, context, error) => {
	console.error('Agent errored:', error.message);
});

export default agent;
```

### Use Cases

- **Logging** - Track agent execution
- **Metrics** - Measure performance
- **Debugging** - Trace execution flow
- **Auditing** - Record agent activity
