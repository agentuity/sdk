# WebSocket Example

Demonstrates bidirectional WebSocket communication with agents.

## Features

- WebSocket server setup
- Bidirectional messaging
- Real-time communication
- Connection management

## Running

```bash
cd examples/websocket
bun install
bun run build
bun run dev
```

## Usage

```bash
# Using websocat (install: brew install websocat)
websocat ws://localhost:3500/agent/websocket

# Or use JavaScript WebSocket client
```

## Key Concepts

### Creating a WebSocket Agent

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.websocket('/agent/websocket', (c) => {
	return {
		onOpen: (evt, ws) => {
			console.log('Client connected');
			ws.send('Welcome!');
		},

		onMessage: (evt, ws) => {
			const message = evt.data;
			console.log('Received:', message);

			// Echo back
			ws.send(`Echo: ${message}`);
		},

		onClose: () => {
			console.log('Client disconnected');
		},

		onError: (evt, ws) => {
			console.error('WebSocket error:', evt);
		},
	};
});

export default router;
```

### Browser Client

```typescript
const ws = new WebSocket('ws://localhost:3500/agent/websocket');

ws.onopen = () => {
	console.log('Connected');
	ws.send('Hello server!');
};

ws.onmessage = (event) => {
	console.log('Received:', event.data);
};
```

## Use Cases

- **Real-time chat** - Bidirectional messaging
- **Live updates** - Push updates to clients
- **Collaboration** - Multi-user real-time features
- **Notifications** - Push notifications to clients
- **Game servers** - Real-time game state sync

## Best Practices

1. **Handle disconnections** - Clean up on close
2. **Validate messages** - Parse and validate incoming data
3. **Error handling** - Catch and log WebSocket errors
4. **Authentication** - Verify clients before accepting connections
5. **Rate limiting** - Prevent message flooding
