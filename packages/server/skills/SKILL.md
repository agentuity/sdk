---
name: agentuity-server
description: "Use when: creating fetch adapters, configuring service URLs by region, using APIClient for typed requests, or setting up logging with ConsoleLogger."
globs:
  - "**/server/**/*.ts"
---

# @agentuity/server

Runtime-agnostic server utilities for Node.js and Bun.

## Service URLs

Get configured endpoints by region.

```typescript
import { getServiceUrls, getAPIBaseURL, getAppBaseURL } from '@agentuity/server';

const urls = getServiceUrls('us-east-1');
// Returns: { keyvalue, stream, vector, catalyst, otel }

const apiUrl = getAPIBaseURL('us-east-1');  // Uses AGENTUITY_API_URL if set
const appUrl = getAppBaseURL('us-east-1');  // Uses AGENTUITY_APP_URL if set
```

---

## Fetch Adapter

Create fetch adapters with logging and lifecycle hooks.

```typescript
import { createServerFetchAdapter, createLogger } from '@agentuity/server';

const logger = createLogger('debug', true, 'dark');

const adapter = createServerFetchAdapter(
  {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Request-ID': requestId,
    },
    onBefore: async (url, options, invoke) => {
      console.log(`Request starting: ${url}`);
      await invoke();  // Must call invoke() to execute request
    },
    onAfter: async (url, options, response, err) => {
      if (err) console.error(`Request failed: ${err.message}`);
    },
  },
  logger
);

const data = await adapter.invoke<MyData>('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
});
```

---

## Logger

```typescript
import { ConsoleLogger, createLogger } from '@agentuity/server';

// Create with config
const logger = createLogger(
  'info',           // level: trace | debug | info | warn | error
  true,             // timestamps
  'dark',           // color scheme: 'dark' | 'light'
  { service: 'my-service' }  // context for all logs
);

// Child logger with additional context
const requestLogger = logger.child({ requestId: 'abc-123' });
requestLogger.info('Processing request');

// Runtime configuration
const console = new ConsoleLogger('debug');
console.setLevel('info');
console.setTimestamp(true);
console.setColorScheme('light');
```

---

## API Client

Typed HTTP client with retry logic.

```typescript
import { APIClient } from '@agentuity/server';

const client = new APIClient(
  'https://api.agentuity.com',
  logger,
  apiKey,  // Falls back to AGENTUITY_SDK_KEY
  {
    maxRetries: 3,
    retryDelayMs: 100,
    headers: { 'X-Custom': 'value' },
  }
);

// Typed requests with schema validation
const users = await client.get('/users', UserSchema);
const user = await client.post('/users', { name: 'Alice' }, ResponseSchema, InputSchema);
```

---

## Error Handling

```typescript
import {
  APIError,
  ValidationInputError,
  ValidationOutputError,
  UpgradeRequiredError,
  MaxRetriesError,
} from '@agentuity/server';

try {
  await client.post('/resource', data, ResponseSchema);
} catch (error) {
  if (error instanceof APIError) {
    console.error(`API error ${error.status}: ${error.message}`);
    console.error(`URL: ${error.url}, Session: ${error.sessionId}`);
  }
  if (error instanceof ValidationInputError) {
    console.error('Input validation failed:', error.issues);
  }
  if (error instanceof ValidationOutputError) {
    console.error('Response validation failed:', error.issues);
  }
  if (error instanceof MaxRetriesError) {
    console.error('All retry attempts exhausted');
  }
}
```

**Key points:**
- API client respects `Retry-After` and `X-RateLimit-Reset` headers
- Authorization headers are automatically redacted in debug logs
- `ValidationInputError` thrown before request, `ValidationOutputError` after

---

## Reference

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
