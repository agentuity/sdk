/**
 * SSE Stream Route - Real-time token streaming demonstration.
 *
 * GET /       - Returns metadata about the stream configuration
 * SSE /stream - Streams AI response tokens in real-time (query param: model)
 */
import { createRouter, sse } from '@agentuity/runtime';
import { streamText } from 'ai';
import { getModel } from '../../lib/models';

const router = createRouter();

// Fixed prompt for the demo - users choose the model
const FIXED_PROMPT = 'What are AI agents and how do they work?';

router.get('/', (c) => {
	return c.json({
		name: 'SSE Stream Demo',
		description: 'Real-time token streaming via Server-Sent Events',
		prompt: FIXED_PROMPT,
	});
});

router.get(
	'/stream',
	sse(async (c, stream) => {
		const model = c.req.query('model') ?? 'gpt-5-nano';

		c.var.logger?.info('SSE stream started', {
			prompt: FIXED_PROMPT.slice(0, 50),
			model,
		});

		try {
			let chunkCount = 0;

			const { textStream, usage } = streamText({
				model: getModel(model),
				prompt: FIXED_PROMPT,
			});

			for await (const chunk of textStream) {
				await stream.writeSSE({
					event: 'token',
					data: chunk,
					id: String(chunkCount++),
				});
			}

			const usageData = await usage;
			const totalTokens = usageData?.totalTokens ?? 0;

			await stream.writeSSE({
				event: 'done',
				data: JSON.stringify({ totalTokens }),
				id: String(chunkCount),
			});

			c.var.logger?.info('SSE stream completed', { totalTokens });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			c.var.logger?.error('SSE stream error', { error: message });

			await stream.writeSSE({
				event: 'error',
				data: message,
				id: 'error',
			});
		}
	})
);

export default router;
