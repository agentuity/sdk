/**
 * Standalone run script for Durable Streams demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Creating a durable stream with LLM-generated content
 * Writes AI-generated text into a durable stream and shows the public URL.
 * Note: Sandbox buffers stdout, so output appears all at once.
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

	// Generate content with LLM and write to stream (content lives at the URL)
	console.log('Writing LLM summary to stream...');
	try {
		const { textStream } = streamText({
			model: openai('gpt-5-nano'),
			prompt: 'Write a 3-paragraph summary of what Agentuity is.',
		});

		let tokenCount = 0;
		for await (const chunk of textStream) {
			await stream.write(chunk);
			tokenCount++;
		}

		if (tokenCount === 0) {
			throw new Error('LLM returned no content');
		}

		await stream.close();
		console.log(`Done — ${tokenCount} tokens streamed`);
	} catch {
		// Fallback: write static content so the URL still has something
		const fallback =
			'Agentuity is a full-stack platform for building, deploying, and operating AI agents.';
		await stream.write(fallback);
		await stream.close();
		console.log('Done — wrote fallback content (LLM unavailable)');
	}

	console.log('');
	console.log('Public URL (shareable):');
	console.log(`  ${stream.url}`);
	console.log('');
	console.log('Open the URL to read the generated content.');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
