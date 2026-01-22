/**
 * Sandbox demo scripts.
 *
 * Scripts are stored as strings so they can be sent to cloud sandboxes at runtime.
 * To update: edit src/run/<name>.ts, then copy the content here.
 */

export const SCRIPTS: Record<string, string> = {
	hello: `\
/**
 * Standalone invoke script for Hello Agent
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 * Usage: bun run src/run/hello.ts '{"name":"World"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import helloAgent from "../agent/hello/agent";

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = createAgentContext();

try {
	ctx.logger.info("Processing greeting", { name: input.name });
	const result = await ctx.invoke(() => helloAgent.run(input));

	console.log("---OUTPUT---");
	console.log(result);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	vector: `\
/**
 * Standalone run script for Vector Search demo
 * Shows direct SDK calls: upsert → search → cleanup
 * Usage: bun run src/run/vector.ts '{"query":"comfortable chair"}'
 */
import { createAgentContext } from "@agentuity/runtime";

const input = JSON.parse(process.argv[2] ?? '{}');
const query = input.query ?? "comfortable chair";
const ctx = createAgentContext();

const runId = Date.now().toString(36);
const namespace = "explorer-sandbox";

const product = {
	sku: \`\${runId}:chair-001\`,
	name: "ErgoMax Pro Chair",
	price: 549,
};

await ctx.vector.upsert(namespace, {
	key: product.sku,
	document: \`\${product.name}: Premium ergonomic office chair with lumbar support\`,
	metadata: product,
});

const results = await ctx.vector.search(namespace, { query, limit: 3, similarity: 0.3 });

for (const result of results) {
	ctx.logger.info("Match found", {
		name: result.metadata?.name,
		price: result.metadata?.price,
		similarity: result.similarity.toFixed(2),
	});
}

await ctx.vector.delete(namespace, product.sku);
ctx.logger.info("Cleaned up", { sku: product.sku });

console.log("---OUTPUT---");
console.log(\`Upserted: "\${product.name}" (\${product.sku})\`);
console.log(\`Searched: "\${query}"\`);
console.log(\`Found: \${results.length} match(es)\`);
for (const r of results) {
	console.log(\`  - "\${r.metadata?.name}" ($\${r.metadata?.price}) - \${Math.round(r.similarity * 100)}%\`);
}
`,

	kv: `\
/**
 * Standalone run script for KV Storage demo
 * Shows direct SDK calls: set → get → delete
 * Usage: bun run src/run/kv.ts '{}'
 */
import { createAgentContext } from "@agentuity/runtime";

const ctx = createAgentContext();

const runId = Date.now().toString(36);
const bucket = "explorer-sandbox";
const key = \`\${runId}:session-001\`;

const sessionData = {
	visitorId: "visitor-abc123",
	lastActive: new Date().toISOString(),
	preferences: { theme: "dark" },
};

try {
	ctx.logger.info("Setting key");
	await ctx.kv.set(bucket, key, sessionData, { ttl: 300 });

	ctx.logger.info("Getting key");
	const result = await ctx.kv.get(bucket, key);

	await ctx.kv.delete(bucket, key);
	ctx.logger.info("Deleted key");

	console.log("---OUTPUT---");
	console.log(\`Set: "\${key}"\`);
	console.log(\`  visitorId: "\${sessionData.visitorId}"\`);
	console.log(\`  theme: "\${sessionData.preferences.theme}"\`);
	console.log(\`Get: \${result.exists ? "found" : "not found"}\`);
	console.log(\`Deleted: "\${key}"\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	'ai-gateway': `\
/**
 * Standalone run script for AI Gateway demo
 * Demonstrates: calling AI providers through Agentuity gateway
 * Usage: bun run src/run/ai-gateway.ts '{"prompt":"Tell me a joke"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? "Explain AI agents in 1 sentence.";

const ctx = createAgentContext();

try {
	ctx.logger.info("Calling OpenAI and Anthropic in parallel...");

	const [openaiResult, claudeResult] = await Promise.all([
		generateText({ model: openai("gpt-5-nano"), prompt }),
		generateText({ model: anthropic("claude-haiku-4-5"), prompt }),
	]);

	ctx.logger.info("Both completed");

	console.log("---OUTPUT---");
	console.log(\`Prompt: "\${prompt}"\`);
	console.log("");
	console.log("OpenAI (gpt-5-nano):");
	console.log(openaiResult.text);
	console.log("");
	console.log("Anthropic (claude-haiku-4-5):");
	console.log(claudeResult.text);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}

await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
`,

	streaming: `\
/**
 * Standalone run script for Streaming demo
 * Demonstrates: Raw text streaming using streamText
 * Usage: bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? "Write a short poem about AI.";

const ctx = createAgentContext();
ctx.logger.info("Streaming started", { prompt });

try {
	const { textStream } = streamText({ model: openai("gpt-5-nano"), prompt });

	let fullText = "";
	let tokenCount = 0;
	for await (const chunk of textStream) {
		fullText += chunk;
		tokenCount++;
	}

	console.log("---OUTPUT---");
	console.log(\`Prompt: "\${prompt}"\`);
	console.log("");
	console.log(fullText);
	console.log("");
	console.log(\`[Streamed \${tokenCount} tokens]\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}

await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
`,

	'sse-stream': `\
/**
 * Standalone run script for SSE Stream demo
 * Demonstrates: SSE-style streaming using streamText
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

const input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? "Explain what Server-Sent Events are in 2-3 sentences.";

const ctx = createAgentContext();
ctx.logger.info("SSE stream started", { prompt });

try {
	const { textStream } = streamText({ model: openai("gpt-5-nano"), prompt });

	let fullText = "";
	let tokenCount = 0;
	for await (const chunk of textStream) {
		fullText += chunk;
		tokenCount++;
	}

	console.log("---OUTPUT---");
	console.log(\`Prompt: "\${prompt}"\`);
	console.log("");
	console.log(fullText);
	console.log("");
	console.log(\`[Streamed \${tokenCount} SSE events]\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}

await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
`,

	chat: `\
/**
 * Standalone run script for Chat demo
 * Demonstrates: Thread state and session state APIs
 * Usage: bun run src/run/chat.ts '{"message":"Hello!"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import agentuityDocs from "../agent/chat/agentuity-context.txt";

const input = JSON.parse(process.argv[2] ?? "{}");
const message = input.message ?? "What is Agentuity?";

const ctx = createAgentContext();

try {
	ctx.session.state.set("requestStart", Date.now());

	const messages = ((await ctx.thread.state.get("messages")) as Array<{role: string, content: string}>) ?? [];
	const turnCount = ((await ctx.thread.state.get("turnCount")) as number) ?? 0;
	ctx.logger.info("Thread state retrieved", { messageCount: messages.length, turnCount });

	ctx.logger.info("Generating response");
	const { text } = await generateText({
		model: openai("gpt-5-nano"),
		system: \`You are an Agentuity expert assistant. Keep responses concise (2-3 sentences).\\n\\n## Agentuity Documentation\\n\${agentuityDocs}\`,
		messages: [...messages, { role: "user", content: message }],
	});

	await ctx.thread.state.push("messages", { role: "user", content: message }, 50);
	await ctx.thread.state.push("messages", { role: "assistant", content: text }, 50);
	await ctx.thread.state.set("turnCount", turnCount + 1);

	const elapsed = Date.now() - (ctx.session.state.get("requestStart") as number);

	console.log("---OUTPUT---");
	console.log(\`User: "\${message}"\`);
	console.log(\`Assistant: "\${text}"\`);
	console.log(\`Turn: \${turnCount + 1} (elapsed: \${elapsed}ms)\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	'handler-context': `\
/**
 * Standalone run script for Handler Context demo
 * Demonstrates: Key AgentContext properties and methods
 * Usage: bun run src/run/handler-context.ts '{}'
 */
import { createAgentContext, getAgentContext } from "@agentuity/runtime";

const standaloneCtx = createAgentContext();

await standaloneCtx.invoke(async () => {
	try {
		const ctx = getAgentContext();

		console.log("---OUTPUT---");
		console.log("=== Handler Context Demo ===");
		console.log("");
		console.log("Identifiers:");
		console.log(\`  sessionId: \${ctx.sessionId}\`);
		console.log(\`  threadId: \${ctx.thread.id}\`);
		console.log("");
		console.log("Logger (writes to trace, shown above):");
		ctx.logger.info("Processing request", { userId: "user-123" });
		ctx.logger.debug("Debug details", { threadId: ctx.thread.id });
		ctx.logger.warn("Example warning log");
		ctx.logger.error("Example error log");
		console.log("  ctx.logger.info(), .debug(), .warn(), .error() available");
		console.log("");
		console.log("Storage Access:");
		console.log("  ctx.kv - Key-Value storage");
		console.log("  ctx.vector - Vector storage");
		console.log("  ctx.objectstore - Object storage (S3)");
		console.log("");
		console.log("Thread State (persists across requests):");
		await ctx.thread.state.set("demo-key", { value: "test" });
		const stored = await ctx.thread.state.get("demo-key");
		console.log(\`  set("demo-key", {value: "test"})\`);
		console.log(\`  get("demo-key") -> \${JSON.stringify(stored)}\`);
		console.log("");
		console.log("Session State (per-request only):");
		const timestamp = new Date().toISOString();
		ctx.session.state.set("request-time", timestamp);
		const requestTime = ctx.session.state.get("request-time");
		console.log(\`  set("request-time", "\${timestamp}")\`);
		console.log(\`  get("request-time") -> \${requestTime}\`);
	} catch (error) {
		console.log("---OUTPUT---");
		console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
	}
});
`,

	objectstore: `\
/**
 * Standalone run script for Object Storage demo
 * Demonstrates: Write → Read flow with Bun's S3 API
 * Usage: bun run src/run/objectstore.ts '{}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { s3 } from "bun";

const ctx = createAgentContext();

const filename = \`demo-\${Date.now()}.txt\`;
const content = \`Hello from Object Storage!\\nTimestamp: \${new Date().toISOString()}\`;

try {
	ctx.logger.info("Writing file");
	const file = s3.file(filename);
	await file.write(content);

	ctx.logger.info("Reading file");
	const readContent = await file.text();
	const exists = await file.exists();

	ctx.logger.info("Deleting file");
	await file.delete();

	console.log("---OUTPUT---");
	console.log(\`Write: "\${filename}"\`);
	console.log(\`  Content: \${content.split("\\n")[0]}...\`);
	console.log(\`Read: "\${filename}"\`);
	console.log(\`  Content: \${readContent.split("\\n")[0]}...\`);
	console.log(\`Exists: \${exists}\`);
	console.log(\`Deleted: "\${filename}"\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	'durable-stream': `\
/**
 * Standalone run script for Durable Streams demo
 * Demonstrates: Creating a durable stream with a shareable URL
 * Usage: bun run src/run/durable-stream.ts '{"content":"Hello world"}'
 */
import { createAgentContext } from "@agentuity/runtime";

const input = JSON.parse(process.argv[2] ?? '{}');
const content = input.content ?? "This is a durable stream demo.\\nContent persists with a shareable URL.";

const ctx = createAgentContext();

try {
	ctx.logger.info("Creating durable stream");

	const streamName = \`demo-\${Date.now()}\`;
	const stream = await ctx.stream.create(streamName, {
		contentType: "text/plain",
		metadata: { created: new Date().toISOString() },
	});

	console.log("---OUTPUT---");
	console.log(\`Stream created: \${streamName}\`);
	console.log(\`Stream ID: \${stream.id}\`);
	console.log("");

	await stream.write(content);
	console.log("Content written:");
	console.log(\`  "\${content.split('\\n')[0]}..."\`);
	console.log("");

	await stream.close();
	console.log("Stream closed");
	console.log("");

	console.log("Public URL (shareable):");
	console.log(\`  \${stream.url}\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	cron: `\
/**
 * Standalone run script for Cron demo
 * Demonstrates: Simulating a cron job trigger
 * Usage: bun run src/run/cron.ts '{}'
 */
import { createAgentContext } from "@agentuity/runtime";

const ctx = createAgentContext();
const bucket = "v1-ks-cron";

try {
	ctx.logger.info("Hourly task running");

	console.log("---OUTPUT---");
	console.log("=== Hourly Data Sync (Simulated) ===");
	console.log(\`Triggered at: \${new Date().toISOString()}\`);
	console.log("");

	console.log("Step 1: Fetching external data...");
	const mockData = {
		lastUpdate: new Date().toISOString(),
		recordCount: Math.floor(Math.random() * 1000) + 100,
		source: "api.example.com",
	};
	console.log(\`  Fetched \${mockData.recordCount} records from \${mockData.source}\`);
	console.log("");

	console.log("Step 2: Caching in KV storage...");
	await ctx.kv.set(bucket, "latest-sync", mockData, { ttl: 3600 });
	console.log(\`  Cached to "\${bucket}/latest-sync" (TTL: 1 hour)\`);
	console.log("");

	const cached = await ctx.kv.get(bucket, "latest-sync");
	console.log("Step 3: Verifying cache...");
	if (cached.exists) {
		const data = cached.data as typeof mockData;
		console.log(\`  Cache verified: \${data.recordCount} records\`);
	} else {
		console.log("  Cache verification failed!");
	}
	console.log("");

	console.log("Step 4: Cleaning up (demo only)...");
	await ctx.kv.delete(bucket, "latest-sync");
	console.log(\`  Deleted "\${bucket}/latest-sync"\`);
	console.log("");

	console.log("Cron job completed successfully");
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}
`,

	'agent-calls': `\
/**
 * Standalone invoke script for Agent Calls Demo
 * Demonstrates: agent.run() for invoking agents, ctx.waitUntil() for background tasks
 * Usage: bun run src/run/agent-calls.ts '{"name":"World"}'
 */
import { createAgentContext, getAgentContext } from "@agentuity/runtime";
import helloAgent from "../agent/hello/agent";

const input = JSON.parse(process.argv[2] ?? "{}");
const name = input.name ?? "Explorer";

const standaloneCtx = createAgentContext();
standaloneCtx.logger.info("Agent calls demo");

await standaloneCtx.invoke(async () => {
	const ctx = getAgentContext();

	const greeting = await helloAgent.run({ name });

	let backgroundCompleted = false;
	ctx.waitUntil(
		(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			backgroundCompleted = true;
		})()
	);

	await new Promise((resolve) => setTimeout(resolve, 150));

	console.log("---OUTPUT---");
	console.log("Agent Invocation (agent.run):");
	console.log(\`  Input: { name: "\${name}" }\`);
	console.log(\`  Result: \${JSON.stringify(greeting)}\`);
	console.log("");
	console.log("Background Task (ctx.waitUntil):");
	console.log(\`  Scheduled async work after main execution\`);
	console.log(\`  Status: \${backgroundCompleted ? "completed" : "still running"}\`);
});
`,

	'model-arena': `\
/**
 * Standalone run script for Model Arena demo
 * Demonstrates: LLM-as-Judge pattern - two models compete, judge picks winner
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { z } from "zod";

const input = JSON.parse(process.argv[2] ?? '{}');
const userPrompt = input.prompt ?? "Write a creative one-liner about programming.";

const ctx = createAgentContext();

const JudgmentSchema = z.object({
	winner: z.enum(["model-a", "model-b"]),
	reasoning: z.string(),
	scores: z.object({
		creativity: z.number().min(0).max(1),
		clarity: z.number().min(0).max(1),
	}),
});

try {
	ctx.logger.info("Generating responses in parallel");

	const [responseA, responseB] = await Promise.all([
		generateText({ model: openai("gpt-5-nano"), prompt: userPrompt }),
		generateText({ model: anthropic("claude-haiku-4-5"), prompt: userPrompt }),
	]);

	ctx.logger.info("Judging responses");

	const { object: judgment } = await generateObject({
		model: openai("gpt-5-mini"),
		schema: JudgmentSchema,
		prompt: \`Compare these responses and pick a winner:\\n\\nModel A: \${responseA.text}\\nModel B: \${responseB.text}\\n\\nScore each on creativity and clarity (0-1).\`,
	});

	console.log("---OUTPUT---");
	console.log("=== Model Arena Demo ===");
	console.log(\`Prompt: "\${userPrompt}"\`);
	console.log("");
	console.log("Model A (gpt-5-nano):");
	console.log(\`  "\${responseA.text}"\`);
	console.log("");
	console.log("Model B (claude-haiku-4-5):");
	console.log(\`  "\${responseB.text}"\`);
	console.log("");
	console.log("Judge Decision:");
	console.log(\`  Winner: \${judgment.winner === "model-a" ? "Model A (gpt-5-nano)" : "Model B (claude-haiku-4-5)"}\`);
	console.log(\`  Reasoning: \${judgment.reasoning}\`);
	console.log(\`  Scores: Creativity=\${(judgment.scores.creativity * 100).toFixed(0)}%, Clarity=\${(judgment.scores.clarity * 100).toFixed(0)}%\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}

await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
`,

	evals: `\
/**
 * Standalone invoke script for Evals Demo
 * Demonstrates: Running evaluations on agent output
 * Usage: bun run src/run/evals.ts '{"question":"What is TypeScript?"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import agentuityDocs from "../agent/chat/agentuity-context.txt";

function parseJSON<T>(text: string, fallback: T): T {
	try {
		const jsonMatch = text.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/);
		const jsonStr = jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
		return JSON.parse(jsonStr);
	} catch {
		return fallback;
	}
}

const input = JSON.parse(process.argv[2] ?? '{}');
const question = input.question ?? "What is Agentuity and what are its main features?";

const ctx = createAgentContext();
ctx.logger.info("Running evals demo");

try {
	const { text: answer } = await generateText({
		model: openai("gpt-5-nano"),
		system: \`You are an Agentuity expert. Answer questions based on this documentation:\\n\\n\${agentuityDocs}\`,
		prompt: question,
	});

	const truncatedAnswer = answer.slice(0, 500);

	const [completenessResult, factualResult] = await Promise.all([
		generateText({
			model: openai("gpt-5-nano"),
			prompt: \`Rate 0-1 how completely this answer addresses the question. Return ONLY JSON: {"score": 0.85, "reason": "brief reason"}\\n\\nQ: "\${question}"\\nA: "\${truncatedAnswer}"\`,
		}).catch(() => null),
		generateText({
			model: openai("gpt-5-nano"),
			prompt: \`Does this text contain factual claims? Return ONLY JSON: {"containsFactualClaims": true, "reason": "brief reason"}\\n\\n"\${truncatedAnswer}"\`,
		}).catch(() => null),
	]);

	const completeness = completenessResult
		? parseJSON(completenessResult.text, { score: 0.75, reason: "Could not parse eval result" })
		: { score: 0.75, reason: "Eval failed" };

	const factual = factualResult
		? parseJSON(factualResult.text, { containsFactualClaims: true, reason: "Could not parse eval result" })
		: { containsFactualClaims: true, reason: "Eval failed" };

	console.log("---OUTPUT---");
	console.log(\`Question: "\${question}"\`);
	console.log("");
	console.log(\`Answer: "\${answer.slice(0, 200)}\${answer.length > 200 ? '...' : ''}"\`);
	console.log("");
	console.log("Evals:");
	console.log(\`  answer-completeness: \${(completeness.score * 100).toFixed(0)}% - "\${completeness.reason}"\`);
	console.log(\`  factual-claims: \${factual.containsFactualClaims ? 'Passed' : 'Failed'} - "\${factual.reason}"\`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
}

await new Promise<void>((resolve) => { process.stdout.write("", () => resolve()); });
`,
};

/** Default inputs for each script */
export const SCRIPT_DEFAULTS: Record<string, unknown> = {
	hello: { name: 'World' },
	vector: { query: 'ergonomic office chair' },
	kv: {},
	'ai-gateway': { prompt: 'Explain AI agents in 1 sentence.' },
	streaming: { prompt: 'Write a short poem about AI.' },
	'sse-stream': { prompt: 'Explain what Server-Sent Events are in 2-3 sentences.' },
	chat: { message: 'What is Agentuity?' },
	'handler-context': {},
	objectstore: {},
	'durable-stream': {
		content: 'This is a durable stream demo.\nContent persists with a shareable URL.',
	},
	cron: {},
	'agent-calls': { name: 'Explorer' },
	'model-arena': { prompt: 'Explain AI agents in 1 sentence.' },
	evals: { question: 'What is Agentuity and what are its main features?' },
};
