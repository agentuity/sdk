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
const namespace = "explorer-" + crypto.randomUUID();
const key = "session-" + crypto.randomUUID();

const session = {
  visitorId: "visitor-abc123",
  lastActive: new Date().toISOString(),
  preferences: { theme: "dark" },
};

let summary: {
  found: boolean;
  keys: string[];
  matches: number;
  itemCount: number;
  namespaceVisible: boolean;
};

try {
  await kv.createNamespace(namespace, { defaultTTLSeconds: 300 });
  await kv.set(namespace, key, session, { ttl: 300 });
  await kv.set(namespace, key + ":summary", {
    visitorId: session.visitorId,
    theme: session.preferences.theme,
  }, { ttl: 300 });

  const result = await kv.get<typeof session>(namespace, key);
  const keys = await kv.getKeys(namespace);
  const matches = await kv.search<typeof session>(namespace, "session");
  const stats = await kv.getStats(namespace);
  const namespaces = await kv.getNamespaces();

  summary = {
    found: result.exists,
    keys,
    matches: matches.size,
    itemCount: stats.count,
    namespaceVisible: namespaces.includes(namespace),
  };
} finally {
  await kv.deleteNamespace(namespace);
}

export { summary };`,

	'vector-storage': `import { VectorClient } from "@agentuity/vector";

const vector = new VectorClient();
const namespace = "product-search-" + crypto.randomUUID();
const sku = "chair-" + crypto.randomUUID();
const deskSku = "desk-" + crypto.randomUUID();

let summary: {
  chairFound: boolean;
  loaded: number;
  topMatch: string | undefined;
  exists: boolean;
  count: number;
  namespaceVisible: boolean;
};

try {
  await vector.upsert(
    namespace,
    {
      key: sku,
      document: "ErgoMax Pro Chair: ergonomic office chair with lumbar support",
      metadata: { sku, name: "ErgoMax Pro Chair", price: 549 },
    },
    {
      key: deskSku,
      document: "LiftDesk Air: adjustable standing desk for focused work",
      metadata: { sku: deskSku, name: "LiftDesk Air", price: 799 },
    }
  );

  const chair = await vector.get<{ sku: string; name: string; price: number }>(
    namespace,
    sku
  );
  const documents = await vector.getMany(namespace, sku, deskSku);
  const results = await vector.search<{
    sku: string;
    name: string;
    price: number;
  }>(namespace, {
    query: "comfortable chair",
    limit: 3,
    similarity: 0.3,
  });
  const exists = await vector.exists(namespace);
  const stats = await vector.getStats(namespace);
  const namespaces = await vector.getNamespaces();

  summary = {
    chairFound: chair.exists,
    loaded: documents.size,
    topMatch: results[0]?.metadata?.name,
    exists,
    count: stats.count,
    namespaceVisible: namespaces.includes(namespace),
  };

  await vector.delete(namespace, sku, deskSku);
} finally {
  await vector.deleteNamespace(namespace);
}

export { summary };`,

	'object-storage': `import { S3Client } from "bun";
import { bucketConfigFromEnv, createS3Client } from "@agentuity/storage";
import { resolveEndpoint } from "@agentuity/storage/types";

const bucket = bucketConfigFromEnv();
const storage = createS3Client(bucket);
const key = "reports/demo-" + crypto.randomUUID() + ".txt";
const body = "Generated at " + new Date().toISOString();

// Portable SDK path: works in Bun and Node.js.
await storage.write(key, body, {
  type: "text/plain",
});

const file = storage.file(key);
const text = await file.text();
const stat = await storage.stat(key);
const listing = await storage.list({ prefix: "reports/", maxKeys: 10 });

// Bun-only option today: use Bun's S3Client for presigned URLs.
const bunStorage = new S3Client({
  endpoint: resolveEndpoint(bucket),
  accessKeyId: bucket.access_key,
  secretAccessKey: bucket.secret_key,
  region: bucket.region ?? "auto",
  virtualHostedStyle: true,
});

const downloadUrl = bunStorage.presign(key, {
  method: "GET",
  expiresIn: 60 * 15,
});

// Node.js presign option:
// Use @aws-sdk/s3-request-presigner with @aws-sdk/client-s3.
// @agentuity/storage does not expose storage.presign() yet.
//
// Delete the object after the share URL no longer needs to work:
// await storage.delete(key);

export const report = {
  key,
  text,
  bytes: stat.size,
  filesListed: listing.contents.length,
  downloadUrl,
};`,

	'sse-stream': `import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { AIGatewayClient } from "@agentuity/aigateway";

const app = new Hono();
const gateway = new AIGatewayClient();
const MODEL = "googleai/gemini-3.5-flash";

app.get("/api/sse-stream", (c) => {
  return streamSSE(c, async (stream) => {
    const result = await gateway.streamRequest({
      path: "/",
      body: {
        model: MODEL,
        stream: true,
        messages: [
          {
            role: "user",
            content: "What are AI agents and how do they work?",
          },
        ],
      },
    });

    let id = 0;
    for await (const chunk of readGatewayText(result.stream)) {
      await stream.writeSSE({
        event: "chunk",
        data: chunk,
        id: String(id++),
      });
    }

    const metadata = await result.metadata;
    const totalTokens =
      (metadata.cost?.promptTokens ?? 0) +
      (metadata.cost?.completionTokens ?? 0);

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ totalTokens }),
      id: String(id),
    });
  });
});

async function* readGatewayText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\\r?\\n\\r?\\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const text = readFrameText(frame);
        if (text) yield text;
      }
    }

    buffer += decoder.decode();
    const text = readFrameText(buffer);
    if (text) yield text;
  } finally {
    reader.releaseLock();
  }
}

function readFrameText(frame: string): string {
  const data = frame
    .split(/\\r?\\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\\n")
    .trim();

  if (!data || data === "[DONE]") return "";

  try {
    return readDeltaText(JSON.parse(data));
  } catch {
    return "";
  }
}

function readDeltaText(event: unknown): string {
  if (!isRecord(event)) return "";

  const choices = event.choices;
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        if (!isRecord(choice)) return "";

        const delta = choice.delta;
        if (isRecord(delta) && typeof delta.content === "string") {
          return delta.content;
        }

        return typeof choice.text === "string" ? choice.text : "";
      })
      .join("");
  }

  const delta = event.delta;
  if (typeof delta === "string") return delta;
  if (isRecord(delta)) {
    if (typeof delta.text === "string") return delta.text;
    if (typeof delta.content === "string") return delta.content;
  }

  const candidates = event.candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .map((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content)) return "";
      return textFromParts(candidate.content.parts);
    })
    .join("");
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (!isRecord(part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default app;`,

	streaming: `import { Hono } from "hono";
import { AIGatewayClient } from "@agentuity/aigateway";

const app = new Hono();
const gateway = new AIGatewayClient();
const encoder = new TextEncoder();
const MODEL = "googleai/gemini-3.5-flash";

app.post("/api/stream", async (c) => {
  const body: unknown = await c.req.json();
  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? String(body.prompt)
      : "Write a short note about AI agents.";

  const result = await gateway.streamRequest({
    path: "/",
    body: {
      model: MODEL,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    },
  });

  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of readGatewayText(result.stream)) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(textStream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

async function* readGatewayText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\\r?\\n\\r?\\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const text = readFrameText(frame);
        if (text) yield text;
      }
    }

    buffer += decoder.decode();
    const text = readFrameText(buffer);
    if (text) yield text;
  } finally {
    reader.releaseLock();
  }
}

function readFrameText(frame: string): string {
  const data = frame
    .split(/\\r?\\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\\n")
    .trim();

  if (!data || data === "[DONE]") return "";

  try {
    return readDeltaText(JSON.parse(data));
  } catch {
    return "";
  }
}

function readDeltaText(event: unknown): string {
  if (!isRecord(event)) return "";

  const choices = event.choices;
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        if (!isRecord(choice)) return "";

        const delta = choice.delta;
        if (isRecord(delta) && typeof delta.content === "string") {
          return delta.content;
        }

        return typeof choice.text === "string" ? choice.text : "";
      })
      .join("");
  }

  const delta = event.delta;
  if (typeof delta === "string") return delta;
  if (isRecord(delta)) {
    if (typeof delta.text === "string") return delta.text;
    if (typeof delta.content === "string") return delta.content;
  }

  const candidates = event.candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .map((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content)) return "";
      return textFromParts(candidate.content.parts);
    })
    .join("");
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (!isRecord(part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
let scheduleId: string | undefined;
let destinationId: string | undefined;
let summary: {
  scheduleId: string;
  destinationCount: number;
  listed: boolean;
  deliveries: number;
  expression: string;
};

try {
  const { schedule, destinations } = await schedules.create({
    name,
    description: "Call the sync endpoint every night",
    expression: "0 2 * * *",
    destinations: [{
      type: "url",
      config: {
        url: appUrl + "/api/sync",
        method: "POST",
      },
    }],
  });

  scheduleId = schedule.id;

  const extraDestination = await schedules.createDestination(schedule.id, {
    type: "url",
    config: {
      url: appUrl + "/api/audit-sync",
      method: "POST",
    },
  });
  destinationId = extraDestination.destination.id;

  const fetched = await schedules.get(schedule.id);
  const page = await schedules.list({ limit: 25 });
  const deliveryHistory = await schedules.listDeliveries(schedule.id, {
    limit: 10,
  });
  const updated = await schedules.update(schedule.id, {
    expression: "0 3 * * *",
  });

  summary = {
    scheduleId: fetched.schedule.id,
    destinationCount: fetched.destinations.length,
    listed: page.schedules.some((item) => item.id === schedule.id),
    deliveries: deliveryHistory.deliveries.length,
    expression: updated.schedule.expression,
  };
} finally {
  if (destinationId) await schedules.deleteDestination(destinationId);
  if (scheduleId) await schedules.delete(scheduleId);
}

export { summary };`,

	'durable-stream': `import { StreamClient } from "@agentuity/stream";
import { AIGatewayClient } from "@agentuity/aigateway";

const streams = new StreamClient();
const gateway = new AIGatewayClient();

const durable = await streams.create("ai-summaries", {
  contentType: "text/plain",
  metadata: { source: "nightly-report" },
  ttl: 60 * 60 * 24 * 30,
});

const result = await gateway.completeText({
  model: "openai/gpt-5.4-mini",
  messages: [
    {
      role: "user",
      content: "Write a short summary of today's customer feedback.",
    },
  ],
});

await durable.write(result.text);
await durable.close();

const info = await streams.get(durable.id);
const body = await new Response(await streams.download(durable.id)).text();
const page = await streams.list({
  namespace: "ai-summaries",
  limit: 10,
});

// Delete the stream after its public URL no longer needs to work:
// await streams.delete(durable.id);

export const published = {
  streamId: info.id,
  url: info.url,
  bytesWritten: durable.bytesWritten,
  downloaded: body,
  listed: page.streams.some((stream) => stream.id === durable.id),
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

const gateway = new AIGatewayClient();
const prompt = "Write a haiku about coding.";
const OPENAI_MODEL = "openai/gpt-5.4-mini";
const ANTHROPIC_MODEL = "anthropic/claude-opus-4-8";
const JUDGE_MODEL = "openai/gpt-5.4-mini";

const [openaiResult, anthropicResult] = await Promise.all([
  gateway.completeText({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt }],
  }),
  gateway.completeText({
    model: ANTHROPIC_MODEL,
    messages: [{ role: "user", content: prompt }],
  }),
]);

if (!openaiResult.hasText || !anthropicResult.hasText) {
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
        "\\n\\nOpenAI:\\n" +
        openaiResult.text,
    },
  ],
  response_schema: {
    name: "model_judgment",
    schema: {
      type: "object",
      properties: {
        winner: { type: "string", enum: ["openai", "anthropic"] },
        reasoning: { type: "string" },
        scores: {
          type: "object",
          properties: {
            clarity: { type: "number" },
            originality: { type: "number" },
          },
          required: ["clarity", "originality"],
          additionalProperties: false,
        },
      },
      required: ["winner", "reasoning", "scores"],
      additionalProperties: false,
    },
  },
});

export { data as judgment };`,

	'ai-gateway': `import { AIGatewayClient } from "@agentuity/aigateway";

const gateway = new AIGatewayClient();
const MODEL = "openai/gpt-5.4-mini";

const models = await gateway.listModels();

const text = await gateway.completeText({
  model: MODEL,
  messages: [
    {
      role: "user",
      content: "Explain AI agents in one sentence.",
    },
  ],
});

const structured = await gateway.completeStructured<{
  summary: string;
  category: "agent" | "workflow" | "other";
}>({
  model: MODEL,
  messages: [
    {
      role: "user",
      content: "Classify this: an AI agent can plan and call tools.",
    },
  ],
  response_schema: {
    name: "agent_classification",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        category: { type: "string", enum: ["agent", "workflow", "other"] },
      },
      required: ["summary", "category"],
      additionalProperties: false,
    },
  },
});

export const result = {
  providers: Object.keys(models),
  text: text.text,
  structured: structured.data,
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
let published: Awaited<ReturnType<typeof queues.publish>> | undefined;
let created = false;

try {
  await queues.createQueue(queueName, {
    queueType: "worker",
    settings: {
      defaultMaxRetries: 3,
      defaultVisibilityTimeoutSeconds: 30,
    },
  });
  created = true;

  published = await queues.publish(queueName, {
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
} finally {
  if (created) await queues.deleteQueue(queueName);
}

// Queue workers receive, ack, nack, and dead-letter messages from the
// Agentuity runtime route, not from the standalone QueueClient.

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
const outbox = await email.listOutbound();
const activity = await email.getActivity({ days: 7 });

export const status = {
  outboundId: outbound.id,
  status: latest?.status ?? outbound.status,
  listed: outbox.some((message) => message.id === outbound.id),
  activityDays: activity.activity.length,
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
