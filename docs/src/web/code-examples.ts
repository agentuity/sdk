/**
 * Code examples displayed in the Monaco editor for each demo.
 * The live sandbox scripts live in src/run/*.ts. These examples show the
 * framework-first shape readers should copy into their own apps.
 */
export const CODE_EXAMPLES = {
	hello: `import { agentuity } from "@agentuity/hono";
import type { Logger } from "@agentuity/hono";
import { Hono } from "hono";
import { z } from "zod";

type Variables = { logger: Logger };

const app = new Hono<{ Variables: Variables }>();
// The middleware adds Agentuity helpers to c.var for each request.
app.use("*", agentuity());

const HelloInput = z.object({
  name: z.string().min(1).default("World"),
});

app.post("/api/hello", async (c) => {
  const input = HelloInput.parse(await c.req.json());
  c.var.logger.info("Processing greeting", { name: input.name });

  return c.json({
    greeting: "Hello, " + input.name + "! Welcome to Agentuity.",
  });
});

export default app;`,

	'handler-context': `import { agentuity } from "@agentuity/hono";
import type { Logger, Services } from "@agentuity/hono";
import { Hono } from "hono";

type Variables = Pick<Services, "kv" | "queue" | "stream" | "vector"> & {
  logger: Logger;
};

const app = new Hono<{ Variables: Variables }>();
// Register once at the app boundary, then read only the helpers each route needs.
app.use("*", agentuity());

app.get("/api/context", async (c) => {
  const requestId = crypto.randomUUID();

  c.var.logger.info("Context inspected", {
    requestId,
    path: c.req.path,
  });

  await c.var.kv.set("request-inspection", requestId, {
    method: c.req.method,
    userAgent: c.req.header("user-agent") ?? "unknown",
  }, { ttl: 300 });

  return c.json({
    requestId,
    available: {
      logger: "c.var.logger",
      keyValue: "c.var.kv",
      vector: "c.var.vector",
      queues: "c.var.queue",
      durableStreams: "c.var.stream",
    },
  });
});

export default app;`,

	'key-value': `import { KeyValueClient } from "@agentuity/keyvalue";

const kv = new KeyValueClient();
const namespace = "explorer-sandbox";
const key = "session-" + crypto.randomUUID();

const session = {
  visitorId: "visitor-abc123",
  lastActive: new Date().toISOString(),
  preferences: { theme: "dark" },
};

await kv.set(namespace, key, session, { ttl: 300 });

const result = await kv.get<typeof session>(namespace, key);
if (result.exists) {
  // result.data is typed after the discriminated check.
  await kv.set(namespace, key + ":summary", {
    visitorId: result.data.visitorId,
    theme: result.data.preferences.theme,
  }, { ttl: 300 });
}

await kv.delete(namespace, key);`,

	'vector-storage': `import { VectorClient } from "@agentuity/vector";

const vector = new VectorClient();
const namespace = "product-search";
const sku = "chair-" + crypto.randomUUID();

await vector.upsert(namespace, {
  key: sku,
  document: "ErgoMax Pro Chair: ergonomic office chair with lumbar support",
  metadata: {
    sku,
    name: "ErgoMax Pro Chair",
    price: 549,
  },
});

const results = await vector.search<{
  sku: string;
  name: string;
  price: number;
}>(namespace, {
  query: "comfortable chair",
  limit: 3,
  similarity: 0.3,
});

for (const result of results) {
  // Similarity scores make ranking visible in your UI or logs.
  result.metadata?.name;
  result.similarity;
}

await vector.delete(namespace, sku);`,

	'object-storage': `import { bucketConfigFromEnv, createS3Client } from "@agentuity/storage";

const storage = createS3Client(bucketConfigFromEnv());
const key = "reports/demo-" + crypto.randomUUID() + ".txt";
const body = "Generated at " + new Date().toISOString();

await storage.write(key, body, {
  type: "text/plain",
});

const file = storage.file(key);
const text = await file.text();
const stat = await storage.stat(key);

await storage.delete(key);

export const report = {
  key,
  text,
  bytes: stat.size,
};`,

	'sse-stream': `import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

const app = new Hono();

app.get("/api/sse-stream", (c) => {
  const result = streamText({
    model: anthropic("claude-opus-4-8"),
    prompt: "What are AI agents and how do they work?",
  });

  return streamSSE(c, async (stream) => {
    let id = 0;
    for await (const chunk of result.textStream) {
      await stream.writeSSE({
        event: "chunk",
        data: chunk,
        id: String(id++),
      });
    }

    const usage = await result.usage;
    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ totalTokens: usage.totalTokens }),
      id: String(id),
    });
  });
});

export default app;`,

	streaming: `import { Hono } from "hono";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

const app = new Hono();

app.post("/api/stream", async (c) => {
  const body: unknown = await c.req.json();
  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? String(body.prompt)
      : "Write a short note about AI agents.";

  const result = streamText({
    model: anthropic("claude-opus-4-8"),
    prompt,
  });

  return result.toTextStreamResponse();
});

export default app;`,

	'agent-calls': `import { Hono } from "hono";
import { z } from "zod";

const ClassifyInput = z.object({
  message: z.string().min(1),
});

async function classifyIntent(message: string): Promise<"sales" | "support"> {
  return message.toLowerCase().includes("price") ? "sales" : "support";
}

async function draftReply(message: string, intent: "sales" | "support") {
  return {
    intent,
    reply:
      intent === "sales"
        ? "A teammate can help with pricing."
        : "A teammate can help troubleshoot this.",
    original: message,
  };
}

const app = new Hono();

app.post("/api/triage", async (c) => {
  const input = ClassifyInput.parse(await c.req.json());

  // The route owns validation and timing; the focused functions own the work.
  const intent = await classifyIntent(input.message);
  const response = await draftReply(input.message, intent);

  return c.json(response);
});

export default app;`,

	schedules: `import { ScheduleClient } from "@agentuity/schedule";

const schedules = new ScheduleClient();
const name = "nightly-sync-" + crypto.randomUUID();
const appUrl = process.env.APP_URL ?? "https://your-app.agentuity.dev";

const { schedule, destinations } = await schedules.create({
  name,
  description: "Call the sync endpoint every night",
  expression: "0 2 * * *",
  destinations: [
    {
      type: "url",
      config: {
        url: appUrl + "/api/sync",
        method: "POST",
      },
    },
  ],
});

const deliveryHistory = await schedules.listDeliveries(schedule.id, {
  limit: 10,
});

await schedules.update(schedule.id, {
  expression: "0 3 * * *",
});

await schedules.delete(schedule.id);

export const summary = {
  scheduleId: schedule.id,
  destinations: destinations.length,
  deliveries: deliveryHistory.deliveries.length,
};`,

	'durable-stream': `import { StreamClient } from "@agentuity/stream";
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";

const streams = new StreamClient();
const groq = createGroq({
  apiKey: process.env.AGENTUITY_SDK_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

const durable = await streams.create("ai-summaries", {
  contentType: "text/plain",
  metadata: { source: "nightly-report" },
  ttl: 60 * 60 * 24 * 30,
});

const result = streamText({
  model: groq("openai/gpt-oss-120b"),
  prompt: "Write a short summary of today's customer feedback.",
});

for await (const chunk of result.textStream) {
  await durable.write(chunk);
}

await durable.close();

export const published = {
  streamId: durable.id,
  url: durable.url,
  bytesWritten: durable.bytesWritten,
};`,

	chat: `import { KeyValueClient } from "@agentuity/keyvalue";
import { AIGatewayClient } from "@agentuity/aigateway";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const kv = new KeyValueClient();
const gateway = new AIGatewayClient();
const MODEL = "anthropic/claude-opus-4-8";

async function chat(conversationId: string, message: string) {
  const key = "conversation:" + conversationId + ":messages";
  const history = await kv.get<Message[]>("chat-history", key);
  const messages = history.exists ? history.data : [];

  const result = await gateway.completeText({
    model: MODEL,
    messages: [
      { role: "system", content: "You are a concise support assistant." },
      ...messages,
      { role: "user", content: message },
    ],
  });

  if (!result.hasText) {
    throw new Error("The model returned no text.");
  }

  const nextMessages = [
    ...messages,
    { role: "user", content: message },
    { role: "assistant", content: result.text },
  ].slice(-50);

  await kv.set("chat-history", key, nextMessages, { ttl: 60 * 60 });

  return {
    reply: result.text,
    turns: nextMessages.length / 2,
    conversationId,
  };
}

export const preview = await chat(
  "conv-" + crypto.randomUUID(),
  "What is Agentuity?"
);`,

	'model-arena': `import { AIGatewayClient } from "@agentuity/aigateway";
import { z } from "zod";

const gateway = new AIGatewayClient();
const prompt = "Write a haiku about coding.";
const ANTHROPIC_MODEL = "anthropic/claude-opus-4-8";
const GOOGLE_MODEL = "googleai/gemini-3.5-flash";
const JUDGE_MODEL = "groq/openai/gpt-oss-120b";

const [anthropicResult, googleResult] = await Promise.all([
  gateway.completeText({
    model: ANTHROPIC_MODEL,
    messages: [{ role: "user", content: prompt }],
  }),
  gateway.completeText({
    model: GOOGLE_MODEL,
    messages: [{ role: "user", content: prompt }],
  }),
]);

const Judgment = z.object({
  winner: z.enum(["anthropic", "google"]),
  reasoning: z.string(),
  scores: z.object({
    clarity: z.number().min(0).max(1),
    originality: z.number().min(0).max(1),
  }),
});

if (!anthropicResult.hasText || !googleResult.hasText) {
  throw new Error("One of the candidate models returned no text.");
}

const { data } = await gateway.completeStructured({
  model: JUDGE_MODEL,
  messages: [
    {
      role: "user",
      content:
        "Pick the better answer.\\n\\nAnthropic:\\n" +
        anthropicResult.text +
        "\\n\\nGoogle:\\n" +
        googleResult.text,
    },
  ],
  response_schema: { name: "model_judgment", schema: Judgment },
});

const judgment = Judgment.parse(data);

export { judgment };`,

	'ai-gateway': `import { AIGatewayClient } from "@agentuity/aigateway";

const gateway = new AIGatewayClient();

const models = await gateway.listModels();

const completion = await gateway.complete({
  model: "anthropic/claude-opus-4-8",
  messages: [
    {
      role: "user",
      content: "Explain AI agents in one sentence.",
    },
  ],
});

export const result = {
  providers: Object.keys(models),
  model: completion.model,
  firstChoice: completion.choices?.[0],
};`,

	websocket: `import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

const app = new Hono();

app.get("/api/websocket", upgradeWebSocket(() => {
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  return {
    onOpen(_event, ws) {
      ws.send(JSON.stringify({
        type: "system",
        message: "Connected. Send a message to echo it back.",
      }));

      heartbeat = setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat", message: "ping" }));
      }, 15000);
    },
    onMessage(event, ws) {
      ws.send(JSON.stringify({
        type: "echo",
        message: String(event.data),
        timestamp: new Date().toISOString(),
      }));
    },
    onClose() {
      clearInterval(heartbeat);
    },
  };
}));

export default {
  fetch: app.fetch,
  websocket,
};`,

	webrtc: `import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

const rooms = new Map<string, Set<{ send(data: string): void }>>();
const app = new Hono();

app.get("/api/webrtc/signal", upgradeWebSocket((c) => {
  const roomId = c.req.query("room") ?? "default";
  const peers = rooms.get(roomId) ?? new Set();
  rooms.set(roomId, peers);

  return {
    onOpen(_event, ws) {
      if (peers.size >= 2) {
        ws.send(JSON.stringify({ type: "room-full" }));
        return;
      }

      peers.add(ws);
      ws.send(JSON.stringify({
        type: "joined",
        initiator: peers.size === 2,
      }));
    },
    onMessage(event, ws) {
      // Relay opaque SDP and ICE payloads. The server does not inspect them.
      for (const peer of peers) {
        if (peer !== ws) {
          peer.send(String(event.data));
        }
      }
    },
    onClose(_event, ws) {
      peers.delete(ws);
      if (peers.size === 0) {
        rooms.delete(roomId);
      }
    },
  };
}));

// Agentuity hosts this route. Browser WebRTC handles media and data channels.
// Create RTCPeerConnection in the client, send each offer/answer/candidate over
// /api/webrtc/signal, then pass received payloads into setRemoteDescription()
// or addIceCandidate().

export default {
  fetch: app.fetch,
  websocket,
};`,

	queue: `import { QueueClient } from "@agentuity/queue";

const queues = new QueueClient();
const queueName = "orders-" + crypto.randomUUID();

await queues.createQueue(queueName, {
  queueType: "worker",
  settings: {
    defaultMaxRetries: 3,
    defaultVisibilityTimeoutSeconds: 30,
  },
});

const published = await queues.publish(queueName, {
  task: "process-order",
  orderId: "order-123",
  priority: "high",
}, {
  sync: true,
  idempotencyKey: "order-123-v1",
  metadata: { source: "checkout" },
});

await queues.publish(queueName, {
  task: "send-receipt",
  orderId: "order-123",
});

await queues.deleteQueue(queueName);

export { published };`,

	email: `import { EmailClient } from "@agentuity/email";

const email = new EmailClient();

const outbound = await email.send({
  from: "hello@your-domain.com",
  to: ["parteek@example.com"],
  subject: "Hello from Agentuity",
  text: "This is the plain-text body.",
  html: "<p>This is the HTML body.</p>",
});

const latest = await email.getOutbound(outbound.id);

export const status = {
  outboundId: outbound.id,
  status: latest?.status ?? outbound.status,
};`,

	database: `import { gte, ilike, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, real, serial, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  avgRating: real("avg_rating").notNull(),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { products } });

const budget = await db
  .select()
  .from(products)
  .where(lt(products.price, 200));

const topRated = await db
  .select()
  .from(products)
  .where(gte(products.avgRating, 4.5));

const search = await db
  .select()
  .from(products)
  .where(ilike(products.name, "%Ergo%"));

await pool.end();

export { budget, topRated, search };`,
};
