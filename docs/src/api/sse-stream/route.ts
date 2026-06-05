/**
 * SSE Stream Route - Real-time text streaming demonstration
 *
 * GET /       - Returns metadata about the stream configuration
 * SSE /stream - Streams AI response chunks in real-time (query param: model)
 */
import { sse } from '../http';
import type { ApiEnv } from '../context';
import { streamAIGatewayText, totalTokensFromAIGatewayMetadata } from '../../lib/ai-gateway-stream';
import { Hono } from 'hono';

// Fixed prompt for the demo - users choose the model
const FIXED_PROMPT = 'What are AI agents and how do they work?';
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

const router = new Hono<ApiEnv>()

	.get('/', (c) => {
		return c.json({
			name: 'SSE Stream Demo',
			description: 'Real-time text streaming via Server-Sent Events',
			prompt: FIXED_PROMPT,
		});
	})

	.get(
		'/stream',
		sse(async (c, stream) => {
			const model = c.req.query('model') ?? DEFAULT_MODEL;

			c.var.logger?.info('SSE stream started', {
				prompt: FIXED_PROMPT.slice(0, 50),
				model,
			});

			try {
				let chunkCount = 0;

				const { textStream, metadata } = await streamAIGatewayText({
					model,
					messages: [{ role: 'user', content: FIXED_PROMPT }],
				});

				for await (const chunk of textStream) {
					await stream.writeSSE({
						event: 'chunk',
						data: chunk,
						id: String(chunkCount++),
					});
				}

				const totalTokens = totalTokensFromAIGatewayMetadata(await metadata);

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
