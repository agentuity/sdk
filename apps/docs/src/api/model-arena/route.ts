/**
 * Model Arena Route - Multi-provider story generation with LLM-as-judge evaluation.
 *
 * GET /        - Returns metadata about the arena configuration
 * GET /stream  - Streams stories as each model finishes, then the judge verdict
 */
import { stream, type Env } from '@agentuity/runtime';
import { Hono } from 'hono';
import { generateStory, judgeStories, MODELS } from '../../agent/model-arena/lib';
import { PROVIDER_DISPLAY_NAMES, type ModelResult, type Tone } from '../../agent/model-arena/types';

const FIXED_PROMPT = 'A robot discovers it can dream';
const FIXED_TONE: Tone = 'sci-fi';
const HEARTBEAT_MS = 3000;

function toLine(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify({ event, data })}\n`);
}

const router = new Hono<Env>()
	.get('/', (c) => {
		return c.json({
			name: 'Model Arena',
			description:
				'Compare short stories from OpenAI and Anthropic with LLM-as-judge evaluation',
			prompt: FIXED_PROMPT,
			tone: FIXED_TONE,
			competitors: MODELS.map((model) => ({
				provider: model.provider,
				displayName: PROVIDER_DISPLAY_NAMES[model.provider],
				model: model.model,
			})),
			mode: 'stream',
		});
	})
	.get(
		'/stream',
		stream(async (c) => {
			return new ReadableStream<Uint8Array>({
				async start(controller) {
					const abortSignal = c.req.raw.signal;
					let heartbeat: ReturnType<typeof setInterval> | undefined;

					const stopHeartbeat = () => {
						if (heartbeat) {
							clearInterval(heartbeat);
							heartbeat = undefined;
						}
					};

					const write = (event: string, data: unknown) => {
						if (abortSignal.aborted) return;
						controller.enqueue(toLine(event, data));
					};

					abortSignal.addEventListener('abort', stopHeartbeat, { once: true });

					heartbeat = setInterval(() => {
						try {
							// Keep Bun's request idle timeout from closing slower runs.
							write('heartbeat', Date.now());
						} catch {
							stopHeartbeat();
						}
					}, HEARTBEAT_MS);

					try {
						write('start', {
							prompt: FIXED_PROMPT,
							tone: FIXED_TONE,
							providers: MODELS.map((model) => ({
								provider: model.provider,
								displayName: PROVIDER_DISPLAY_NAMES[model.provider],
								model: model.model,
							})),
						});

						const settled = await Promise.all(
							MODELS.map(async (config) => {
								try {
									const result = await generateStory(
										config,
										FIXED_PROMPT,
										FIXED_TONE,
										abortSignal
									);
									write('story', {
										...result,
										displayName: PROVIDER_DISPLAY_NAMES[result.provider],
									});
									return result;
								} catch (error) {
									const message = error instanceof Error ? error.message : 'Unknown error';
									write('provider-error', {
										provider: config.provider,
										displayName: PROVIDER_DISPLAY_NAMES[config.provider],
										error: message,
									});
									return null;
								}
							})
						);

						const results = settled.filter(
							(result): result is ModelResult => result !== null
						);
						if (results.length !== MODELS.length) {
							write('error', {
								error: 'One or more models failed before judging could complete.',
							});
							return;
						}

						write('judging', { count: results.length });

						const judgment = await judgeStories(
							results,
							FIXED_TONE,
							FIXED_PROMPT,
							abortSignal
						);
						write('complete', {
							judgment: {
								...judgment,
								winnerDisplayName: PROVIDER_DISPLAY_NAMES[judgment.winner],
							},
						});
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Unknown error';
						c.var.logger?.error('Model Arena stream failed', { error: message });
						write('error', { error: `Judge failed: ${message}` });
					} finally {
						abortSignal.removeEventListener('abort', stopHeartbeat);
						stopHeartbeat();
						try {
							controller.close();
						} catch {
							// Client already disconnected.
						}
					}
				},
			});
		})
	);

export default router;
