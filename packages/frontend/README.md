# @agentuity/frontend

Generic web utilities for building Agentuity frontend applications. Provides framework-agnostic utilities for URL building, serialization, reconnection logic, and type definitions.

This package contains reusable JavaScript logic that can be shared across different frontend frameworks (React, Svelte, Vue, etc.).

## Installation

```bash
npm install @agentuity/frontend
```

## Features

- **URL Building**: Utilities for constructing URLs with query parameters
- **Environment Helpers**: Cross-platform environment variable access
- **Serialization**: JSON serialization/deserialization utilities
- **Reconnection Logic**: Exponential backoff reconnection manager for WebSockets and SSE
- **Type Definitions**: Shared TypeScript types for route registries
- **Memoization**: JSON-based equality checking
- **WebRTC**: Multi-peer connections with data channels, screen sharing, and recording

## Usage

### URL Building

```typescript
import { buildUrl, defaultBaseUrl } from '@agentuity/frontend';

const url = buildUrl(
	'https://api.example.com',
	'/users',
	undefined,
	new URLSearchParams({ page: '1' })
);
// => 'https://api.example.com/users?page=1'
```

### Reconnection Manager

```typescript
import { createReconnectManager } from '@agentuity/frontend';

const reconnect = createReconnectManager({
	onReconnect: () => console.log('Reconnecting...'),
	threshold: 3,
	baseDelay: 500,
	factor: 2,
	maxDelay: 30000,
});

// Record failures to trigger exponential backoff
reconnect.recordFailure();
```

### Serialization

```typescript
import { deserializeData } from '@agentuity/frontend';

const data = deserializeData<MyType>('{"key":"value"}');
```

### WebRTC

Multi-peer WebRTC connections with auto-reconnection and data channels:

```typescript
import { WebRTCManager } from '@agentuity/frontend';

const manager = new WebRTCManager({
	signalUrl: 'ws://localhost:3500/api/webrtc/signal',
	roomId: 'my-room',
	autoReconnect: true,
});

manager.on('peerConnected', (peerId) => console.log('Peer joined:', peerId));
manager.on('dataChannelMessage', ({ channel, data }) => console.log(channel, data));

await manager.connect();
manager.sendJSON('chat', { message: 'Hello!' });
```

Key features:

- Multi-peer mesh networking
- Auto-reconnection with exponential backoff
- Data channels (JSON, binary, ArrayBuffer)
- Screen sharing and recording
- ICE/connection timeout detection
- Connection quality stats API

For detailed architecture, see [docs/webrtc-architecture.md](../../docs/webrtc-architecture.md).

## License

Apache-2.0
