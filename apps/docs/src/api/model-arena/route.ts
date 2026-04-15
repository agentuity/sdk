/**
 * Model Arena Route - Multi-provider story generation with LLM-as-judge evaluation.
 *
 * GET /        - Returns metadata about the arena configuration
 * GET /stream  - Streams stories as each model finishes, then the judge verdict
 */
import { stream, type Env } from '@agentuity/runtime';
import { Hono } from 'hono';
import {
	generateStory,
	judgeStories,
	MODELS,
	type GenerationConfig,
} from '../../agent/model-arena/lib';
import {
	PROVIDER_DISPLAY_NAMES,
	type Judgment,
	type ModelResult,
	type Tone,
} from '../../agent/model-arena/types';

const FIXED_PROMPT = 'A robot discovers it can dream';
const FIXED_TONE: Tone = 'sci-fi';
const HEARTBEAT_MS = 3000;

export interface ModelArenaRouterDeps {
	generateStory: (config: GenerationConfig, prompt: string, tone: Tone) => Promise<ModelResult>;
	judgeStories: (
		results: ReadonlyArray<ModelResult>,
		tone: Tone,
		prompt: string
	) => Promise<Judgment>;
	models: ReadonlyArray<GenerationConfig>;
	heartbeatMs?: number;
}

function getDefaultRouterDeps(): ModelArenaRouterDeps {
	return {
		generateStory,
		judgeStories,
		models: MODELS,
		heartbeatMs: HEARTBEAT_MS,
	};
}

function toLine(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify({ event, data })}\n`);
}

export function createModelArenaRouter(
	deps: ModelArenaRouterDeps = getDefaultRouterDeps()
): Hono<Env> {
	return new Hono<Env>()
		.get('/', (c) => {
			return c.json({
				name: 'Model Arena',
				description:
					'Compare short stories from OpenAI and Anthropic with LLM-as-judge evaluation',
				prompt: FIXED_PROMPT,
				tone: FIXED_TONE,
				competitors: deps.models.map((model) => ({
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
						const write = (event: string, data: unknown) => {
							controller.enqueue(toLine(event, data));
						};

						const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
						const heartbeat =
							heartbeatMs > 0
								? setInterval(() => {
										try {
											// Keep Bun's request idle timeout from closing slower runs.
											write('heartbeat', Date.now());
										} catch {
											clearInterval(heartbeat);
										}
									}, heartbeatMs)
								: undefined;

						try {
							write('start', {
								prompt: FIXED_PROMPT,
								tone: FIXED_TONE,
								providers: deps.models.map((model) => ({
									provider: model.provider,
									displayName: PROVIDER_DISPLAY_NAMES[model.provider],
									model: model.model,
								})),
							});

							const settled = await Promise.all(
								deps.models.map(async (config) => {
									try {
										const result = await deps.generateStory(
											config,
											FIXED_PROMPT,
											FIXED_TONE
										);
										write('story', {
											...result,
											displayName: PROVIDER_DISPLAY_NAMES[result.provider],
										});
										return result;
									} catch (error) {
										const message =
											error instanceof Error ? error.message : 'Unknown error';
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
							if (results.length !== deps.models.length) {
								write('error', {
									error: 'One or more models failed before judging could complete.',
								});
								return;
							}

							write('judging', { count: results.length });

							const judgment = await deps.judgeStories(results, FIXED_TONE, FIXED_PROMPT);
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
							if (heartbeat) {
								clearInterval(heartbeat);
							}
							controller.close();
						}
					},
				});
			})
		);
}

const router = createModelArenaRouter();

export default router;
