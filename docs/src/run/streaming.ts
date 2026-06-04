/**
 * Standalone run script for Streaming demo
 *
 * Emits each model chunk to stdout as it arrives so the Explorer's sandbox
 * route forwards it to the browser live, token by token.
 *
 * Usage: bun run src/run/streaming.ts '{"prompt":"Tell me a story"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
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

	// Emit each chunk as it arrives so the route streams it to the browser live.
	writeSandboxOutput(`Prompt: "${prompt}"\n\n`);
	let chunkCount = 0;
	for await (const chunk of textStream) {
		writeSandboxOutput(chunk);
		chunkCount++;
	}
	writeSandboxOutput(`\n\n[Streamed ${chunkCount} text chunks live from the sandbox]`);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
