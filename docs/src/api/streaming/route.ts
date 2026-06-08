/**
 * Streaming Route - Raw text streaming demonstrations.
 *
 * GET /         - Returns route info and demo prompt
 * POST /stream  - Streams AI response using stream() middleware
 */
import { stream } from '../http';
import type { ApiEnv } from '../context';
import { streamAIGatewayText } from '../../lib/ai-gateway-stream';
import { Hono } from 'hono';
import { modelFromRequestBody } from '../request-body';

// Fixed prompt for the demo - users choose the model
const FIXED_PROMPT = 'What are AI agents and how do they work?';
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

const router = new Hono<ApiEnv>()

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
				const body: unknown = await c.req.json();
				const model = modelFromRequestBody(body, DEFAULT_MODEL);

				c.var.logger?.info('Raw stream started', {
					prompt: FIXED_PROMPT.slice(0, 50),
					model,
				});

				const { textStream } = await streamAIGatewayText({
					model,
					messages: [{ role: 'user', content: FIXED_PROMPT }],
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
