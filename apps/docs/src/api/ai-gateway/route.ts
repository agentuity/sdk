/**
 * Gateway Route - Compares responses from multiple LLM providers using AI Gateway.
 *
 * GET /         - Returns gateway configuration and fixed prompt
 * STREAM /compare - Streams LLM response for selected model
 */
import { createRouter, stream } from '@agentuity/runtime';
import { streamText } from 'ai';
import { getModel } from '../../lib/models';

const router = createRouter();

const FIXED_PROMPT = 'What is backpropagation and why does it matter for AI?';

router.get('/', (c) => {
	return c.json({
		name: 'AI Gateway Demo',
		description: 'Compare responses from multiple LLM providers',
		endpoint: '/api/gateway/compare',
		note: 'AI Gateway routes requests to different providers using a single SDK key',
		prompt: FIXED_PROMPT,
	});
});

router.post(
	'/compare',
	stream(async (c) => {
		try {
			const body = await c.req.json();
			const { model = 'gpt-5-nano' } = body as { model?: string };

			c.var.logger?.info('Gateway comparison started', {
				prompt: FIXED_PROMPT.slice(0, 50),
				model,
			});

			const { textStream } = streamText({
				model: getModel(model),
				prompt: FIXED_PROMPT,
			});

			return textStream;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			c.var.logger?.error('Gateway comparison error', { error: message });

			return new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(`Error: ${message}`));
					controller.close();
				},
			});
		}
	})
);

export default router;
