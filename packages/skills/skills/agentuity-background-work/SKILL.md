---
name: agentuity-background-work
description: >-
  Use when adding async jobs, queue workers, cron schedules, webhook ingestion,
  task tracking, long-running workflows, status polling, durable output, or
  idempotent background processing to an Agentuity app.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Background Work

Use background work when a request starts something slow: report generation,
webhook fan-out, email preparation, model evaluation, file processing, or
external API retries. The common pattern is: enqueue work, return a handle,
process asynchronously, and expose status.

## Choose the Work Boundary

| Need | Use |
|---|---|
| Async message handoff to a worker route | Queue |
| Cron-style recurring call | Schedule |
| External event ingestion | Webhook |
| Human or agent-visible work item | Task |
| Generated output that should survive the request | Durable Stream or Object Storage |
| Bounded command execution | Sandbox |
| Status for a client to poll | Key-Value Storage or database |

Use sandbox execution for bounded commands or coding-agent runtimes. Do not use
sandbox as the default replacement for queues, schedules, or webhooks.

## Request, Worker, Status

```bash
npm install @agentuity/queue @agentuity/keyvalue @agentuity/stream zod
```

```typescript
import { QueueClient } from '@agentuity/queue';
import { KeyValueClient } from '@agentuity/keyvalue';
import { StreamClient } from '@agentuity/stream';
import { z } from 'zod';

const queue = new QueueClient();
const kv = new KeyValueClient();
const streams = new StreamClient();

const requestSchema = z.object({
  accountId: z.string(),
  reportMonth: z.string(),
});

const jobSchema = requestSchema.extend({
  jobId: z.string(),
});

type ReportJob = z.infer<typeof jobSchema>;

type ReportStatus =
  | { readonly kind: 'queued'; readonly messageId: string }
  | { readonly kind: 'processing' }
  | { readonly kind: 'done'; readonly streamUrl: string }
  | { readonly kind: 'failed'; readonly message: string };
```

Request route:

```typescript
export async function POST(request: Request): Promise<Response> {
  const input = requestSchema.parse(await request.json());
  const jobId = crypto.randomUUID();
  const job: ReportJob = { jobId, ...input };

  const message = await queue.publish('report-jobs', job, {
    idempotencyKey: jobId,
  });

  await kv.set<ReportStatus>('report-status', jobId, {
    kind: 'queued',
    messageId: message.id,
  });

  return Response.json({ jobId, statusUrl: `/api/reports/${jobId}` }, { status: 202 });
}
```

Status route:

```typescript
export async function getReportStatus(jobId: string): Promise<Response> {
  const result = await kv.get<ReportStatus>('report-status', jobId);

  if (!result.exists) {
    return Response.json({ error: 'Report job not found' }, { status: 404 });
  }

  return Response.json(result.data);
}
```

Worker function:

```typescript
export async function processReportJob(body: unknown): Promise<Response> {
  const job = jobSchema.parse(body);

  await kv.set<ReportStatus>('report-status', job.jobId, { kind: 'processing' });

  try {
    const stream = await streams.create('monthly-reports', {
      contentType: 'text/csv',
      metadata: {
        accountId: job.accountId,
        reportMonth: job.reportMonth,
      },
      ttl: 60 * 60 * 24 * 90,
    });

    try {
      await stream.write('account_id,report_month,total\n');
      await stream.write(`${job.accountId},${job.reportMonth},42817\n`);
    } finally {
      await stream.close();
    }

    await kv.set<ReportStatus>('report-status', job.jobId, {
      kind: 'done',
      streamUrl: stream.url,
    });

    return Response.json({ ok: true });
  } catch (error) {
    await kv.set<ReportStatus>('report-status', job.jobId, {
      kind: 'failed',
      message: error instanceof Error ? error.message : 'Report generation failed',
    });

    return Response.json({ ok: false }, { status: 500 });
  }
}
```

## Queue Destinations

Create the queue and HTTP destination from the CLI:

```bash
agentuity cloud queue create report-jobs --max-retries 3 --visibility-timeout 120
agentuity cloud queue destinations create report-jobs \
  --type http \
  --name report-worker \
  --url https://<your-app-host>/api/workers/report-jobs
```

The platform only calls your worker route when a destination points at a
reachable public URL. `localhost` is not reachable from the queue service; use a
public tunnel during local testing or the deployed app URL.

## Schedules

Use schedules for recurring HTTP calls or sandbox destinations:

```bash
agentuity cloud schedule create nightly-report \
  --cron "0 2 * * *" \
  --url https://<your-app-host>/api/workers/nightly-report
```

Keep schedule handlers idempotent. A retry should not duplicate emails, charges, or external writes.

## Webhooks

Use webhooks for external event ingestion. Validate signatures or shared secrets
in the route before publishing follow-up work to a queue.

```typescript
export async function handleWebhook(request: Request): Promise<Response> {
  const event = await request.json();
  const eventId = String(event.id ?? crypto.randomUUID());

  await queue.publish('webhook-events', event, {
    idempotencyKey: eventId,
  });

  return Response.json({ accepted: true }, { status: 202 });
}
```

## Tasks

Use tasks when work should be visible as a trackable item for humans or agentic tools:

```typescript
import { TaskClient } from '@agentuity/task';

const tasks = new TaskClient();

await tasks.create({
  title: 'Review monthly report',
  description: 'Validate generated totals before customer delivery.',
  tags: ['reporting'],
});
```

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Doing slow work before responding to the user | Enqueue and return `202 Accepted` with a status URL |
| Publishing without an idempotency key | Use a stable job ID or upstream event ID |
| Assuming queue workers can call `localhost` | Configure a public tunnel or deployed app URL |
| Losing job status after retries | Persist status after each durable step |
| Using one queue for unrelated workloads | Separate queues by retry policy and destination |

## Useful Docs

- Background work: https://agentuity.dev/build/apps-and-apis/background-work
- Queues: https://agentuity.dev/services/queues
- Schedules: https://agentuity.dev/services/schedules
- Webhooks: https://agentuity.dev/services/webhooks
- Tasks: https://agentuity.dev/services/tasks
- Durable Streams: https://agentuity.dev/services/storage/durable-streams
