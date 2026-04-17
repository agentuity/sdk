/**
 * Code examples displayed in the Monaco editor for each demo.
 * These are educational - they show best practices and patterns.
 * The actual executable scripts live in src/run/*.ts
 */
export const CODE_EXAMPLES = {
	hello: `import { createAgent } from "@agentuity/runtime";
import { s } from "@agentuity/schema";

const agent = createAgent("hello", {
  description: "Simple greeting agent",
  // Schema defines typed input/output for your agent
  schema: {
    input: s.object({ name: s.string() }),
    output: s.string(),
  },
  // Handler receives context (ctx) and validated input
  handler: async (ctx, { name }) => {
    ctx.logger.info("Processing greeting", { name });
    // Return value becomes the agent's output
    return \`Hello, \${name}! Welcome to Agentuity.\`;
  },
});`,

	'handler-context': `// AgentContext provides access to all SDK capabilities.
// This shows the most commonly used properties and methods.

handler: async (ctx, input) => {

  /***************
   * Identifiers *
   ***************/

  ctx.sessionId;      // Unique execution ID (sess_...)
  ctx.thread.id;      // Thread ID for conversation continuity (thrd_...)

  /***********
   * Logging *
   ***********/

  ctx.logger.info("Processing request", { userId: input.userId });
  ctx.logger.debug("Debug details", { threadId: ctx.thread.id });
  ctx.logger.warn("Example warning log");
  ctx.logger.error("Example error log");

  /***********
   * Storage *
   ***********/

  // Key-Value: fast ephemeral data (see KV Storage demo)
  await ctx.kv.get("bucket", "key");
  await ctx.kv.set("bucket", "key", { data: "value" }, { ttl: 3600 });

  // Vector: semantic search (see Vector Search demo)
  await ctx.vector.search("namespace", { query: "search text", limit: 5 });

  /********************
   * State Management *
   ********************/

  // Session state - resets each request
  ctx.session.state.set("requestTime", Date.now());

  // Thread state - persists across requests (1 hour, cookie-based)
  const visits = ((await ctx.thread.state.get("visits")) as number) || 0;
  await ctx.thread.state.set("visits", visits + 1);

  /*******************
   * Background Tasks *
   *******************/

  // Fire-and-forget: continues after response is sent
  ctx.waitUntil(async () => {
    await sendAnalytics();
    await updateCache();
  });
}`,

	'key-value': `// Key-Value storage: fast ephemeral data by exact key.
// Namespaces auto-created. Keys should be unique per run.

const namespace = "explorer-sandbox";
const runId = Date.now().toString(36);
const key = \`\${runId}:session-001\`;

// Sample session data
const sessionData = {
  visitorId: "visitor-abc123",
  lastActive: new Date().toISOString(),
  preferences: { theme: "dark" },
};

ctx.logger.info("Setting key", { key });

// SET: store data with optional TTL (minimum 60 seconds, 0 for no expiration)
await ctx.kv.set(namespace, key, sessionData, { ttl: 300 });

ctx.logger.info("Getting key", { key });

// GET: returns { exists, data } discriminated union
const result = await ctx.kv.get(namespace, key);

if (result.exists) {
  ctx.logger.info("Session found", {
    visitorId: result.data.visitorId,
    theme: result.data.preferences.theme,
  });
} else {
  ctx.logger.info("Session not found");
}

// CLEANUP: delete the unique key
await ctx.kv.delete(namespace, key);
ctx.logger.info("Cleaned up", { key });`,

	'vector-storage': `// Vector storage: semantic search by meaning, not keywords.
// Namespaces auto-created. Keys should be unique per run.

const namespace = "explorer-sandbox";
const runId = Date.now().toString(36);

const product = {
  sku: \`\${runId}:chair-001\`,
  name: "ErgoMax Pro Chair",
  price: 549,
};

// UPSERT: document text is auto-embedded
await ctx.vector.upsert(namespace, {
  key: product.sku,
  document: \`\${product.name}: Premium ergonomic office chair with lumbar support\`,
  metadata: product,
});

// SEARCH: finds by meaning ("comfortable" matches "ergonomic")
const results = await ctx.vector.search(namespace, {
  query: "comfortable chair",
  limit: 3,
  similarity: 0.3,
});

// Results include similarity scores and metadata
for (const result of results) {
  ctx.logger.info("Match found", {
    name: result.metadata?.name,
    price: result.metadata?.price,
    similarity: result.similarity.toFixed(2),
  });
}

// CLEANUP: delete the unique key
await ctx.vector.delete(namespace, product.sku);
ctx.logger.info("Cleaned up", { sku: product.sku });`,

	'object-storage': `// Object storage for files, images, and binary data.
// Uses Bun's native S3 API - credentials are auto-injected by Agentuity.
import { s3 } from "bun";

const filename = \`demo-\${Date.now()}.txt\`;
const content = \`Hello from Object Storage!\\nTimestamp: \${new Date().toISOString()}\`;

ctx.logger.info("Writing file", { filename });

// Write a file
const file = s3.file(filename);
await file.write(content);

ctx.logger.info("Reading file", { filename });

// Read it back
const readContent = await file.text();

ctx.logger.info("Checking exists", { filename });

// Check existence
const exists = await file.exists();

ctx.logger.info("Deleting file", { filename });

// Delete
await file.delete();

// Verify deletion
const existsAfter = await file.exists();
ctx.logger.info("Cleaned up", { filename, existsAfter });`,

	'sse-stream': `// Server-Sent Events (SSE) for real-time streaming to clients.
// Perfect for incremental text streaming, progress updates, and live feeds.
import { Hono } from "hono";
import { type Env, sse } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = new Hono<Env>()
  // sse() middleware with flattened (c, stream) signature
  .get("/stream", sse(async (c, stream) => {
  const prompt = c.req.query("prompt") ?? "Tell me a story";

  c.var.logger?.info("SSE stream started", { prompt });

  const { textStream, usage } = streamText({
    model: openai("gpt-5.4-nano"),
    prompt,
  });

  // Stream text chunks as they arrive from the LLM
  let chunkCount = 0;
  for await (const chunk of textStream) {
    await stream.writeSSE({
      event: "chunk",      // Event type (client listens for this)
      data: chunk,         // The actual content
      id: String(chunkCount++),  // enables client reconnection
    });
  }

  // Signal completion with a usage-derived token count
  const usageData = await usage;
  await stream.writeSSE({
    event: "done",
    data: JSON.stringify({ totalTokens: usageData?.totalTokens ?? 0 }),
  });

  // Stream closes automatically when handler returns
}));`,

	streaming: `// Raw streaming for simple text responses.
// Simpler than SSE - just returns a ReadableStream directly.
import { Hono } from "hono";
import { type Env, stream } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = new Hono<Env>();

// stream() middleware wraps your handler and pipes the ReadableStream
// Clients consume with fetch + getReader()
router.post(
  "/stream",
  stream(async (c) => {
    const { prompt } = await c.req.json();

    c.var.logger?.info("Streaming started", { prompt });

    const { textStream } = streamText({
      model: openai("gpt-5.4-nano"),
      prompt,
    });

    // Return the stream directly - Agentuity handles the response
    return textStream;
  })
);`,

	'agent-calls': `// Agent calls in standalone scripts.
// Use ctx.invoke() + getAgentContext() when you also need ctx.waitUntil().
import { createAgentContext, getAgentContext } from "@agentuity/runtime";
import helloAgent from "@agent/hello/agent";

const standaloneCtx = createAgentContext();

await standaloneCtx.invoke(async () => {
  const ctx = getAgentContext();
  const name = "from the hello agent";

  ctx.logger.info("Calling hello agent", { name });

  // Call another agent inside the current invocation context
  const greeting = await helloAgent.run({ name });
  ctx.logger.info("Agent returned", { greeting });

  // Background work must be scheduled from the active invocation context
  ctx.waitUntil(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ctx.logger.info("Background task completed");
  });
});`,

	schedules: `// Managed schedules are platform resources with delivery tracking.
// Use ScheduleClient in standalone scripts, CLIs, or background jobs.
import { ScheduleClient } from "@agentuity/schedule";

const schedules = new ScheduleClient();
const name = \`explorer-demo-\${Date.now()}\`;
let scheduleId: string | undefined;

try {
  const { schedule, destinations } = await schedules.create({
    name,
    description: "Call the docs hello route every minute",
    expression: "* * * * *",
    destinations: [
      {
        type: "url",
        config: {
          // The live Explorer sandbox passes a real URL for its Hello World route.
          // In your app, point this at one of your own routes.
          url: "<YOUR_APP_URL>/api/hello",
          method: "GET",
        },
      },
    ],
  });

  scheduleId = schedule.id;

  // Change the cadence later
  // await schedules.update(schedule.id, { expression: "*/5 * * * *" });

  // Add a sandbox destination
  // await schedules.createDestination(schedule.id, {
  //   type: "sandbox",
  //   config: { sandbox_id: "sbx_abc123", command: "bun run src/run/sync.ts" },
  // });

  // List schedules for an admin or dashboard view
  // const { schedules: allSchedules, total } = await schedules.list({ limit: 20, offset: 0 });

  // Remove a destination without deleting the schedule
  // await schedules.deleteDestination("sdst_abc123");

  console.log("Created schedule:", schedule.id);
  console.log("Next run:", schedule.due_date);
  console.log("Destinations:", destinations.length);
} finally {
  if (scheduleId) {
    await schedules.delete(scheduleId).catch(() => undefined);
  }
}`,

	'durable-stream': `// Durable streams keep generated content available by URL after the request finishes.
// Streams expire after 30 days by default; set ttl: null or 0 to keep them indefinitely.
import { Hono } from "hono";
import type { Env } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = new Hono<Env>();

router.post("/create", async (c) => {
  // Create a durable stream - returns a shareable URL
  const stream = await c.var.stream.create("ai-summary", {
    contentType: "text/plain",
    metadata: { created: new Date().toISOString() },
    // ttl: 0, // or null to keep the stream indefinitely
  });

  // Write content in the background, then close the stream
  c.waitUntil(async () => {
    const { textStream } = streamText({
      model: openai("gpt-5.4-nano"),
      prompt: "Write a summary of what Agentuity is.",
    });

    for await (const chunk of textStream) {
      await stream.write(chunk);
    }
    await stream.close();
  });

  // Return immediately while content is still being generated
  return c.json({
    streamId: stream.id,
    streamUrl: stream.url,
    status: "generating",
  });
});

// List previously generated summaries
router.get("/list", async (c) => {
  const result = await c.var.stream.list({ namespace: "ai-summary" });
  return c.json(result.streams);
});`,

	chat: `// Multi-turn chat with thread state inside an agent handler.
// Thread state persists across requests that share the same thread.
import { createAgent } from "@agentuity/runtime";
import { s } from "@agentuity/schema";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

type Message = { role: "user" | "assistant"; content: string };

const chatAgent = createAgent("chat", {
  description: "Conversation memory with thread state",
  schema: {
    input: s.object({ message: s.string() }),
    output: s.object({
      response: s.string(),
      turnCount: s.number(),
      threadId: s.string(),
    }),
  },
  handler: async (ctx, { message }) => {
    const messages = ((await ctx.thread.state.get("messages")) as Message[]) ?? [];
    const turnCount = ((await ctx.thread.state.get("turnCount")) as number) ?? 0;

    const { text } = await generateText({
      model: openai("gpt-5.4-nano"),
      system: "You are an Agentuity expert assistant. Keep responses concise (2-3 sentences).",
      messages: [...messages, { role: "user", content: message }],
    });

    await ctx.thread.state.push("messages", { role: "user", content: message }, 50);
    await ctx.thread.state.push("messages", { role: "assistant", content: text }, 50);
    await ctx.thread.state.set("turnCount", turnCount + 1);

    return {
      response: text,
      turnCount: turnCount + 1,
      threadId: ctx.thread.id,
    };
  },
});`,

	'model-arena': `// LLM-as-Judge: Have one model evaluate outputs from other models.
// Pattern: Generate responses in parallel, then use generateObject()
// to get structured evaluation with guaranteed schema compliance.
import { createAgentContext } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { z } from "zod";

const ctx = createAgentContext();
const userPrompt = "Write a haiku about coding";

// Define evaluation criteria as a Zod schema
// generateObject() guarantees the LLM returns exactly this shape
const JudgmentSchema = z.object({
  winner: z.enum(["model-a", "model-b"]),
  reasoning: z.string(),
  scores: z.object({
    creativity: z.number().min(0).max(1),
    clarity: z.number().min(0).max(1),
  }),
});

// Generate competing responses in parallel
const [responseA, responseB] = await Promise.all([
  generateText({
    model: openai("gpt-5.4-nano"),
    prompt: userPrompt,
  }),
  generateText({
    model: anthropic("claude-haiku-4-5"),
    prompt: userPrompt,
  }),
]);

// Use Groq/GPT-OSS-120B for fast structured evaluation
const { object: judgment } = await generateObject({
  model: groq("openai/gpt-oss-120b"),
  schema: JudgmentSchema,
  prompt: \`Compare these responses and pick a winner.
Score each on creativity and clarity (0-1).

Model A: \${responseA.text}
Model B: \${responseB.text}\`,
});

// TypeScript knows the exact shape (fully typed, no parsing needed)
ctx.logger.info("Judge result", { winner: judgment.winner });
ctx.logger.info("Scores", judgment.scores);`,

	'ai-gateway': `// AI Gateway: One SDK key, any provider.
// The Gateway handles authentication for all AI providers automatically.
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
// import { google } from "@ai-sdk/google";  // Also supported!
import { generateText } from "ai";

// Call OpenAI - no API key configuration needed
ctx.logger.info("Calling OpenAI", { model: "gpt-5.4-nano" });
const openaiResult = await generateText({
  model: openai("gpt-5.4-nano"),
  prompt: "Explain AI agents in 1 sentence.",
});
ctx.logger.info("OpenAI response", { text: openaiResult.text });

// Call Anthropic - same simple pattern
ctx.logger.info("Calling Anthropic", { model: "claude-haiku-4-5" });
const claudeResult = await generateText({
  model: anthropic("claude-haiku-4-5"),
  prompt: "Explain AI agents in 1 sentence.",
});
ctx.logger.info("Claude response", { text: claudeResult.text });

// That's it! The Gateway:
// - Routes requests to the correct provider
// - Handles authentication automatically
// - Tracks usage and costs in your dashboard`,

	websocket: `// WebSocket route for real-time bidirectional communication.
// The websocket() middleware handles upgrade and lifecycle automatically.
import { createRouter, websocket } from "@agentuity/runtime";

const router = createRouter();

router.get("/connect", websocket((c, ws) => {
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  ws.onOpen(() => {
    c.var.logger?.info("Client connected");

    ws.send(JSON.stringify({
      type: "system",
      message: "Connected! Send messages and I will echo them back.",
      timestamp: new Date().toISOString(),
    }));

    heartbeat = setInterval(() => {
      ws.send(JSON.stringify({
        type: "heartbeat",
        message: "ping",
        timestamp: new Date().toISOString(),
      }));
    }, 15000);
  });

  ws.onMessage(async (event) => {
    const message = String(event.data).trim();
    const timestamp = new Date().toISOString();

    c.var.logger?.info("WebSocket message received", { message });

    ws.send(JSON.stringify({
      type: "echo",
      message: \`[\${timestamp}] Echo: \${message}\`,
      original: message,
      timestamp,
    }));
  });

  ws.onClose(() => {
    if (heartbeat) clearInterval(heartbeat);
  });
}));`,

	webrtc: `// Server
import { createRouter, webrtc } from "@agentuity/runtime";

// Client
import { useWebRTCCall } from "@agentuity/react";

const router = createRouter();

// Server: signaling only
router.get("/signal", webrtc({ maxPeers: 2 }));

// Client: peers exchange data directly after negotiation
function DataChat({ roomId }: { roomId: string }) {
  const { state, peerId, sendString, connect, hangup } = useWebRTCCall({
    roomId,
    signalUrl: "/api/webrtc/signal",
    media: false,
    dataChannels: [{ label: "chat", ordered: true }],
    autoConnect: false,
    callbacks: {
      onDataChannelMessage: (from, label, data) => {
        if (label === "chat") {
          console.log(\`[\${from}] \${String(data)}\`);
        }
      },
    },
  });

  // connect() to join, sendString("chat", text) to send,
  // hangup() to leave. State: idle -> connecting -> connected.
}`,

	queue: `// Message Queue: publish messages for async processing.
// Agents publish via ctx.queue. Workers receive and ack/nack.

// CREATE a queue with worker type and retry settings
const queueName = "task-queue";
await ctx.queue.createQueue(queueName, {
  queueType: "worker",
  settings: {
    defaultMaxRetries: 3,
    defaultVisibilityTimeoutSeconds: 30,
  },
});

// PUBLISH a message
const published = await ctx.queue.publish(queueName, {
  task: "process-order",
  orderId: "order-123",
  priority: "high",
}, {
  sync: true,
  metadata: { source: "checkout" },
  idempotencyKey: "order-123-v1",
});

ctx.logger.info("Published processing job");

// If you need queue metadata:
// ctx.logger.info("Message metadata", {
//   id: published.id,
//   offset: published.offset,
// });

// PUBLISH another message (fire-and-forget, no sync)
await ctx.queue.publish(queueName, {
  task: "send-receipt",
  orderId: "order-123",
});

// Expire a message after a fixed number of seconds
// await ctx.queue.publish(queueName, { task: "remind-user" }, { ttl: 3600 });

// Use QueueClient in CLIs or background jobs with the same core methods
// const client = new QueueClient();
// await client.createQueue(queueName);
// await client.publish(queueName, { task: "process-order" });

// CLEANUP
await ctx.queue.deleteQueue(queueName);
ctx.logger.info("Queue deleted");`,

	email: `import { createAgent } from "@agentuity/runtime";
import { s } from "@agentuity/schema";

const agent = createAgent("email-sender", {
  description: "Send a demo email",
  schema: {
    input: s.object({
      template: s.literal("welcome"),
      to: s.string().email(),
    }),
    output: s.object({
      status: s.string(),
      subject: s.string(),
      to: s.array(s.string()),
      from: s.string(),
    }),
  },
  handler: async (ctx, { template, to }) => {
    const subject = "Hello from the Agentuity SDK Explorer";
    const from = "hello-explorer@agentuity.email";

    ctx.logger.info("Sending email demo", {
      subject,
      to: [to],
    });

    const result = await ctx.email.send({
      from,
      to: [to],
      subject,
      text: "This is a demo email from Agentuity's SDK Explorer.",
      html: "<p>This is a demo email from Agentuity's SDK Explorer, sent with <code>ctx.email.send()</code>.</p>",
    });

    // send() returns immediately with a pending record.
    const outbound = await ctx.email.getOutbound(result.id);

    // If you need the outbound record later:
    // const outboundId = result.id;
    // const fullRecord = await ctx.email.getOutbound(result.id);

    // Inbound is a separate flow:
    // const inbox = await ctx.email.listInbound("eaddr_abc123");
    // const reply = await ctx.email.getInbound("einb_abc123");

    return {
      status: outbound?.status ?? result.status,
      subject,
      to: [to],
      from,
    };
  },
});`,

	database: `// Database: type-safe PostgreSQL queries with Drizzle ORM.
// Same chairs as the vector demo — found by exact criteria instead of meaning.
import { createPostgresDrizzle, pgTable, text, real, serial, lt, gte, ilike, sql } from "@agentuity/drizzle";

// Define your schema in TypeScript
const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  avg_rating: real("avg_rating").notNull(),
  description: text("description").notNull(),
  customer_feedback: text("customer_feedback").notNull(),
});

// Connect (uses DATABASE_URL by default)
const { db, close } = createPostgresDrizzle({ schema: { products } });

// All products
const all = await db.select().from(products);
ctx.logger.info("All products", { count: all.length });

// Budget chairs (under $200)
const budget = await db.select().from(products).where(lt(products.price, 200));
ctx.logger.info("Budget chairs", { count: budget.length });

// Top rated (4.5+)
const topRated = await db.select().from(products).where(gte(products.avg_rating, 4.5));
ctx.logger.info("Top rated", { count: topRated.length });

// Search by keyword
const search = await db.select().from(products).where(ilike(products.name, "%Ergo%"));
ctx.logger.info("Search results", { count: search.length });

// Aggregates are a good sandbox default because they keep output compact.
const result = await db.execute(sql\`
  SELECT ROUND(AVG(price)::numeric, 2) AS "avgPrice",
         MIN(price) AS "minPrice", MAX(price) AS "maxPrice",
         COUNT(*)::int AS "total"
  FROM products
\`);
const summary = result.rows[0];
ctx.logger.info("Price summary", summary);

await close();`,
};
