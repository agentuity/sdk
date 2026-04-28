/**
 * Standalone run script for SSE Stream demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/AGENTS.md for architecture details.
 *
 * Demonstrates: SSE-style streaming using streamText
 * Note: Sandbox buffers stdout, so output appears all at once.
 * In a real server with sse() middleware, text chunks would stream via SSE events.
 *
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

interface Input {
	prompt?: string;
}

const ctx = createAgentContext();

try {
	const input: Input = JSON.parse(process.argv[2] ?? '{}');
	const prompt = input.prompt ?? 'Explain what Server-Sent Events are in 2-3 sentences.';
	ctx.logger.info('SSE stream started', { prompt });
	const { textStream } = streamText({
		model: openai('gpt-5.4-nano'),
		prompt,
	});

	// Collect streamed text chunks (sandbox buffers stdout anyway)
	let fullText = '';
	let chunkCount = 0;
	for await (const chunk of textStream) {
		fullText += chunk;
		chunkCount++;
	}

	// Output everything at once
	console.log('---OUTPUT---');
	console.log(`Prompt: "${prompt}"`);
	console.log('');
	console.log(fullText);
	console.log('');
	console.log(`[Buffered ${chunkCount} text chunks in the sandbox]`);
	console.log('In a real route, each chunk would be wrapped in named SSE events');
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
	process.exitCode = 1;
}
