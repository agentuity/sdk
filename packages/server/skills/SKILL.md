---
name: server-utilities
description: Runtime-agnostic server utilities for Node.js and Bun applications including fetch adapters, service configuration, logging, and API clients
globs:
  - packages/server/src/**/*.ts
  - packages/server/test/**/*.ts
---

# @agentuity/server Skills

## Integrating Runtime with Server

### When to Use

Use these utilities when building server-side applications that need to communicate with Agentuity platform services, configure service endpoints by region, or create fetch adapters with logging and hooks.

### Core API

```typescript
import {
  getServiceUrls,
  createServerFetchAdapter,
  createLogger,
  type ServiceUrls,
  type FetchAdapter,
} from '@agentuity/server';

// Get service URLs for a specific region
const urls: ServiceUrls = getServiceUrls('us-east-1');
// Returns: { keyvalue, stream, vector, catalyst, otel }

// Create a logger for request tracing
const logger = createLogger('debug', true, 'dark');

// Create a fetch adapter with custom headers and hooks
const adapter: FetchAdapter = createServerFetchAdapter(
  {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Request-ID': requestId,
    },
    onBefore: async (url, options, invoke) => {
      console.log(`Request starting: ${url}`);
      await invoke();
    },
    onAfter: async (url, options, response, err) => {
      if (err) console.error(`Request failed: ${err.message}`);
    },
  },
  logger
);

// Use the adapter to make requests
const response = await adapter.invoke<MyData>('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
});
```

### Key Patterns

- **Regional URLs**: Use `getServiceUrls(region)` to get properly configured service endpoints
- **Environment overrides**: Service URLs can be overridden via `AGENTUITY_*_URL` env vars
- **Request lifecycle hooks**: Use `onBefore` and `onAfter` for logging, metrics, or auth refresh
- **Sensitive header redaction**: Authorization headers are automatically redacted in logs

### Common Pitfalls

- Forgetting to call `invoke()` inside `onBefore` prevents the request from executing
- The `region` parameter defaults to production URLs; use `'local'` for development

---

## Configuring Server Middlewares

### When to Use

Use the logging and API client utilities when you need structured logging with color schemes, context propagation, or typed API interactions with automatic retry logic.

### Core API

```typescript
import {
  ConsoleLogger,
  createLogger,
  APIClient,
  type ColorScheme,
} from '@agentuity/server';

// Create a logger with configuration
const logger = createLogger(
  'info',           // log level: trace | debug | info | warn | error
  true,             // show timestamps
  'dark',           // color scheme: 'dark' | 'light'
  { service: 'my-service' }  // context added to all logs
);

// Create child loggers with additional context
const requestLogger = logger.child({ requestId: 'abc-123' });
requestLogger.info('Processing request');

// Configure logger at runtime
const consoleLogger = new ConsoleLogger('debug');
consoleLogger.setLevel('info');
consoleLogger.setTimestamp(true);
consoleLogger.setColorScheme('light');
consoleLogger.setShowPrefix(false);

// Create an API client with retry configuration
const client = new APIClient(
  'https://api.agentuity.com',
  logger,
  apiKey,  // optional, falls back to AGENTUITY_SDK_KEY
  {
    userAgent: 'my-app/1.0',
    maxRetries: 3,
    retryDelayMs: 100,
    headers: { 'X-Custom': 'value' },
  }
);

// Make typed API requests
const data = await client.get('/users', UserSchema);
await client.post('/users', { name: 'Alice' }, ResponseSchema, InputSchema);
```

### Key Patterns

- **Child loggers**: Use `logger.child()` to add request-specific context without modifying the parent
- **Log levels**: Set via constructor or `setLevel()` - trace < debug < info < warn < error
- **Color detection**: Colors auto-disable when `NO_COLOR` env var is set or stdout is not a TTY
- **API retries**: Automatic exponential backoff with jitter for 409, 501, 503 status codes

### Common Pitfalls

- API client reads `AGENTUITY_SDK_KEY` from env if no key provided
- `fatal()` logs an error and calls `process.exit(1)`
- Log context objects are serialized; avoid circular references

---

## Handling Auth and Security

### When to Use

Use these patterns when implementing authentication, handling API errors, rate limiting, or ensuring secure request handling.

### Core API

```typescript
import {
  APIClient,
  APIError,
  ValidationInputError,
  ValidationOutputError,
  UpgradeRequiredError,
  MaxRetriesError,
  getAPIBaseURL,
  getAppBaseURL,
} from '@agentuity/server';
import { z } from '@agentuity/server';

// Get base URLs with environment overrides
const apiUrl = getAPIBaseURL('us-east-1');      // Uses AGENTUITY_API_URL if set
const appUrl = getAppBaseURL('us-east-1');      // Uses AGENTUITY_APP_URL if set

// Handle API errors with structured error types
try {
  const result = await client.post('/resource', data, ResponseSchema);
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
  if (error instanceof UpgradeRequiredError) {
    console.error('SDK upgrade required');
  }
  if (error instanceof MaxRetriesError) {
    console.error('All retry attempts exhausted');
  }
}

// Define typed API responses
const UserResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

// Rate limiting is handled automatically via Retry-After headers
const client = new APIClient(apiUrl, logger, apiKey, {
  maxRetries: 5,        // More retries for rate-limited requests
  retryDelayMs: 200,    // Base delay before exponential backoff
});
```

### Key Patterns

- **Structured errors**: Use `StructuredError` pattern for typed error handling
- **Environment variables**: Use `AGENTUITY_API_URL`, `AGENTUITY_APP_URL` for URL overrides
- **Rate limit handling**: API client respects `Retry-After`, `X-RateLimit-Reset` headers
- **Header redaction**: Authorization headers are automatically redacted in debug logs

### Common Pitfalls

- API errors include `sessionId` for debugging - preserve it when reporting issues
- `ValidationInputError` is thrown before the request; `ValidationOutputError` after
- `UpgradeRequiredError` can be bypassed with `skipVersionCheck: true` config option

---

## See Also

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
- [CLI Reference](https://preview.agentuity.dev/v1/Reference/CLI)
