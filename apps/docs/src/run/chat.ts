/**
 * Standalone run script for Chat demo
 *
 * NOTE: Intentionally separate from src/agent/chat/agent.ts.
 * Uses simplified model (gpt-5-nano) without commands.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Thread state and session state APIs
 * Shows the full state management API surface.
 *
 * Usage: bun run src/run/chat.ts '{"message":"Hello!"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import agentuityDocs from "../agent/chat/agentuity-context.txt";

interface Message {
	role: "user" | "assistant";
	content: string;
}

interface Input {
	message?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? "{}");
const message = input.message ?? "What is Agentuity?";

const ctx = createAgentContext();

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
ctx.logger.info("Generating response");
const { text } = await generateText({
	model: openai("gpt-5-nano"),
	system: `You are an Agentuity expert assistant. Keep responses concise (2-3 sentences).

## Agentuity Documentation
${agentuityDocs}`,
	messages: [...messages, { role: "user", content: message }],
});

// Update thread state with sliding window (max 50 messages)
await ctx.thread.state.push("messages", { role: "user", content: message }, 50);
await ctx.thread.state.push("messages", { role: "assistant", content: text }, 50);
await ctx.thread.state.set("turnCount", turnCount + 1);
ctx.logger.info("Thread state updated", { newTurnCount: turnCount + 1 });

// Session state: check elapsed time
const elapsed = Date.now() - (ctx.session.state.get("requestStart") as number);
ctx.logger.info("Request completed", { elapsedMs: elapsed });

console.log("---OUTPUT---");
console.log(`User: "${message}"`);
console.log(`Assistant: "${text}"`);
console.log(`Turn: ${turnCount + 1} (elapsed: ${elapsed}ms)`);
