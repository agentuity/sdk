/**
 * Standalone run script for Durable Streams demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Creating a durable stream with a shareable URL
 * Writes content to the stream and shows the public URL.
 *
 * Usage: bun run src/run/durable-stream.ts '{"content":"Hello world"}'
 */
import { createAgentContext } from "@agentuity/runtime";

interface Input {
	content?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const content = input.content ?? "This is a durable stream demo.\nContent persists with a shareable URL.";

const ctx = createAgentContext();
ctx.logger.info("Creating durable stream");

console.log("---OUTPUT---");

// Create a durable stream
const streamName = `demo-${Date.now()}`;
const stream = await ctx.stream.create(streamName, {
	contentType: "text/plain",
	metadata: { created: new Date().toISOString() },
});

console.log(`Stream created: ${streamName}`);
console.log(`Stream ID: ${stream.id}`);
console.log("");

// Write content
await stream.write(content);
console.log("Content written:");
console.log(`  "${content.split('\n')[0]}..."`);
console.log("");

// Close the stream
await stream.close();
console.log("Stream closed");
console.log("");

// The URL is shareable and permanent
console.log("Public URL (shareable):");
console.log(`  ${stream.url}`);
