---
name: agentuity-services
description: >-
  Use when selecting or using Agentuity service clients from app code. Covers
  standalone clients for key-value, vector, object storage, durable streams,
  queues, email, schedules, tasks, webhooks, sandbox, Coder, telemetry, direct
  clients versus Hono middleware, and service environment configuration.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Service Clients

Use standalone packages when Agentuity services belong inside framework routes,
server functions, workers, scripts, or CLIs. Construct clients in server-side
modules, then call them from the handler that owns the request or job.

## Basic Pattern

```bash
npm install @agentuity/keyvalue
```

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';

interface Preference {
  readonly theme: 'light' | 'dark';
}

const kv = new KeyValueClient();

export async function savePreference(
  userId: string,
  preference: Preference
): Promise<void> {
  await kv.set('preferences', userId, preference, {
    ttl: 60 * 60 * 24 * 30,
  });
}

export async function getPreference(userId: string): Promise<Preference | undefined> {
  const result = await kv.get<Preference>('preferences', userId);
  return result.exists ? result.data : undefined;
}
```

Most clients read `AGENTUITY_SDK_KEY` automatically. Framework dev commands are
fine when that environment is already present; use `agentuity dev` when you want
the CLI to inject linked Agentuity project credentials for the local process.

## Choose the Right Service

| Need | Package |
|---|---|
| Exact-key JSON, TTL cache, preferences, counters | `@agentuity/keyvalue` |
| Semantic search, retrieval, document embeddings | `@agentuity/vector` |
| S3-compatible files and binary data | `@agentuity/storage` |
| Durable generated output or resumable streams | `@agentuity/stream` |
| Model catalog and routed model requests | `@agentuity/aigateway` |
| Async message handoff | `@agentuity/queue` |
| Managed outbound or inbound email | `@agentuity/email` |
| Cron schedules and delivery tracking | `@agentuity/schedule` |
| Work items, comments, tags, attachments | `@agentuity/task` |
| Managed webhook ingest URLs and receipts | `@agentuity/webhook` |
| Isolated command execution | `@agentuity/sandbox` |
| Cloud coding sessions and workspaces | `@agentuity/coder` |
| Logger, tracer, and meter setup | `@agentuity/telemetry` |

Use `agentuity-database` for relational data. Use `agentuity-cloud` when managing resources from the terminal.

## Direct Clients vs Hono Middleware

| Code location | Use |
|---|---|
| Framework routes, scripts, and workers | Direct clients such as `new QueueClient()` |
| Hono routes that should share clients through context | `@agentuity/hono` middleware |
| Browser components | Your server route, not service clients directly |
| Non-TypeScript systems | REST API |

Hono example:

```typescript
import { Hono } from 'hono';
import { agentuity } from '@agentuity/hono';
import type { Services } from '@agentuity/hono';

const app = new Hono<{ Variables: Pick<Services, 'kv' | 'queue'> }>();

app.use('*', agentuity());

app.post('/api/jobs', async (c) => {
  const message = await c.var.queue.publish('jobs', { requestedAt: new Date().toISOString() });
  await c.var.kv.set('job-status', message.id, { status: 'queued' });
  return c.json({ messageId: message.id }, 202);
});
```

The Hono middleware injects common clients such as KV, vector, stream, queue,
email, schedule, task, sandbox, logger, tracer, and meter. AI Gateway, database,
object storage, webhooks, and Coder are direct clients.

## Configuration

Most API-backed clients accept constructor options:

| Option | Use |
|---|---|
| `apiKey` | Override `AGENTUITY_SDK_KEY` or `AGENTUITY_CLI_KEY` |
| `orgId` | Target an organization explicitly for org-scoped APIs |
| `url` | Override service URL for local or custom endpoints |
| `logger` | Provide a logger implementation |

Object storage uses S3-style bucket env values:

| Variable | Purpose |
|---|---|
| `AWS_ENDPOINT` | S3 endpoint written by project linking |
| `AWS_BUCKET` | Bucket name |
| `AWS_ACCESS_KEY_ID` | Bucket access key |
| `AWS_SECRET_ACCESS_KEY` | Bucket secret |
| `AWS_REGION` | Optional region |

Read bucket config with:

```typescript
import { bucketConfigFromEnv, createS3Client } from '@agentuity/storage';

const storage = createS3Client(bucketConfigFromEnv());
```

## Service Examples

Vector search:

```typescript
import { VectorClient } from '@agentuity/vector';

const vector = new VectorClient();

await vector.upsert('docs', {
  key: 'service-clients',
  document: 'Agentuity services are available through standalone packages.',
  metadata: { source: 'docs' },
});

const results = await vector.search('docs', {
  query: 'How do I use services from app code?',
  limit: 3,
});
```

Queue handoff:

```typescript
import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();

const message = await queue.publish(
  'report-jobs',
  { accountId: 'acct_123', month: '2026-06' },
  { idempotencyKey: 'report-acct_123-2026-06' }
);
```

Task tracking:

```typescript
import { TaskClient } from '@agentuity/task';

const tasks = new TaskClient();

await tasks.create({
  title: 'Review generated report',
  description: 'Validate report output before sending it to the customer.',
});
```

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Choosing a service by package name alone | Start with the job: cache, search, files, queue, schedule, email |
| Putting service clients in browser code | Keep clients server-side and expose a route |
| Using KV for relational data | Use a database for relational queries and joins |
| Using sandbox as a general worker queue | Use queues/schedules/tasks for workflow; sandbox for bounded execution |
| Forgetting resource setup | Use `agentuity-cloud` to create/link resources and inspect them |

## Useful Docs

- Standalone packages: https://agentuity.dev/reference/standalone-packages
- Services: https://agentuity.dev/services
- Key-Value Storage: https://agentuity.dev/services/storage/key-value
- Vector Storage: https://agentuity.dev/services/storage/vector
- Object Storage: https://agentuity.dev/services/storage/object
- Hono: https://agentuity.dev/frameworks/hono
