/**
 * Standalone run script for SSE Stream demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: SSE-style streaming using streamText
 * Same approach as streaming.ts - tokens stream to stdout.
 * In a real server, you'd use the sse() middleware with writeSSE().
 *
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

interface Input {
	prompt?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? "Explain what Server-Sent Events are in 2-3 sentences.";

const ctx = createAgentContext();
ctx.logger.info("Starting SSE stream");

console.log("---OUTPUT---");
console.log(`Prompt: "${prompt}"`);
console.log("");

try {
	console.log("[Starting streamText call]");

	const { textStream } = streamText({
		model: openai("gpt-5-nano"),
		prompt,
	});

	console.log("[Got textStream, starting iteration]");
	console.log("");

	let tokenCount = 0;
	for await (const chunk of textStream) {
		process.stdout.write(chunk);
		tokenCount++;
	}

	console.log("");
	console.log("");
	console.log(`[Streamed ${tokenCount} tokens]`);
} catch (error) {
	console.log("");
	console.log(`[Stream error: ${error instanceof Error ? error.message : String(error)}]`);
} finally {
	console.log("[Script finished]");
}
