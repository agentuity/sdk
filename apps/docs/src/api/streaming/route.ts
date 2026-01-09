/**
 * Streaming Route - Raw text streaming demonstrations.
 *
 * GET /         - Returns route info and demo prompt
 * POST /stream  - Streams AI response using stream() middleware
 */
import { createRouter, stream } from '@agentuity/runtime';
import { streamText } from 'ai';
import { getModel } from '../../lib/models';

const router = createRouter();

// Fixed prompt for the demo - users choose the model
const FIXED_PROMPT = 'What are AI agents and how do they work?';

router.get('/', (c) => {
	return c.json({
		name: 'Streaming Demo',
		description: 'Raw text streaming using stream() middleware - simpler than SSE',
		prompt: FIXED_PROMPT,
	});
});

router.post(
	'/stream',
	stream(async (c) => {
		try {
			const body = await c.req.json();
			const { model = 'gpt-5-nano' } = body as { model?: string };

			c.var.logger?.info('Raw stream started', {
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
			c.var.logger?.error('Stream error', { error: message });

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
