/**
 * Standalone run script for Streaming demo
 *
 * The sandbox buffers stdout, so this script collects generated chunks and
 * prints the same content the route would stream as raw text.
 *
 * Usage: bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
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
	const prompt = input.prompt ?? 'Write a short poem about AI.';
	ctx.logger.info('Streaming started', { prompt });
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
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
	process.exitCode = 1;
}
