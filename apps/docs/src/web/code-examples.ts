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
// Buckets auto-created. Keys should be unique per run.

const bucket = "explorer-sandbox";
const runId = Date.now().toString(36);
const key = \`\${runId}:session-001\`;

// Sample session data
const sessionData = {
  visitorId: "visitor-abc123",
  lastActive: new Date().toISOString(),
  preferences: { theme: "dark" },
};

ctx.logger.info("Setting key", { key });

// SET: store data with optional TTL (minimum 60 seconds)
await ctx.kv.set(bucket, key, sessionData, { ttl: 300 });

ctx.logger.info("Getting key", { key });

// GET: returns { exists, data } discriminated union
const result = await ctx.kv.get(bucket, key);

if (result.exists) {
  ctx.logger.info("Session found", {
    visitorId: result.data.visitorId,
    theme: result.data.preferences.theme,
  });
} else {
  ctx.logger.info("Session not found");
}

// CLEANUP: delete the unique key
await ctx.kv.delete(bucket, key);
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
// Perfect for LLM token streaming, progress updates, and live feeds.
import { createRouter, sse } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = createRouter();

// sse() middleware with flattened (c, stream) signature
router.get("/stream", sse(async (c, stream) => {
  const prompt = c.req.query("prompt") ?? "Tell me a story";

  c.var.logger?.info("SSE stream started", { prompt });

  const { textStream } = streamText({
    model: openai("gpt-5-nano"),
    prompt,
  });

  // Stream tokens as they arrive from the LLM
  let tokenCount = 0;
  for await (const chunk of textStream) {
    await stream.writeSSE({
      event: "token",      // Event type (client listens for this)
      data: chunk,         // The actual content
      id: String(tokenCount++),  // Optional: enables client reconnection
    });
  }

  // Signal completion
  await stream.writeSSE({
    event: "done",
    data: JSON.stringify({ totalTokens: tokenCount }),
  });

  // Stream closes automatically when handler returns
}));`,

	streaming: `// Raw streaming for simple text responses.
// Simpler than SSE - just returns a ReadableStream directly.
import { createRouter, stream } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = createRouter();

// stream() middleware wraps your handler and pipes the ReadableStream
// Clients consume with fetch + getReader()
router.post("/stream", stream(async (c) => {
  const { prompt } = await c.req.json();

  c.var.logger?.info("Streaming started", { prompt });

  const { textStream } = streamText({
    model: openai("gpt-5-nano"),
    prompt,
  });

  // Return the stream directly - Agentuity handles the response
  return textStream;
}));`,

	'agent-calls': `// Agent calls: ctx.run() and ctx.waitUntil() patterns
// Demonstrates: invoking agents, background tasks
import { createAgentContext } from "@agentuity/runtime";
import helloAgent from "@agent/hello";

const ctx = createAgentContext();
const name = "from the hello agent";

ctx.logger.info("Calling hello agent", { name });

// ctx.run() is the standalone pattern for invoking agents
const greeting = await ctx.run(helloAgent, { name });
ctx.logger.info("Agent returned", { greeting });

// ctx.waitUntil() schedules background work
ctx.logger.info("Scheduling background task");
ctx.waitUntil(async () => {
  // Simulate async work (analytics, cleanup, etc)
  await new Promise((resolve) => setTimeout(resolve, 100));
  ctx.logger.info("Background task completed");
});

ctx.logger.info("Main execution complete (background still running)");`,

	cron: `// Schedule tasks with the cron() middleware.
// Platform triggers POST requests on your schedule.
import { createRouter, cron } from "@agentuity/runtime";

const router = createRouter();

// Runs every hour at minute 0
router.post("/hourly-task", cron("0 * * * *", async (c) => {
  c.var.logger?.info("Hourly task running");

  // Fetch data, update cache, send notifications, etc.
  const data = await fetch("https://api.example.com/data")
    .then(r => r.json());

  await c.var.kv?.set("cache", "latest", data, { ttl: 3600 });

  return c.json({ success: true, timestamp: new Date() });
}));

// Cron expressions: minute hour day month weekday
// "* * * * *"     every minute
// "0 * * * *"     every hour
// "0 0 * * *"     daily at midnight
// "0 9 * * 1"     Mondays at 9am`,

	'durable-stream': `// Create durable content with shareable URLs.
// Unlike ephemeral streams, content persists forever.
import { createRouter } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const router = createRouter();

router.post("/generate", async (c) => {
  // Create stream - returns a public URL
  const stream = await c.var.stream?.create("report", {
    contentType: "text/plain",
    metadata: { created: new Date().toISOString() },
  });

  // Write content in background
  c.var.waitUntil(async () => {
    const { textStream } = streamText({
      model: openai("gpt-5-nano"),
      prompt: "Generate a weekly report...",
    });

    for await (const chunk of textStream) {
      await stream.write(chunk);
    }
    await stream.close();
  });

  // Return URL immediately - shareable with anyone
  return c.json({
    url: stream.url,    // Public, permanent URL
    id: stream.id,
  });
});

// List all generated reports
router.get("/list", async (c) => {
  const { streams } = await c.var.stream?.list({ name: "report" });
  return c.json(streams);
});`,

	chat: `// Multi-turn chat with thread and session state
// Demonstrates: thread state, session state APIs
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const ctx = createAgentContext();
const message = "What is Agentuity?";

// Session state: per-request timing
ctx.session.state.set("requestStart", Date.now());

// Thread state: persists across requests (empty on first run in sandbox)
const messages = ((await ctx.thread.state.get("messages")) as Message[]) ?? [];
const turnCount = ((await ctx.thread.state.get("turnCount")) as number) ?? 0;
ctx.logger.info("Thread state retrieved", {
  messageCount: messages.length,
  turnCount,
  note: messages.length === 0 ? "empty (first run)" : "has history",
});

// Generate response
ctx.logger.info("Generating response", { message });
const { text } = await generateText({
  model: openai("gpt-5-nano"),
  system: "You are an Agentuity expert assistant. Keep responses concise (2-3 sentences).",
  messages: [...messages, { role: "user", content: message }],
});

// Update thread state with sliding window (max 50 messages)
await ctx.thread.state.push("messages", { role: "user", content: message }, 50);
await ctx.thread.state.push("messages", { role: "assistant", content: text }, 50);
await ctx.thread.state.set("turnCount", turnCount + 1);
ctx.logger.info("Thread state updated", { newTurnCount: turnCount + 1 });

// Session state: check elapsed time
const elapsed = Date.now() - (ctx.session.state.get("requestStart") as number);
ctx.logger.info("Request completed", { elapsedMs: elapsed });`,

	'model-arena': `// LLM-as-Judge: Have one model evaluate outputs from other models.
// Pattern: Generate responses in parallel, then use generateObject()
// to get structured evaluation with guaranteed schema compliance.
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { z } from "zod";

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
    model: openai("gpt-5-nano"),
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
ctx.logger.info("Calling OpenAI", { model: "gpt-5-nano" });
const openaiResult = await generateText({
  model: openai("gpt-5-nano"),
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

	evals: `// Evals run automatically after your agent responds.
// Define evaluations in a separate file alongside your agent.
import { answerCompleteness } from "@agentuity/evals";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import agent, { PROMPT } from "./agent";

// Preset eval: Answer Completeness (score 0-1)
// Uses middleware to transform agent I/O to match eval format
export const completenessEval = agent.createEval(
  answerCompleteness({
    middleware: {
      transformInput: () => ({ request: PROMPT }),
      transformOutput: (output) => ({ response: output.content }),
    },
  })
);

// Custom eval: Factual Claims (binary pass/fail)
// Uses generateObject with Zod schema for structured output
const FactualCheckSchema = z.object({
  containsFactualClaims: z.boolean(),
  reason: z.string(),
});

export const factualClaimsEval = agent.createEval("factual-claims", {
  description: "Verifies the response contains factual claims",
  handler: async (ctx, _input, output) => {
    const { object: result } = await generateObject({
      model: openai("gpt-5-mini"),
      schema: FactualCheckSchema,
      prompt: \`Does this text contain factual claims? "\${output.content}"\`,
    });

    return {
      passed: result.containsFactualClaims,
      reason: result.reason,
    };
  },
});`,
};
