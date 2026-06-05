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
import { AIGatewayClient } from '@agentuity/aigateway';

const ctx = getDemoContext();
const MODEL = 'openai/gpt-5.4-mini';
const PROMPT =
	'Write two short sentences that explain why durable streams are useful for generated reports.';

try {
	ctx.logger.info('Creating durable stream with LLM content');

	// Name streams by purpose plus run id so demo runs do not collide.
	const streamName = `demo-${Date.now()}`;
	const stream = await ctx.stream.create(streamName, {
		contentType: 'text/plain',
		metadata: { created: new Date().toISOString(), model: MODEL },
	});

	const gateway = new AIGatewayClient();
	const result = await gateway.completeText({
		model: MODEL,
		messages: [{ role: 'user', content: PROMPT }],
	});

	await stream.write(result.text);
	await stream.close();

	writeSandboxOutput(
		[
			`Stream created: ${streamName}`,
			`Stream ID: ${stream.id}`,
			'',
			'Content written:',
			result.text,
			'',
			`Bytes written: ${stream.bytesWritten}`,
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
