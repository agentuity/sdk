---
name: agentuity-ai
description: >-
  Use when building model-backed Agentuity features, AI routes, structured
  output, chat, streaming, tool calling, or app-owned state and memory. Covers
  plain server functions, AIGatewayClient, provider SDK choices, validation,
  KV-backed history, and safe tool execution.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity AI Features

An Agentuity agent is model-backed app code with a clear task. Put the task in a
plain server-side function, validate its inputs and outputs, then call it from
the framework route, worker, schedule, script, or queue handler that owns the
trigger.

## Minimal Shape

```bash
npm install @agentuity/aigateway @agentuity/keyvalue zod
```

```typescript
import { AIGatewayClient } from '@agentuity/aigateway';
import { KeyValueClient } from '@agentuity/keyvalue';
import { z } from 'zod';

const gateway = new AIGatewayClient();
const kv = new KeyValueClient();
const TRIAGE_MODEL = 'googleai/gemini-3.5-flash';

const triageSchema = z.object({
  priority: z.enum(['low', 'normal', 'high']),
  summary: z.string(),
});

type TriageResult = z.infer<typeof triageSchema>;

export async function triageMessage(
  customerId: string,
  message: string
): Promise<TriageResult> {
  const previous = await kv.get<TriageResult>('support-triage', customerId);

  const { data } = await gateway.completeStructured({
    model: TRIAGE_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Classify support messages for a product engineering team.',
      },
      {
        role: 'user',
        content: [
          `Customer message: ${message}`,
          previous.exists ? `Previous summary: ${previous.data.summary}` : '',
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_schema: {
      name: 'triage_result',
      schema: triageSchema,
    },
  });

  const output = triageSchema.parse(data);
  await kv.set('support-triage', customerId, output, { ttl: 60 * 60 * 24 * 30 });
  return output;
}
```

Keep the route thin:

```typescript
import { triageMessage } from '@/lib/triage';
import { z } from 'zod';

const inputSchema = z.object({
  customerId: z.string(),
  message: z.string(),
});

export async function POST(request: Request): Promise<Response> {
  const input = inputSchema.parse(await request.json());
  const result = await triageMessage(input.customerId, input.message);
  return Response.json(result);
}
```

## Model Choice

Use the live Gateway catalog before hardcoding model IDs:

```bash
agentuity cloud aigateway models --recommended
agentuity cloud aigateway models --ids
agentuity cloud aigateway models --provider openai
```

Use `AIGatewayClient` when model choice should be project configuration. Use a
provider SDK or AI SDK provider when the feature depends on provider-specific
APIs.

| Need | Use |
|---|---|
| Plain text response | `gateway.completeText()` |
| Provider-agnostic JSON | `gateway.completeStructured()` plus validation |
| Raw provider-shaped response | `gateway.complete()` |
| SSE passthrough | `gateway.streamRequest()` |
| Automatic tool loop | AI SDK or provider SDK |

`AIGatewayClient` reads Agentuity project credentials from the environment. The
model ID is app config, not an extra secret.

## Chat and Streaming

Use streaming when users should see output as it arrives. Store chat state
explicitly, usually after the stream completes:

```typescript
import { AIGatewayClient } from '@agentuity/aigateway';
import { KeyValueClient } from '@agentuity/keyvalue';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const gateway = new AIGatewayClient();
const kv = new KeyValueClient();
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

export async function streamChat(
  conversationId: string,
  message: string
): Promise<Response> {
  const stored = await kv.get<ChatMessage[]>('chat-history', conversationId);
  const history = stored.exists ? stored.data : [];
  const next = [...history, { role: 'user' as const, content: message }];

  const { stream } = await gateway.streamRequest({
    path: '/',
    body: { model: DEFAULT_MODEL, stream: true, messages: next },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
  });
}
```

If you need to persist the assistant turn, tee the stream and parse the copy in a
background promise owned by your route or worker.

## Tools

Tools should be bounded app functions:

| Good tool | Avoid |
|---|---|
| Read one KV or database record | Broad unbounded scans |
| Create a small task or enqueue a job | Long-running work inside the model call |
| Return compact typed data | Returning huge files or transcripts |
| Propose a risky action for approval | Irreversible side effects without a gate |

Use an idempotency key or stored approval record for side effects. Never let a
model directly execute irreversible work without an app-owned decision boundary.

## State and Memory

State belongs to the app:

| State need | Store |
|---|---|
| Browser session identity | Signed cookie or auth session |
| Compact memory or preferences | Key-Value Storage |
| Relational user data | Database |
| Generated files or transcripts | Durable Streams or Object Storage |
| Async job status | KV status record plus Queue |

Validate data when reading from KV or databases. Old records, manual test data,
and partial writes are normal production boundaries.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Putting model calls directly in UI components | Call a server route or server function |
| Trusting structured model data as typed | Validate with Zod, Valibot, ArkType, or another schema library |
| Storing full transcripts in KV forever | Store summaries or pointers; use DB or durable streams for large data |
| Running long jobs inside a request | Enqueue work and return a status handle |
| Hardcoding an unverified model ID | Read the Gateway catalog first |

## Useful Docs

- Agents: https://agentuity.dev/build/agents
- AI Gateway: https://agentuity.dev/services/ai-gateway
- Chat and streaming: https://agentuity.dev/build/agents/chat-and-streaming
- Tool calling: https://agentuity.dev/build/agents/tool-calling
- State and memory: https://agentuity.dev/build/agents/state-and-memory
