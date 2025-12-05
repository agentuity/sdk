# Server-Sent Events (SSE) Example

Demonstrates server-sent events for one-way real-time updates from server to client.

## Features

- Server-Sent Events (SSE)
- One-way server→client streaming
- Automatic reconnection
- Event types and IDs

## Running

```bash
cd examples/sse
bun install
bun run build
bun run dev
```

## Usage

```bash
# Using curl
curl http://localhost:3500/agent/sse

# Or EventSource in browser
```

## Key Concepts

### Creating an SSE Endpoint

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.sse('/agent/sse', (c) => {
	return c.streamSSE(async (stream) => {
		let id = 0;

		const interval = setInterval(() => {
			stream.writeSSE({
				id: String(id++),
				event: 'message',
				data: JSON.stringify({
					time: new Date().toISOString(),
					count: id,
				}),
			});
		}, 1000);

		// Cleanup on close
		stream.onAbort(() => {
			clearInterval(interval);
		});
	});
});

export default router;
```

### Browser Client

```typescript
const eventSource = new EventSource('/agent/sse');

eventSource.onmessage = (event) => {
	const data = JSON.parse(event.data);
	console.log('Received:', data);
};

eventSource.addEventListener('custom-event', (event) => {
	console.log('Custom event:', event.data);
});

eventSource.onerror = (error) => {
	console.error('SSE error:', error);
};
```

## SSE vs WebSocket

**Use SSE when:**

- One-way server→client communication
- Simple text-based updates
- Automatic reconnection needed
- HTTP-only infrastructure

**Use WebSocket when:**

- Bidirectional communication needed
- Binary data transfer
- Lower latency required
- Full-duplex communication

## Use Cases

- **Live dashboards** - Real-time metrics and updates
- **Notifications** - Push notifications to browser
- **Progress tracking** - Long-running operation updates
- **News feeds** - Live content updates
- **Stock tickers** - Real-time price updates

## Best Practices

1. **Set event IDs** - Enable client reconnection from last event
2. **Handle disconnections** - Clean up resources on abort
3. **Heartbeats** - Send periodic pings to keep connection alive
4. **Error recovery** - Clients automatically reconnect
5. **Content-Type** - Always use `text/event-stream`
