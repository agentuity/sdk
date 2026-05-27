/**
 * Standalone run script for Durable Streams demo
 *
 * Writes generated text into a durable stream and returns the shareable URL.
 * The stream keeps the completed output available after the request ends.
 *
 * Usage: bun run src/run/durable-stream.ts
 */
import { getDemoContext } from '../api/context';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

const ctx = getDemoContext();

try {
	ctx.logger.info('Creating durable stream with LLM content');

	// Name streams by purpose plus run id so demo runs do not collide.
	const streamName = `demo-${Date.now()}`;
	const stream = await ctx.stream.create(streamName, {
		contentType: 'text/plain',
		metadata: { created: new Date().toISOString() },
	});

	console.log('---OUTPUT---');
	console.log(`Stream created: ${streamName}`);
	console.log(`Stream ID: ${stream.id}`);
	console.log('');

	// The route version would stream chunks as they arrive; the sandbox buffers stdout.
	const { textStream } = streamText({
		model: openai('gpt-5.4-nano'),
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

	console.log('Content written:');
	console.log(fullText);
	console.log('');
	console.log(`[Wrote ${chunkCount} text chunks]`);
	console.log('');
	console.log('Stream closed');
	console.log('');

	console.log('Public URL (shareable):');
	console.log(`  ${stream.url}`);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
	process.exitCode = 1;
}
