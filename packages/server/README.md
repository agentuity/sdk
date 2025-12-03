# @agentuity/server

Server-side utilities for Node.js and Bun applications. This package is runtime-agnostic and contains common utilities that work across both runtimes.

## Features

- **Runtime Agnostic**: Works with both Node.js and Bun
- **Server-side focused**: Not browser compatible
- **Shared utilities**: Common APIs used by @agentuity/runtime and standalone apps

## Installation

```bash
bun add @agentuity/server
```

## Usage

```typescript
import { getServiceUrls, type ServiceUrls } from '@agentuity/server';

// Get service URLs from environment variables
const urls: ServiceUrls = getServiceUrls(region);

console.log(urls.keyvalue); // https://agentuity.ai (or AGENTUITY_KEYVALUE_URL)
console.log(urls.objectstore); // https://agentuity.ai (or AGENTUITY_OBJECTSTORE_URL)
console.log(urls.stream); // https://streams.agentuity.cloud (or AGENTUITY_STREAM_URL)
console.log(urls.vector); // https://agentuity.ai (or AGENTUITY_VECTOR_URL)
```

### Server Fetch Adapter

```typescript
import { createServerFetchAdapter } from '@agentuity/server';

const adapter = createServerFetchAdapter({
	headers: {
		Authorization: 'Bearer YOUR_TOKEN',
		'User-Agent': 'My App/1.0',
	},
	onBefore: async (url, options, callback) => {
		console.log('Making request to:', url);
		await callback();
	},
	onAfter: async (url, options, response, err) => {
		console.log('Request completed:', url, response.response.status);
	},
});
```

## Development

See [AGENTS.md](./AGENTS.md) for development guidelines.
