/**
 * Standalone run script for Durable Streams demo
 *
 * Writes generated text into a durable stream and returns the shareable URL.
 * The stream keeps the completed output available after the request ends.
 *
 * Usage: bun run src/run/durable-stream.ts
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { streamText } from 'ai';
import { getModel } from '../lib/models';

const ctx = getDemoContext();
const DEFAULT_MODEL = 'groq/openai/gpt-oss-120b';

try {
	ctx.logger.info('Creating durable stream with LLM content');

	// Name streams by purpose plus run id so demo runs do not collide.
	const streamName = `demo-${Date.now()}`;
	const stream = await ctx.stream.create(streamName, {
		contentType: 'text/plain',
		metadata: { created: new Date().toISOString() },
	});

	// The route version would stream chunks as they arrive; the sandbox buffers stdout.
	const { textStream } = streamText({
		model: getModel(DEFAULT_MODEL),
		prompt: 'Write a 3-paragraph summary of what Agentuity is.',
	});

	let fullText = '';
	let chunkCount = 0;
	for await (const chunk of textStream) {
		await stream.write(chunk);
		fullText += chunk;
		chunkCount++;
	}

	await stream.close();

	writeSandboxOutput(
		[
			`Stream created: ${streamName}`,
			`Stream ID: ${stream.id}`,
			'',
			'Content written:',
			fullText,
			'',
			`[Wrote ${chunkCount} text chunks]`,
			'',
			'Stream closed',
			'',
			'Public URL (shareable):',
			`  ${stream.url}`,
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
