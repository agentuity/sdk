/**
 * Gateway Route - Compares responses from multiple LLM providers using AI Gateway.
 *
 * GET /         - Returns gateway configuration and fixed prompt
 * STREAM /compare - Streams LLM response for selected model
 */
import { stream } from '../http';
import type { ApiEnv } from '../context';
import { generateText, streamText } from 'ai';
import { getModel } from '../../lib/models';
import { Hono } from 'hono';
import { modelFromRequestBody } from '../request-body';

const FIXED_PROMPT = 'What is backpropagation and why does it matter for AI?';
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

const router = new Hono<ApiEnv>()

	.get('/', (c) => {
		return c.json({
			name: 'AI Gateway Demo',
			description: 'Compare responses from multiple LLM providers',
			endpoint: '/api/ai-gateway/compare',
			note: 'AI Gateway routes requests to different providers using a single SDK key',
			prompt: FIXED_PROMPT,
		});
	})

	.post(
		'/compare',
		stream(async (c) => {
			try {
				const body: unknown = await c.req.json();
				const model = modelFromRequestBody(body, DEFAULT_MODEL);

				c.var.logger?.info('Gateway comparison started', {
					prompt: FIXED_PROMPT.slice(0, 50),
					model,
				});

				if (model.startsWith('googleai/') || model.startsWith('gemini-')) {
					// Gemini gateway streaming currently returns no chunks. Use one-shot
					// generation here so the demo stays usable until that path is fixed.
					const { text } = await generateText({
						model: getModel(model),
						prompt: FIXED_PROMPT,
					});

					return new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode(text));
							controller.close();
						},
					});
				}

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
