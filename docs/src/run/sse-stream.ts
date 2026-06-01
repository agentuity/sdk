/**
 * Standalone run script for SSE Stream demo
 *
 * The sandbox buffers stdout, so this script collects generated chunks and
 * prints the same content the route would send as named SSE events.
 *
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { getDemoContext } from '../api/context';
import { streamText } from 'ai';
import { getModel } from '../lib/models';

interface Input {
	prompt?: string;
}

const ctx = getDemoContext();
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

try {
	const input: Input = JSON.parse(process.argv[2] ?? '{}');
	const prompt = input.prompt ?? 'Explain what Server-Sent Events are in 2-3 sentences.';
	ctx.logger.info('SSE stream started', { prompt });
	const { textStream } = streamText({
		model: getModel(DEFAULT_MODEL),
		prompt,
	});

	// Count chunks to make the stream visible even though stdout is buffered.
	let fullText = '';
	let chunkCount = 0;
	for await (const chunk of textStream) {
		fullText += chunk;
		chunkCount++;
	}

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
