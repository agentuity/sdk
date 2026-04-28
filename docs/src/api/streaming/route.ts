/**
 * Streaming Route - Raw text streaming demonstrations.
 *
 * GET /         - Returns route info and demo prompt
 * POST /stream  - Streams AI response using stream() middleware
 */
import { stream, type Env } from '@agentuity/runtime';
import { streamText } from 'ai';
import { getModel } from '../../lib/models';
import { Hono } from 'hono';

// Fixed prompt for the demo - users choose the model
const FIXED_PROMPT = 'What are AI agents and how do they work?';

const router = new Hono<Env>()

	.get('/', (c) => {
		return c.json({
			name: 'Streaming Demo',
			description: 'Raw text streaming using stream() middleware - simpler than SSE',
			prompt: FIXED_PROMPT,
		});
	})

	.post(
		'/stream',
		stream(async (c) => {
			try {
				const body = await c.req.json();
				const model =
					typeof (body as { model?: unknown }).model === 'string'
						? (body as { model: string }).model
						: 'gpt-5.4-mini';

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
