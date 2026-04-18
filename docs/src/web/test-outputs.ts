/**
 * Test outputs for UI development without running sandboxes.
 * Import TEST_OUTPUTS and set the demo key to preview output UI.
 */
export const TEST_OUTPUTS: Record<string, string> = {
	hello: `[INFO] Processing greeting {"name":"World"}
---OUTPUT---
Hello, World! Welcome to Agentuity.`,

	'handler-context': `[INFO] Processing request {"userId":"user-123"}
[DEBUG] Debug details {"threadId":"thrd_def456uvw"}
[WARN] Example warning log
[ERROR] Example error log
---OUTPUT---
=== Handler Context Demo ===

Identifiers:
  sessionId: sess_abc123xyz
  threadId: thrd_def456uvw

Logger (writes to trace, shown above):
  ctx.logger.info(), .debug(), .error() available

Storage Access:
  ctx.kv - Key-Value storage
  ctx.vector - Vector storage
  ctx.objectstore - Object storage (S3)

Thread State (persists across requests):
  set("demo-key", {value: "test"})
  get("demo-key") -> {"value":"test"}

Session State (per-request only):
  set("request-time", Date.now())
  get("request-time") -> 1736956200000`,

	kv: `[INFO] Session found {"data":{"message":"Hello from KV!","timestamp":"2026-01-15T11:30:00.000Z"}}
[INFO] Active sessions {"count":1}
---OUTPUT---
SET "demo-key" -> {"message":"Hello from KV!","timestamp":"2026-01-15T11:30:00.000Z"}
GET "demo-key" <- {"message":"Hello from KV!","timestamp":"2026-01-15T11:30:00.000Z"}
LIST keys: [demo-key]
DELETE "demo-key" -> done
GET "demo-key" <- confirmed deleted`,

	vector: `[INFO] Seeding sample products into vector store
[INFO] Match found {"name":"ErgoMax Pro","price":299,"similarity":"0.98"}
[INFO] Match found {"name":"ComfortPlus Chair","price":249,"similarity":"0.89"}
[INFO] Match found {"name":"Standing Desk Converter","price":199,"similarity":"0.72"}
---OUTPUT---
Found 3 matches for "ergonomic office chair":
  1. ErgoMax Pro ($299) - 98%
  2. ComfortPlus Chair ($249) - 89%
  3. Standing Desk Converter ($199) - 72%

Recommendation: The ErgoMax Pro offers excellent lumbar support and adjustability for long work sessions.`,

	objectstore: `[INFO] Object storage demo
---OUTPUT---
WRITE "demo-1736956200.txt"
  Content: Hello from Object Storage!...

READ "demo-1736956200.txt"
  Content: Hello from Object Storage!...

EXISTS "demo-1736956200.txt" -> true

DELETE "demo-1736956200.txt" -> done
EXISTS "demo-1736956200.txt" -> false (confirmed deleted)`,

	'ai-gateway': `[INFO] Calling OpenAI via AI Gateway
---OUTPUT---
Prompt: "Tell me a short joke about programming."

Response:
Why do programmers prefer dark mode? Because light attracts bugs!`,

	streaming: `[INFO] Streaming started
---OUTPUT---
Prompt: "Write a short poem about coding."

In lines of code, we weave our dreams,
Through logic flows and data streams.
Bugs may come and errors too,
But with each fix, we start anew.`,

	'sse-stream': `[INFO] SSE stream started
---OUTPUT---
Prompt: "Explain what Server-Sent Events are in 2-3 sentences."

Server-Sent Events (SSE) is a web technology that allows servers to push real-time updates to clients over a single HTTP connection. Unlike WebSockets, SSE is unidirectional (server to client only) and uses standard HTTP, making it simpler to implement and more compatible with existing infrastructure.

[Streamed 47 tokens]`,

	'durable-stream': `[INFO] Creating durable stream
---OUTPUT---
Stream created: demo-1736956200
Stream ID: strm_abc123xyz

Content written:
  "This is a durable stream demo...."

Stream closed

Public URL (shareable):
  https://streams.agentuity.cloud/strm_abc123xyz`,

	'agent-calls': `[INFO] Cleaned text
---OUTPUT---
=== Agent Calls Demo ===
Original: "  Hello!!!  World...  #testing   @demo  "

Step 1: Calling text-processor (clean)...
  Result: "Hello! World. testing demo"

Step 2: Calling text-processor (analyze)...
  Result: 4 words, 26 characters, 2 sentences

Pipeline completed`,

	cron: `[INFO] Hourly task running
---OUTPUT---
=== Hourly Data Sync (Simulated) ===
Triggered at: 2026-01-15T15:00:00.000Z

Step 1: Fetching external data...
  Fetched 542 records from api.example.com

Step 2: Caching in KV storage...
  Cached to "v1-ks-cron/latest-sync" (TTL: 1 hour)

Step 3: Verifying cache...
  Cache verified successfully

Cron job completed successfully`,

	chat: `---OUTPUT---
Thread ID: thrd_xyz789abc
User: What is Agentuity?
Assistant: Agentuity is a platform for building and deploying AI agents. It provides an SDK with built-in storage (KV, Vector, Object), AI gateway for multiple providers, streaming support, and evaluation tools.`,

	'model-arena': `[INFO] Model A (OpenAI gpt-5-nano): "Code is poetry written in logic, where semicolons are the punctuation of dreams."

[INFO] Model B (Anthropic claude-haiku-4-5): "Programming is the art of teaching rocks to think, one boolean at a time."

[INFO] Judge (Groq gpt-oss-120b) {"winner":"model-b"}
[INFO] Scores {"creativity":0.85,"clarity":0.9}
[INFO] Reasoning: Model B offers a more vivid and humorous metaphor with unexpected imagery, while Model A relies on a more conventional poetry comparison.`,
};
