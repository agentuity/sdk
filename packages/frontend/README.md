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

## License

Apache-2.0
