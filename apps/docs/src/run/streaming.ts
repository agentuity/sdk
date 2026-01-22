/**
 * Standalone run script for Streaming demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Raw text streaming using streamText
 * Tokens are written to stdout as they arrive, streaming live via SSE to frontend.
 *
 * Usage: bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

interface Input {
	prompt?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? "Write a short poem about coding.";

const ctx = createAgentContext();
ctx.logger.info("Starting stream");

console.log("---OUTPUT---");

try {
	console.log("[Starting streamText call]");

	const { textStream } = streamText({
		model: openai("gpt-5-nano"),
		prompt,
	});

	console.log("[Got textStream, starting iteration]");
	console.log("");

	// Stream tokens directly to stdout - they flow live via SSE to the frontend
	let chunkCount = 0;
	for await (const chunk of textStream) {
		process.stdout.write(chunk);
		chunkCount++;
	}

	console.log("");
	console.log(`[Stream complete: ${chunkCount} chunks]`);
} catch (error) {
	console.log("");
	console.log(`[Stream error: ${error instanceof Error ? error.message : String(error)}]`);
} finally {
	console.log("[Script finished]");
}

// Ensure stdout is flushed before exit
await new Promise<void>((resolve) => {
	process.stdout.write("", () => resolve());
});
