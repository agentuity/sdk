# @agentuity/react

React hooks and components for building Agentuity web applications.

## Installation

```bash
bun add @agentuity/react
```

## Overview

`@agentuity/react` provides React hooks and context providers for seamlessly integrating with Agentuity agents from your frontend application.

## Features

- **Type-safe agent calls** - Fully typed React hooks for calling agents
- **WebSocket support** - Real-time bidirectional communication with agents
- **Context provider** - Simple setup with React Context
- **Automatic data management** - Built-in state management for agent responses

## Quick Start

### 1. Setup Provider

Wrap your app with the `AgentuityProvider`:

```tsx
import { AgentuityProvider } from '@agentuity/react';

function App() {
	return (
		<AgentuityProvider baseUrl="http://localhost:3500">
			<YourApp />
		</AgentuityProvider>
	);
}
```

### 2. Use Agents

Call agents with type-safety using the `useAgent` hook:

```tsx
import { useAgent } from '@agentuity/react';

function MyComponent() {
	const { data, run } = useAgent('myAgent');

	const handleClick = async () => {
		const result = await run({ message: 'Hello' });
		console.log(result);
	};

	return (
		<div>
			<button onClick={handleClick}>Call Agent</button>
			{data && <div>Response: {JSON.stringify(data)}</div>}
		</div>
	);
}
```

### 3. WebSocket Communication

For real-time communication:

```tsx
import { useWebsocket } from '@agentuity/react';

function ChatComponent() {
	const { connected, send, setHandler } = useWebsocket('/chat');

	useEffect(() => {
		setHandler((message) => {
			console.log('Received:', message);
		});
	}, []);

	const sendMessage = () => {
		send({ text: 'Hello, agent!' });
	};

	return (
		<div>
			<div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
			<button onClick={sendMessage} disabled={!connected}>
				Send Message
			</button>
		</div>
	);
}
```

## API Reference

### AgentuityProvider

Context provider for Agentuity configuration.

**Props:**

- `baseUrl?: string` - Base URL for agent API calls (defaults to current origin)
- `children: ReactNode` - Child components

### useAgent

Hook for calling agents via HTTP.

```typescript
const { data, run } = useAgent<TName>(name);
```

**Parameters:**

- `name: string` - Agent name

**Returns:**

- `data?: TOutput` - Last response data
- `run: (input: TInput, options?: RunArgs) => Promise<TOutput>` - Function to invoke the agent

**RunArgs:**

- `query?: URLSearchParams` - Query parameters
- `headers?: Record<string, string>` - Custom headers
- `subpath?: string` - Subpath to append to agent URL
- `method?: string` - HTTP method (default: POST)
- `signal?: AbortSignal` - Abort signal for cancellation

### useWebsocket

Hook for WebSocket connections to agents.

```typescript
const { connected, send, setHandler, readyState, close } = useWebsocket<TInput, TOutput>(
	path,
	options
);
```

**Parameters:**

- `path: string` - WebSocket path
- `options?: WebsocketArgs` - Connection options

**Returns:**

- `connected: boolean` - Connection status
- `send: (data: TInput) => void` - Send data to server
- `setHandler: (handler: (data: TOutput) => void) => void` - Set message handler
- `readyState: number` - WebSocket ready state
- `close: () => void` - Close connection

## TypeScript

All hooks are fully typed and will infer input/output types from your agent definitions when using the generated types.

## License

MIT
