import { describe, expect, test } from 'bun:test';
import type { Env } from '@agentuity/runtime';
import { Hono } from 'hono';
import { MODELS } from '../src/agent/model-arena/lib';
import { createModelArenaRouter } from '../src/api/model-arena/route';
import type { Judgment, ModelResult } from '../src/agent/model-arena/types';

interface StreamEvent {
	event: string;
	data: unknown;
}

async function readEvents(response: Response): Promise<StreamEvent[]> {
	expect(response.ok).toBe(true);
	expect(response.body).toBeDefined();

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('Expected response body');
	}

	const decoder = new TextDecoder();
	let buffer = '';
	const events: StreamEvent[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			events.push(JSON.parse(line) as StreamEvent);
		}
	}

	return events;
}

function createTestApp(): Hono<Env> {
	const app = new Hono<Env>();

	app.use('*', async (c, next) => {
		c.set('logger', {
			info() {},
			error() {},
			warn() {},
		});
		await next();
	});

	return app;
}

describe('model arena stream route', () => {
	test('streams stories as they complete, then the judge verdict', async () => {
		const app = createTestApp();

		app.route(
			'/api/model-arena',
			createModelArenaRouter({
				generateStory: async (config): Promise<ModelResult> => ({
					provider: config.provider,
					model: config.provider === 'openai' ? 'gpt-5.4-nano' : 'claude-haiku-4-6',
					story: `${config.provider} story`,
					generationMs: config.provider === 'openai' ? 1200 : 800,
					tokens: config.provider === 'openai' ? 111 : 222,
				}),
				judgeStories: async (): Promise<Judgment> => ({
					winner: 'openai',
					reasoning: 'Cleaner structure',
					scores: {
						creativity: [
							{ provider: 'openai', score: 0.9, reason: 'Fresh' },
							{ provider: 'anthropic', score: 0.8, reason: 'Good' },
						],
						engagement: [
							{ provider: 'openai', score: 0.9, reason: 'Sharp' },
							{ provider: 'anthropic', score: 0.8, reason: 'Solid' },
						],
					},
					checks: {
						toneMatch: [
							{ provider: 'openai', passed: true, reason: 'Yes' },
							{ provider: 'anthropic', passed: true, reason: 'Yes' },
						],
						wordCount: [
							{ provider: 'openai', passed: true, reason: 'Under' },
							{ provider: 'anthropic', passed: true, reason: 'Under' },
						],
					},
				}),
				models: MODELS,
				heartbeatMs: 0,
			})
		);

		const response = await app.request('/api/model-arena/stream');
		const events = await readEvents(response);

		expect(events.map((event) => event.event)).toEqual([
			'start',
			'story',
			'story',
			'judging',
			'complete',
		]);

		const complete = events.at(-1);
		expect(complete?.event).toBe('complete');
		expect(complete?.data).toMatchObject({
			judgment: {
				winner: 'openai',
				winnerDisplayName: 'OpenAI',
			},
		});
	});

	test('emits provider error and terminal error when a model fails', async () => {
		const app = createTestApp();

		app.route(
			'/api/model-arena',
			createModelArenaRouter({
				generateStory: async (config): Promise<ModelResult> => {
					if (config.provider === 'anthropic') {
						throw new Error('Anthropic failed');
					}

					return {
						provider: 'openai',
						model: 'gpt-5.4-nano',
						story: 'openai story',
						generationMs: 1200,
						tokens: 111,
					};
				},
				judgeStories: async (): Promise<Judgment> => {
					throw new Error('Judge should not run');
				},
				models: MODELS,
				heartbeatMs: 0,
			})
		);

		const response = await app.request('/api/model-arena/stream');
		const events = await readEvents(response);

		expect(events.map((event) => event.event)).toEqual([
			'start',
			'story',
			'provider-error',
			'error',
		]);

		expect(events[2]?.data).toMatchObject({
			provider: 'anthropic',
			error: 'Anthropic failed',
		});
		expect(events[3]?.data).toMatchObject({
			error: 'One or more models failed before judging could complete.',
		});
	});
});
