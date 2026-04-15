/**
 * Standalone run script for Streaming demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/AGENTS.md for architecture details.
 *
 * Demonstrates: Raw text streaming using streamText
 * Note: Sandbox buffers stdout, so output appears all at once.
 * In a real server, text chunks would stream to the client in real-time.
 *
 * Usage: bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
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
	const prompt = input.prompt ?? 'Write a short poem about AI.';
	ctx.logger.info('Streaming started', { prompt });
	const { textStream } = streamText({
		model: openai('gpt-5-nano'),
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
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
