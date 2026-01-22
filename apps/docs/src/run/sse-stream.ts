/**
 * Standalone run script for SSE Stream demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: SSE-style streaming using streamText
 * Note: Sandbox buffers stdout, so output appears all at once.
 * In a real server with sse() middleware, tokens would stream via SSE events.
 *
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

interface Input {
	prompt?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const prompt = input.prompt ?? 'Explain what Server-Sent Events are in 2-3 sentences.';

const ctx = createAgentContext();
ctx.logger.info('SSE stream started', { prompt });

try {
	const { textStream } = streamText({
		model: openai('gpt-5-nano'),
		prompt,
	});

	// Collect streamed tokens (sandbox buffers stdout anyway)
	let fullText = '';
	let tokenCount = 0;
	for await (const chunk of textStream) {
		fullText += chunk;
		tokenCount++;
	}

	// Output everything at once
	console.log('---OUTPUT---');
	console.log(`Prompt: "${prompt}"`);
	console.log('');
	console.log(fullText);
	console.log('');
	console.log(`[Streamed ${tokenCount} SSE events]`);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}

// Ensure stdout is flushed before exit
await new Promise<void>((resolve) => {
	process.stdout.write('', () => resolve());
});
