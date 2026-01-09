import { AgentuityProvider } from '@agentuity/react';
import { BookOpenIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useState } from 'react';
import { AgentCallsDemo } from './components/AgentCallsDemo';
import { AIGatewayDemo } from './components/AIGatewayDemo';
import { ChatDemo } from './components/ChatDemo';
import { CodeBlock } from './components/CodeBlock';
import { CronDemo } from './components/CronDemo';
import { EvalsDemo } from './components/EvalsDemo';
import { HandlerContextDemo } from './components/HandlerContextDemo';
import { HelloDemo } from './components/HelloDemo';
import { KVExplorer } from './components/KVExplorer';
import { ModelArena } from './components/ModelArena';
import { ObjectStoreDemo } from './components/ObjectStoreDemo';
import { PersistentStreamDemo } from './components/PersistentStreamDemo';
import { SSEStreamDemo } from './components/SSEStreamDemo';
import { StreamingDemo } from './components/StreamingDemo';
import { ThemeProvider } from './components/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { VectorSearch } from './components/VectorSearch';

// Demo IDs for navigation
type DemoId =
	| 'hello'
	| 'handler-context'
	| 'chat'
	| 'key-value'
	| 'vector-storage'
	| 'model-arena'
	| 'ai-gateway'
	| 'sse-stream'
	| 'streaming'
	| 'durable-stream'
	| 'cron'
	| 'agent-calls'
	| 'object-storage'
	| 'evals';

// Demo configuration
interface DemoConfig {
	id: DemoId;
	title: string;
	subtitle: string;
	description: string; // Short description for landing page cards
	explanation: React.ReactNode; // 3-4 sentence educational explanation for detail page
	docsUrl?: string; // Link to relevant docs page
	category: 'basics' | 'services' | 'io-patterns' | 'examples';
	component: React.ComponentType;
	codeExample: string;
}

// Code examples for each demo
const CODE_EXAMPLES = {
	hello: `import { createAgent } from "@agentuity/runtime";
import { s } from "@agentuity/schema";

// The simplest agent - receives a name, returns a greeting.
// This demonstrates the minimal structure for an Agentuity agent.
const agent = createAgent("hello", {
  // Description shown in Workbench and agent registry
  description: "Simple greeting agent",

  // Schema defines input/output types - TypeScript infers handler types
  schema: {
    input: s.object({ name: s.string() }),
    output: s.string(),
  },

  // Handler receives typed input based on schema
  // _ctx provides logging, storage, thread state, etc.
  handler: async (_ctx, { name }) => {
    return \`Hello, \${name}! Welcome to Agentuity.\`;
  },
});

export default agent;`,

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
  ctx.logger.error("Something failed", { error: "message" });

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

	'key-value': `// Key-Value storage for fast, ephemeral data.
// Perfect for session state, caching, and temporary data.

// Buckets are auto-created if they don't exist
const bucket = "user-sessions";
const key = \`session:\${userId}\`;

// Store data with optional TTL
await ctx.kv.set(bucket, key, {
  visitorId: "abc-123",
  lastActive: new Date().toISOString(),
  preferences: { theme: "dark" },
}, {
  ttl: 3600, // Expires in 1 hour (minimum 60 seconds)
});

// Retrieve data - returns { exists, data } discriminated union
const result = await ctx.kv.get(bucket, key);

if (result.exists) {
  ctx.logger.info("Session found", { data: result.data });
} else {
  ctx.logger.info("Session not found");
}

// Delete when done
await ctx.kv.delete(bucket, key);

// List all keys in a bucket
const allKeys = await ctx.kv.getKeys(bucket);
ctx.logger.info("Active sessions", { count: allKeys.length });`,

	'vector-storage': `// Vector storage enables semantic search - find by meaning, not keywords.
// Ideal for product search, RAG systems, and knowledge bases.

// Namespaces are auto-created if they don't exist
const namespace = "products";

// Upsert: document text is converted to embeddings automatically
await ctx.vector.upsert<ProductMetadata>(namespace, {
  key: "chair-001",
  // The document field is what gets searched semantically
  document: "Ergonomic office chair with lumbar support and adjustable armrests",
  // Metadata is returned with search results for display/filtering
  metadata: {
    sku: "chair-001",
    name: "ErgoMax Pro",
    price: 299,
    description: "Premium ergonomic chair",
  },
});

// Semantic search - "comfortable chair" matches "ergonomic" and "lumbar support"
const results = await ctx.vector.search<ProductMetadata>(namespace, {
  query: "comfortable chair for working from home",
  limit: 3,         // Return top 3 matches
  similarity: 0.3,  // Minimum similarity threshold (0-1)
});

// Results include similarity scores and metadata
for (const result of results) {
  ctx.logger.info("Match found", {
    name: result.metadata?.name,
    price: result.metadata?.price,
    similarity: result.similarity.toFixed(2),
  });
}`,

	'object-storage': `// Object storage for files, images, and binary data.
// Uses Bun's native S3 API - credentials are auto-injected by Agentuity.
import { s3 } from "bun";

// Create a file reference
const file = s3.file("documents/report.pdf");

// Write content
await file.write("Hello, World!");
await file.write(jsonData, { type: "application/json" });

// Read content
const text = await file.text();
const json = await file.json();
const bytes = await file.bytes();

// Check existence and delete
if (await file.exists()) {
  await file.delete();
}`,

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

	'agent-calls': `// Agent invocation patterns using agent.run()
// This pattern works identically from routes OR other agents.
// Import agents and call them - fully type-safe.
import textProcessor from "@agent/text-processor";

/******************
 * Synchronous Call *
 ******************/

// Wait for result - fully typed based on agent's schema
const result = await textProcessor.run({
  text: "Hello world",
  operation: "clean",
});
ctx.logger.info("Cleaned text", { result });

/*********************
 * Fire-and-Forget *
 *********************/

// Background task - continues after response is sent
ctx.waitUntil(async () => {
  await textProcessor.run({ text, operation: "analyze" });
  ctx.logger.info("Background analysis completed");
});

return { status: "accepted" }; // Returns immediately

/******************
 * Chained Calls *
 ******************/

// Pipeline: output of one agent feeds into the next
const step1 = await textProcessor.run({ text, operation: "clean" });
const step2 = await textProcessor.run({
  text: step1.result,
  operation: "analyze",
});

/*****************************
 * Agent-to-Agent (same pattern!) *
 *****************************/

// In another agent's handler, the pattern is identical:
// import otherAgent from "@agent/other-agent";
// const result = await otherAgent.run({ ... });
// The agent.run() API is the same whether called from
// a route handler or from within another agent.`,

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
import { streamText } from "ai";

const router = createRouter();

router.post("/generate", async (c) => {
  // Create stream - returns a public URL
  const stream = await c.var.stream?.create("report", {
    contentType: "text/plain",
    metadata: { created: new Date().toISOString() },
  });

  // Write content in background
  c.executionCtx?.waitUntil((async () => {
    const { textStream } = streamText({
      model: openai("gpt-4"),
      prompt: "Generate a weekly report...",
    });

    for await (const chunk of textStream) {
      await stream.write(chunk);
    }
    await stream.close();
  })());

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

	chat: `// Multi-turn conversation using thread state for memory.
// Thread state persists across requests (expires after 1 hour of inactivity).
import { createAgent } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 50; // Sliding window for bounded memory

const agent = createAgent("chat", {
  handler: async (ctx, input) => {
    // Get current messages (empty array if first request)
    const messages = (await ctx.thread.state.get("messages")) as Message[] ?? [];
    const turnCount = (await ctx.thread.state.get("turnCount")) as number ?? 0;

    // Generate response with full conversation context
    const { text } = await generateText({
      model: openai("gpt-5-nano"),
      system: "You are a helpful assistant.",
      messages: [...messages, { role: "user", content: input.message }],
    });

    // Use push() with maxRecords for automatic sliding window
    await ctx.thread.state.push("messages", { role: "user", content: input.message }, MAX_MESSAGES);
    await ctx.thread.state.push("messages", { role: "assistant", content: text }, MAX_MESSAGES);
    await ctx.thread.state.set("turnCount", turnCount + 1);

    return { response: text };
  },
});`,

	'model-arena': `// LLM-as-Judge: Have one model evaluate outputs from other models.
// Pattern: Generate responses in parallel, then use generateObject()
// to get structured evaluation with guaranteed schema compliance.
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
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

// Use GPT-OSS via Groq for fast structured evaluation
const { object: judgment } = await generateObject({
  model: groq("openai/gpt-oss-120b"),
  schema: JudgmentSchema,
  prompt: \`Compare these responses and pick a winner:

Model A: \${responseA.text}
Model B: \${responseB.text}

Score each on creativity and clarity (0-1).\`,
});

// TypeScript knows the exact shape (fully typed, no parsing needed)
ctx.logger.info("Judge result", { winner: judgment.winner });
ctx.logger.info("Scores", judgment.scores);`,

	'ai-gateway': `// AI Gateway: One SDK key, any provider.
// The Gateway handles authentication for all AI providers automatically.
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// Call OpenAI - no API key configuration needed
const openaiResult = await generateText({
  model: openai("gpt-5-nano"),
  prompt: "Tell me a short story about AI",
});

// Call Anthropic - same simple pattern
const claudeResult = await generateText({
  model: anthropic("claude-haiku-4-5"),
  prompt: "Tell me a short story about AI",
});

// Call Google - Gateway routes to the right provider
const geminiResult = await generateText({
  model: google("gemini-2.5-flash-lite"),
  prompt: "Tell me a short story about AI",
});

// That's it! The Gateway:
// - Routes requests to the correct provider
// - Handles authentication automatically
// - Tracks usage and costs in your dashboard`,

	evals: `// Evals run automatically after your agent responds.
// Define evaluations in a separate file alongside your agent.
import { answerCompleteness } from "@agentuity/evals";
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
      model: openai("gpt-5-nano"),
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

const DEMOS: DemoConfig[] = [
	// Basics - fundamental concepts
	{
		id: 'hello',
		title: 'Hello Agent',
		subtitle: 'Basic Request/Response',
		description: 'Your first agent - send input, get output.',
		explanation: (
			<>
				An <em>agent</em> is code that receives input, processes it, and returns output. Unlike
				a simple function, agents can use tools, access storage, and maintain state across
				requests.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					This is the building block of any Agentuity project
				</span>
				. Every agent follows the same pattern: the <em>schema</em> declares what goes in and
				comes out, the <em>handler</em> processes requests. Once you're comfortable here,
				explore the{' '}
				<a
					href="?handler-context"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Handler Context
				</a>{' '}
				to see what tools are available inside your handler.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/creating-agents',
		category: 'basics',
		component: HelloDemo,
		codeExample: CODE_EXAMPLES.hello,
	},
	{
		id: 'handler-context',
		title: 'Handler Context',
		subtitle: 'AgentContext Properties',
		description: "See what's available inside your agent handler.",
		explanation: (
			<>
				When your agent runs, it receives a <em>context object</em> (ctx) with everything you
				need:{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					logging, storage access, session info, and more
				</span>
				. Think of it as your agent's toolbox. The context gives you access to{' '}
				<a
					href="?key-value"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					KV
				</a>
				,{' '}
				<a
					href="?vector-storage"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Vector
				</a>
				, and{' '}
				<a
					href="?object-storage"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Object
				</a>{' '}
				storage, thread state for conversations, and background task scheduling.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Reference/sdk-reference#context-api',
		category: 'basics',
		component: HandlerContextDemo,
		codeExample: CODE_EXAMPLES['handler-context'],
	},
	// Services - storage and AI gateway
	{
		id: 'key-value',
		title: 'KV Storage',
		subtitle: 'Key-Value Store',
		description: 'Store and retrieve data by key, with auto-expiration.',
		explanation: (
			<>
				Store and retrieve data by key, like a dictionary. Set a value with a key, get it back
				later using that exact key. Optionally set a <em>TTL</em> (time-to-live), which tells
				the system to automatically delete the data after a set period, perfect for caching or
				temporary sessions.{' '}
				<span className="bg-zinc-300/15 px-1 rounded">
					Use KV when you know the exact key you're looking for
				</span>
				. For searching by meaning or similarity, use{' '}
				<a
					href="?vector-storage"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Vector storage
				</a>{' '}
				instead.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Storage/key-value',
		category: 'services',
		component: KVExplorer,
		codeExample: CODE_EXAMPLES['key-value'],
	},
	{
		id: 'vector-storage',
		title: 'Vector Search',
		subtitle: 'Semantic Search',
		description: 'Find content by meaning, not just keywords.',
		explanation: (
			<>
				Traditional searches match exact words. Search for 'comfortable chair' and you won't
				find 'ergonomic seating'. Vector search finds results by{' '}
				<strong>
					<em>meaning</em>
				</strong>{' '}
				instead. Your text gets converted to numbers (<em>embeddings</em>) that capture
				concepts, so <em>similar ideas cluster together</em>, even when the words are completely
				different.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Use vector search when you need to find content by meaning
				</span>{' '}
				rather than exact keywords. For exact key lookups, use{' '}
				<a
					href="?key-value"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					KV storage
				</a>{' '}
				instead.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Storage/vector',
		category: 'services',
		component: VectorSearch,
		codeExample: CODE_EXAMPLES['vector-storage'],
	},
	{
		id: 'object-storage',
		title: 'Object Storage',
		subtitle: 'File Storage (Bun S3)',
		description: 'Store files with presigned URLs for sharing.',
		explanation: (
			<>
				Need to store files like images, PDFs, or videos? That's what object storage is for, and
				it handles larger files with ease. Upload a file and get back a shareable URL.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Need temporary access? Generate presigned URLs
				</span>{' '}
				that expire automatically. Under the hood, this uses <em>S3-compatible storage</em> (a
				widely-used standard for file storage), so the patterns you learn here work anywhere.
				For simple key-value data, see{' '}
				<a
					href="?key-value"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					KV storage
				</a>
				.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Storage/object',
		category: 'services',
		component: ObjectStoreDemo,
		codeExample: CODE_EXAMPLES['object-storage'],
	},
	{
		id: 'ai-gateway',
		title: 'AI Gateway',
		subtitle: 'Multi-Provider Routing',
		description: 'Use any AI provider with a single API key.',
		explanation: (
			<>
				Use any AI model from any provider (OpenAI, Anthropic, Google, etc.) with a{' '}
				<strong>single API key</strong>. No juggling multiple accounts or credentials.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					The AI Gateway handles authentication, tracks usage, and lets you switch models
				</span>{' '}
				with minimal code changes. Just import the provider SDK and call it. Works seamlessly
				with the Vercel AI SDK for streaming and structured output.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/ai-gateway',
		category: 'services',
		component: AIGatewayDemo,
		codeExample: CODE_EXAMPLES['ai-gateway'],
	},
	// I/O Patterns - streaming and real-time
	{
		id: 'streaming',
		title: 'Text Stream',
		subtitle: 'Raw Streaming',
		description: "Stream responses as they're generated.",
		explanation: (
			<>
				Stream data as it's generated instead of waiting for the complete response. This is{' '}
				<em>raw streaming</em>: bytes flow through as they're ready, with no extra structure
				added.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Perfect for simple LLM token streaming
				</span>{' '}
				where you just want text to appear word-by-word. If you need typed events, message IDs,
				or automatic reconnection, see{' '}
				<a
					href="?sse-stream"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					SSE streaming
				</a>
				.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/streaming-responses',
		category: 'io-patterns',
		component: StreamingDemo,
		codeExample: CODE_EXAMPLES.streaming,
	},
	{
		id: 'sse-stream',
		title: 'SSE Stream',
		subtitle: 'Server-Sent Events',
		description: 'Structured streaming with event types and auto-reconnect.',
		explanation: (
			<>
				A one-way stream from your server to the user's browser, with structure built in. Unlike
				raw streaming, SSE gives you <em>typed events</em> (like "token" or "done"), message{' '}
				<em>IDs</em> for tracking, and automatic reconnection if the connection drops.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					The sweet spot for LLM token streaming, live feeds, and progress updates
				</span>
				. For simpler use cases where you just need raw bytes, see{' '}
				<a
					href="?streaming"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Text Stream
				</a>
				.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Routes/sse',
		category: 'io-patterns',
		component: SSEStreamDemo,
		codeExample: CODE_EXAMPLES['sse-stream'],
	},
	{
		id: 'durable-stream',
		title: 'Durable Streams',
		subtitle: 'Shareable URLs',
		description: 'Generate content and get a permanent, shareable URL.',
		explanation: (
			<>
				Need to generate content and share it via URL? Durable streams let you write data (e.g.,
				text, files, AI output) to storage, then get a <em>permanent public URL</em> that anyone
				can access. Write your content, close the stream, and the URL stays accessible.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Great for exports, reports, and generated artifacts
				</span>
				. For real-time use cases where data streams in as it's generated, see{' '}
				<a
					href="?sse-stream"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					SSE streaming
				</a>
				. Use <code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">ctx.stream</code> to
				create, list, and manage your streams.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Storage/durable-streams',
		category: 'io-patterns',
		component: PersistentStreamDemo,
		codeExample: CODE_EXAMPLES['durable-stream'],
	},
	{
		id: 'agent-calls',
		title: 'Agent Calls',
		subtitle: 'Invocation Patterns',
		description: 'Call agents from routes or other agents.',
		explanation: (
			<>
				Agents can call other agents, and routes can call agents too. Think of it like functions
				calling functions:{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					you can break complex workflows into focused, reusable pieces
				</span>
				. Use <code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">agent.run()</code> to
				invoke any agent, wait for results synchronously, or use <em>ctx.waitUntil</em> for
				fire-and-forget background tasks.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/calling-other-agents',
		category: 'io-patterns',
		component: AgentCallsDemo,
		codeExample: CODE_EXAMPLES['agent-calls'],
	},
	{
		id: 'cron',
		title: 'Cron Jobs',
		subtitle: 'Scheduled Tasks',
		description: 'Run tasks on a schedule with cron expressions.',
		explanation: (
			<>
				Sometimes you need code to run automatically — every hour, every day, or on a custom
				schedule. That's what <em>cron jobs</em> do. The schedule is defined using a{' '}
				<em>cron expression</em> like{' '}
				<code className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">0 * * * *</code>, which reads
				as "minute hour day month weekday" (this one means "at minute 0 of every hour").{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Use cron for recurring tasks
				</span>{' '}
				like fetching data, cleaning up old records, or sending reports. Combine with{' '}
				<a
					href="?key-value"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					KV storage
				</a>{' '}
				to cache results so you don't have to fetch them each time.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Routes/cron',
		category: 'io-patterns',
		component: CronDemo,
		codeExample: CODE_EXAMPLES.cron,
	},
	// Examples - complete use cases
	{
		id: 'chat',
		title: 'Chat',
		subtitle: 'Multi-turn Conversation',
		description: 'Conversation memory that persists across messages.',
		explanation: (
			<>
				A conversation that remembers what was said before. Each message you send is a separate
				request, but the agent keeps track of the full conversation using <em>thread state</em>.
				This lets the AI reference earlier messages and maintain context.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					No database setup required; state management is built in
				</span>
				. See{' '}
				<a
					href="?handler-context"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					Handler Context
				</a>{' '}
				for more on state management.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Learn/Cookbook/Patterns/chat-with-history',
		category: 'examples',
		component: ChatDemo,
		codeExample: CODE_EXAMPLES.chat,
	},
	{
		id: 'model-arena',
		title: 'Model Arena',
		subtitle: 'LLM-as-Judge Comparison',
		description: 'Compare AI models using another AI as judge.',
		explanation: (
			<>
				Compare outputs from different AI models by{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					using another AI as the judge
				</span>
				. Generate content from multiple providers in parallel via the{' '}
				<a
					href="?ai-gateway"
					className="text-zinc-600 dark:text-zinc-400 underline hover:text-cyan-700 dark:hover:text-cyan-400"
				>
					AI Gateway
				</a>
				, then have a judge model score them on criteria you define: creativity, accuracy, tone,
				or whatever matters for your use case. Useful for comparing models or testing different
				prompts.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/schema-libraries',
		category: 'examples',
		component: ModelArena,
		codeExample: CODE_EXAMPLES['model-arena'],
	},
	{
		id: 'evals',
		title: 'Evals',
		subtitle: 'Automatic Quality Checks',
		description: 'Run evaluations after your agent responds.',
		explanation: (
			<>
				<em>Evaluations</em> are automated quality checks that run after your agent responds.
				They don't slow down your response; they execute in the background and results appear in
				the Agentuity console.{' '}
				<span className="bg-cyan-50 dark:bg-zinc-800 px-1 rounded">
					Two types: binary (pass/fail) and score (0-1)
				</span>
				. Use preset evals like <em>answer-completeness</em> or create custom evals with your
				own logic. Evals help you catch quality issues before users do and track performance
				over time.
			</>
		),
		docsUrl: 'https://preview.agentuity.dev/v1/Build/Agents/evaluations',
		category: 'examples',
		component: EvalsDemo,
		codeExample: CODE_EXAMPLES.evals,
	},
];

// Agentuity Logo component
function AgentuityLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			aria-label="Agentuity Logo"
			className={className}
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clipRule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
			<path
				clipRule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="#00FFFF"
				fillRule="evenodd"
			/>
		</svg>
	);
}

// Demo Card component
function DemoCard({ demo, onClick }: { demo: DemoConfig; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 text-left
                 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors duration-200 cursor-pointer
                 flex flex-col items-start"
		>
			<h3 className="text-zinc-900 dark:text-white font-normal mb-1">{demo.title}</h3>
			<p className="text-cyan-700 dark:text-cyan-400 text-xs mb-3">{demo.subtitle}</p>
			<p className="text-zinc-500 text-sm leading-relaxed">{demo.description}</p>
		</button>
	);
}

// Landing page with card grid
function LandingPage({ onSelectDemo }: { onSelectDemo: (id: DemoId) => void }) {
	const basics = DEMOS.filter((d) => d.category === 'basics');
	const services = DEMOS.filter((d) => d.category === 'services');
	const ioPatterns = DEMOS.filter((d) => d.category === 'io-patterns');
	const examples = DEMOS.filter((d) => d.category === 'examples');

	return (
		<div className="max-w-6xl mx-auto px-6 py-12">
			{/* Header */}
			<header className="flex items-center gap-4 mb-12">
				<AgentuityLogo className="h-10 w-auto" />
				<div className="flex-1">
					<h1 className="text-3xl font-thin text-zinc-900 dark:text-white">SDK Explorer</h1>
					<p className="text-zinc-500 text-sm">Agentuity v1 SDK</p>
				</div>
				<ThemeToggle />
			</header>

			{/* Basics Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Basics</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{basics.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => onSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* Services Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Services</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{services.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => onSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* I/O Patterns Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">
					I/O Patterns
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{ioPatterns.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => onSelectDemo(demo.id)} />
					))}
				</div>
			</section>

			{/* Examples Section */}
			<section className="mb-12">
				<h2 className="text-lg font-normal text-zinc-600 dark:text-zinc-400 mb-6">Examples</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{examples.map((demo) => (
						<DemoCard key={demo.id} demo={demo} onClick={() => onSelectDemo(demo.id)} />
					))}
				</div>
			</section>
		</div>
	);
}

// Demo view with split layout: demo on left, code on right
function DemoView({ demo, onBack }: { demo: DemoConfig; onBack: () => void }) {
	const DemoComponent = demo.component;

	return (
		<div className="min-h-screen flex flex-col">
			{/* Header: Back navigation */}
			<header className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
				<button
					type="button"
					onClick={onBack}
					className="flex items-center px-2 py-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
				>
					<ChevronLeftIcon className="w-4 h-4 mr-1.5" />
					<span>Back to Explorer</span>
				</button>
				<ThemeToggle />
			</header>

			{/* Split layout: top/bottom on mobile, left/right on desktop */}
			<div className="flex-1 flex flex-col lg:grid lg:grid-cols-[55fr_45fr] min-h-0">
				{/* Top (mobile) / Left (desktop): Interactive demo */}
				<div className="flex-1 lg:h-full overflow-auto lg:border-r border-b lg:border-b-0 border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
					{/* Explanation block with docs link - min-height for visual consistency across pages */}
					<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-4 min-h-[140px]">
						{/* Header bar - mirrors CodeBlock header style */}
						<div className="flex items-center justify-between px-4 h-12 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50">
							<h2 className="text-lg font-normal text-cyan-700 dark:text-cyan-400">
								{demo.title}
							</h2>
							{demo.docsUrl && (
								<a
									href={demo.docsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1.5 text-zinc-500 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors"
								>
									<BookOpenIcon className="w-5 h-5" />
									<span className="text-sm">Docs</span>
								</a>
							)}
						</div>
						{/* Description body */}
						<div className="px-4 py-4">
							<p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
								{demo.explanation}
							</p>
						</div>
					</div>

					{/* Interactive demo component */}
					<DemoComponent />
				</div>

				{/* Bottom (mobile) / Right (desktop): Code example */}
				<div className="flex-1 lg:h-full overflow-auto p-4 min-w-0">
					<CodeBlock code={demo.codeExample} title="Example Code" />
				</div>
			</div>
		</div>
	);
}

// Helper to get demo ID from URL (e.g., ?ai-gateway)
function getDemoFromUrl(): DemoId | null {
	const search = window.location.search.slice(1); // Remove leading "?"
	const demoIds = DEMOS.map((d) => d.id);
	if (demoIds.includes(search as DemoId)) {
		return search as DemoId;
	}
	return null;
}

// Main App component
export function App() {
	const [activeDemo, setActiveDemo] = useState<DemoId | null>(getDemoFromUrl);

	// Handle browser back/forward navigation
	useEffect(() => {
		const handlePopState = () => {
			setActiveDemo(getDemoFromUrl());
		};
		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	// Select a demo and update URL
	const selectDemo = useCallback((demoId: DemoId) => {
		setActiveDemo(demoId);
		window.history.pushState({}, '', `?${demoId}`);
	}, []);

	// Go back to landing page and clear URL
	const goBack = useCallback(() => {
		setActiveDemo(null);
		window.history.pushState({}, '', window.location.pathname);
	}, []);

	// If a demo is selected, show full-page view
	if (activeDemo) {
		const demo = DEMOS.find((d) => d.id === activeDemo);
		if (demo) {
			return (
				<ThemeProvider>
					<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
						<AgentuityProvider>
							<DemoView demo={demo} onBack={goBack} />
						</AgentuityProvider>
					</div>
				</ThemeProvider>
			);
		}
	}

	// Landing page with card grid
	return (
		<ThemeProvider>
			<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
				<AgentuityProvider>
					<LandingPage onSelectDemo={selectDemo} />
				</AgentuityProvider>
			</div>
		</ThemeProvider>
	);
}
