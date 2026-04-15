/**
 * Standalone run script for Durable Streams demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/AGENTS.md for architecture details.
 *
 * Demonstrates: Creating a durable stream with LLM-generated content
 * Streams AI-generated text into a durable stream and shows the shareable URL.
 * Streams expire after 30 days by default unless you set ttl: null or 0.
 *
 * Usage: bun run src/run/durable-stream.ts
 */
import { createAgentContext } from '@agentuity/runtime';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

const ctx = createAgentContext();

try {
	ctx.logger.info('Creating durable stream with LLM content');

	// Create a durable stream
	const streamName = `demo-${Date.now()}`;
	const stream = await ctx.stream.create(streamName, {
		contentType: 'text/plain',
		metadata: { created: new Date().toISOString() },
	});

	console.log('---OUTPUT---');
	console.log(`Stream created: ${streamName}`);
	console.log(`Stream ID: ${stream.id}`);
	console.log('');

	// Generate content with LLM and write to stream
	const { textStream } = streamText({
		model: openai('gpt-5-nano'),
		prompt: 'Write a 3-paragraph summary of what Agentuity is.',
	});

	let fullText = '';
	let chunkCount = 0;
	for await (const chunk of textStream) {
		await stream.write(chunk);
		fullText += chunk;
		chunkCount++;
	}

	// Close the stream
	await stream.close();

	console.log('Content written:');
	console.log(fullText);
	console.log('');
	console.log(`[Wrote ${chunkCount} text chunks]`);
	console.log('');
	console.log('Stream closed');
	console.log('');

	// The URL remains available until the stream expires
	console.log('Public URL (shareable):');
	console.log(`  ${stream.url}`);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
