import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'bun:test';
import { createMinimalLogger } from '@agentuity/core';
import { aigatewayCommand } from '../../../src/cmd/cloud/aigateway';
import { combinePromptInput, completeSubcommand } from '../../../src/cmd/cloud/aigateway/complete';
import { modelsSubcommand } from '../../../src/cmd/cloud/aigateway/models';
import { requestSubcommand } from '../../../src/cmd/cloud/aigateway/request';
import { getCompletionText } from '../../../src/cmd/cloud/aigateway/util';

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
	server?.stop(true);
	server = undefined;
	delete process.env.AGENTUITY_AIGATEWAY_URL;
	delete process.env.AGENTUITY_AIGATEWAY_MODEL;
});

function baseCtx(url: string) {
	delete process.env.AGENTUITY_AIGATEWAY_URL;
	return {
		auth: { apiKey: 'sdk_test' },
		logger: createMinimalLogger(),
		region: 'usc',
		project: { orgId: 'org_test' },
		config: { overrides: { aigateway_url: url }, preferences: {} },
		options: { json: true },
	};
}

function completionModelCatalog(api = 'openai-responses') {
	return Response.json({
		success: true,
		data: {
			openai: [{ id: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', api }],
		},
	});
}

describe('cloud aigateway command', () => {
	test('registers expected subcommands', () => {
		expect(aigatewayCommand.name).toBe('aigateway');
		expect(aigatewayCommand.aliases).toContain('ai-gateway');
		expect(aigatewayCommand.subcommands?.map((cmd) => cmd.name)).toEqual([
			'models',
			'complete',
			'embeddings',
			'image',
			'speech',
			'transcription',
			'video',
			'request',
		]);
		expect(aigatewayCommand.requires?.auth).toBeUndefined();
	});

	test('models subcommand is public', () => {
		expect(modelsSubcommand.requires?.auth).toBeUndefined();
		expect(modelsSubcommand.requires?.region).toBeUndefined();
		expect(modelsSubcommand.idempotent).toBe(true);
		expect(modelsSubcommand.schema?.response).toBeDefined();
	});

	test('complete subcommand exposes prompt, model, stream, and convenience schemas', () => {
		const shape = completeSubcommand.schema?.options?.def.shape;
		expect(completeSubcommand.requires?.auth).toBe(true);
		expect(completeSubcommand.requires?.region).toBeUndefined();
		expect(completeSubcommand.optional?.region).toBe(true);
		expect(completeSubcommand.tags).toContain('uses-stdin');
		expect(shape?.model).toBeDefined();
		expect(shape?.prompt).toBeDefined();
		expect(shape?.stream).toBeDefined();
		expect(shape?.maxTokens).toBeDefined();
		expect(shape?.file).toBeDefined();
		expect(shape?.systemFile).toBeDefined();
		expect(shape?.save).toBeDefined();
		expect(shape?.format).toBeDefined();
		expect(shape?.stdinMode).toBeDefined();
		expect(shape?.cost).toBeDefined();
	});

	test('request subcommand exposes upstream path, body, and stream schemas', () => {
		const shape = requestSubcommand.schema?.options?.def.shape;
		expect(requestSubcommand.requires?.auth).toBe(true);
		expect(requestSubcommand.optional?.region).toBe(true);
		expect(requestSubcommand.tags).toContain('uses-stdin');
		expect(requestSubcommand.schema?.args?.def.shape.path).toBeDefined();
		expect(shape?.method).toBeDefined();
		expect(shape?.body).toBeDefined();
		expect(shape?.file).toBeDefined();
		expect(shape?.header).toBeDefined();
		expect(shape?.stream).toBeDefined();
	});

	test('extracts assistant text from OpenAI-compatible completion responses', () => {
		expect(
			getCompletionText({
				choices: [{ message: { role: 'assistant', content: 'hello' } }],
			})
		).toBe('hello');
		expect(getCompletionText({ choices: [{ text: 'fallback' }] })).toBe('fallback');
		expect(
			getCompletionText({
				content: [{ type: 'text', text: 'anthropic text' }],
			})
		).toBe('anthropic text');
	});

	test('combines explicit prompt and piped stdin by default', () => {
		expect(
			combinePromptInput({
				explicitPrompt: 'Summarize these records.',
				stdinPrompt: '[{"name":"Ada"}]',
			})
		).toBe('Summarize these records.\n\n[{"name":"Ada"}]');
		expect(
			combinePromptInput({
				explicitPrompt: 'Ignore this',
				stdinPrompt: '[{"name":"Ada"}]',
				stdinMode: 'replace',
			})
		).toBe('[{"name":"Ada"}]');
	});

	test('models handler calls the configured gateway and returns flattened rows', async () => {
		const requests: Request[] = [];
		server = Bun.serve({
			port: 0,
			fetch(request) {
				requests.push(request);
				return Response.json({
					success: true,
					data: {
						openai: [
							{
								id: 'gpt-4.1-mini',
								name: 'GPT 4.1 Mini',
								api: 'openai-responses',
								reasoning: false,
								input_modalities: ['text'],
								output_modalities: ['text'],
								pricing: {
									input: 0.4,
									output: 1.6,
									unit: 'per_million_tokens',
									currency: 'USD',
								},
							},
							{
								id: 'gpt-4.1-vision',
								name: 'GPT 4.1 Vision',
								api: 'openai-responses',
								reasoning: false,
								input_modalities: ['text', 'image'],
								output_modalities: ['text'],
								pricing: {
									input: 2,
									output: 8,
									unit: 'per_million_tokens',
									currency: 'USD',
								},
							},
						],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { input: 'image' },
			args: {},
		} as never);

		expect(requests).toHaveLength(1);
		expect(requests[0]!.method).toBe('GET');
		expect(requests[0]!.headers.get('authorization')).toBeNull();
		expect(requests[0]!.headers.get('x-agentuity-orgid')).toBeNull();
		expect(result.count).toBe(1);
		expect(result.models[0]?.id).toBe('gpt-4.1-vision');
		expect(result.models[0]?.inputModalities).toEqual(['text', 'image']);
		expect(result.models[0]?.outputModalities).toEqual(['text']);
		expect(result.models[0]?.pricingUnit).toBe('per_million_tokens');
	});

	test('models handler does not require auth, org, project, or region', async () => {
		const requests: Request[] = [];
		server = Bun.serve({
			port: 0,
			fetch(request) {
				requests.push(request);
				return Response.json({
					success: true,
					data: {
						openai: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			logger: createMinimalLogger(),
			config: {
				overrides: { aigateway_url: `http://127.0.0.1:${server.port}` },
				preferences: {},
			},
			options: { json: true },
			opts: {},
			args: {},
		} as never);

		expect(requests).toHaveLength(1);
		expect(requests[0]!.headers.get('authorization')).toBeNull();
		expect(requests[0]!.headers.get('x-agentuity-orgid')).toBeNull();
		expect(result.count).toBe(1);
	});

	test('models handler filters by provider', async () => {
		server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					success: true,
					data: {
						openai: [
							{
								id: 'openai/gpt-4.1-mini',
								name: 'GPT 4.1 Mini',
								api: 'openai-responses',
							},
						],
						anthropic: [
							{
								id: 'anthropic/claude-sonnet-4-5-20250929',
								name: 'Claude Sonnet 4.5',
								api: 'anthropic-messages',
							},
						],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { provider: 'anthropic' },
			args: {},
		} as never);

		expect(result.count).toBe(1);
		expect(result.models[0]?.provider).toBe('anthropic');
		expect(result.models[0]?.id).toBe('anthropic/claude-sonnet-4-5-20250929');
	});

	test('models handler returns fully-qualified recommendations', async () => {
		server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					success: true,
					data: {
						openai: [
							{
								id: 'gpt-4.1-mini',
								name: 'GPT 4.1 Mini',
								recommended: true,
								default_for: ['text'],
								rank: 1,
							},
						],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { recommended: true },
			args: {},
		} as never);

		expect(result.recommendations).toEqual([
			{ use: 'text', model: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini', rank: 1 },
		]);
	});

	test('models handler returns a single model by full model id', async () => {
		server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					success: true,
					data: {
						anthropic: [
							{
								id: 'claude-opus-4-7',
								name: 'Claude Opus 4.7',
								api: 'anthropic-messages',
							},
							{
								id: 'claude-sonnet-4-5-20250929',
								name: 'Claude Sonnet 4.5',
								api: 'anthropic-messages',
							},
						],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { model: 'anthropic/claude-opus-4-7' },
			args: {},
		} as never);

		expect(result.count).toBe(1);
		expect(result.model?.provider).toBe('anthropic');
		expect(result.model?.id).toBe('claude-opus-4-7');
	});

	test('models handler returns a single model by provider and name', async () => {
		server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					success: true,
					data: {
						openai: [{ id: 'openai/gpt-4.1-mini', name: 'GPT 4.1 Mini' }],
						anthropic: [{ id: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7' }],
					},
				});
			},
		});

		const result = await modelsSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { provider: 'anthropic', name: 'Claude Opus 4.7' },
			args: {},
		} as never);

		expect(result.count).toBe(1);
		expect(result.model?.id).toBe('anthropic/claude-opus-4-7');
	});

	test('models subcommand exposes compact list options', () => {
		const shape = modelsSubcommand.schema?.options?.def.shape;
		expect(shape?.model).toBeDefined();
		expect(shape?.name).toBeDefined();
		expect(shape?.input).toBeDefined();
		expect(shape?.output).toBeDefined();
		expect(shape?.inputModality).toBeDefined();
		expect(shape?.outputModality).toBeDefined();
		expect(shape?.ids).toBeDefined();
		expect(shape?.simple).toBeDefined();
		expect(shape?.recommended).toBeDefined();
	});

	test('request handler posts upstream-shaped JSON to a custom path', async () => {
		let body: unknown;
		let path: string | undefined;
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				path = new URL(request.url).pathname;
				body = await request.json();
				return Response.json(
					{ data: [{ embedding: [0.1, 0.2] }] },
					{
						headers: {
							'x-gateway-cost': '0.000012',
							'x-gateway-billing-unit': 'per_million_tokens',
							'x-gateway-input-quantity': '3.000000',
						},
					}
				);
			},
		});

		const result = await requestSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: {
				body: '{"model":"openai/text-embedding-3-small","input":"hello"}',
			},
			args: { path: '/v1/embeddings' },
		} as never);

		expect(path).toBe('/v1/embeddings');
		expect(body).toEqual({
			model: 'openai/text-embedding-3-small',
			input: 'hello',
		});
		expect(result.data).toEqual({ data: [{ embedding: [0.1, 0.2] }] });
		expect(result.metadata).toEqual({
			headers: {
				'x-gateway-cost': '0.000012',
				'x-gateway-billing-unit': 'per_million_tokens',
				'x-gateway-input-quantity': '3.000000',
			},
			cost: {
				total: 0.000012,
				unit: 'per_million_tokens',
				inputQuantity: 3,
				outputQuantity: undefined,
				promptTokens: undefined,
				completionTokens: undefined,
				reasoningTokens: undefined,
			},
		});
	});

	test('complete handler posts an OpenAI-compatible chat completion request', async () => {
		let body: unknown;
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return Response.json(
					{
						id: 'chatcmpl_test',
						model: 'gpt-4.1-mini',
						choices: [{ message: { role: 'assistant', content: 'done' } }],
					},
					{
						headers: {
							'x-gateway-cost': '0.000456',
							'x-gateway-prompt-tokens': '12',
							'x-gateway-completion-tokens': '6',
						},
					}
				);
			},
		});

		const result = await completeSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { model: 'gpt-4.1-mini', temperature: 0.2, maxTokens: 128, refreshModels: true },
			args: { prompt: 'Say done' },
		} as never);

		expect(body).toEqual({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say done' }],
			temperature: 0.2,
			max_tokens: 128,
		});
		expect(result.text).toBe('done');
		expect(result.cost).toEqual({
			total: 0.000456,
			promptTokens: 12,
			completionTokens: 6,
		});
	});

	test('complete handler accepts prompt from --prompt option', async () => {
		let body: unknown;
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return Response.json({
					choices: [{ message: { role: 'assistant', content: 'from option' } }],
				});
			},
		});

		const result = await completeSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { model: 'gpt-4.1-mini', prompt: 'Prompt from option', refreshModels: true },
			args: {},
		} as never);

		expect(body).toEqual({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Prompt from option' }],
		});
		expect(result.text).toBe('from option');
	});

	test('complete handler accepts prompt from --file option', async () => {
		let body: unknown;
		const dir = await mkdtemp(join(tmpdir(), 'agentuity-aigateway-'));
		const promptFile = join(dir, 'prompt.txt');
		await Bun.write(promptFile, 'Prompt from file\n');
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return Response.json({
					choices: [{ message: { role: 'assistant', content: 'from file' } }],
				});
			},
		});

		try {
			const result = await completeSubcommand.handler({
				...baseCtx(`http://127.0.0.1:${server.port}`),
				opts: { model: 'gpt-4.1-mini', file: promptFile, refreshModels: true },
				args: {},
			} as never);

			expect(body).toEqual({
				model: 'gpt-4.1-mini',
				messages: [{ role: 'user', content: 'Prompt from file' }],
			});
			expect(result.text).toBe('from file');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test('complete handler uses messages payload for openai-compatible completions models', async () => {
		let body: unknown;
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return Response.json({
						success: true,
						data: {
							poolside: [
								{
									id: 'poolside/laguna-xs.2:free',
									name: 'Laguna XS',
									api: 'openai-completions',
								},
							],
						},
					});
				}
				body = await request.json();
				return Response.json({
					choices: [{ message: { role: 'assistant', content: 'compatible done' } }],
				});
			},
		});

		const result = await completeSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: {
				model: 'poolside/laguna-xs.2:free',
				system: 'Be concise.',
				refreshModels: true,
			},
			args: { prompt: 'Say done' },
		} as never);

		expect(body).toEqual({
			model: 'poolside/laguna-xs.2:free',
			messages: [
				{ role: 'system', content: 'Be concise.' },
				{ role: 'user', content: 'Say done' },
			],
		});
		expect(result.text).toBe('compatible done');
	});

	test('complete handler uses AGENTUITY_AIGATEWAY_MODEL when model is omitted', async () => {
		let body: unknown;
		process.env.AGENTUITY_AIGATEWAY_MODEL = 'openai/gpt-env';
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return Response.json({
					choices: [{ message: { role: 'assistant', content: 'from env model' } }],
				});
			},
		});

		const result = await completeSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: {},
			args: { prompt: 'Say done' },
		} as never);

		expect(body).toEqual({
			model: 'openai/gpt-env',
			messages: [{ role: 'user', content: 'Say done' }],
		});
		expect(result.text).toBe('from env model');
	});

	test('complete handler reads system prompt from --system-file and saves output', async () => {
		let body: unknown;
		const dir = await mkdtemp(join(tmpdir(), 'agentuity-aigateway-'));
		const systemFile = join(dir, 'system.txt');
		const outputFile = join(dir, 'output.txt');
		await Bun.write(systemFile, 'Be concise.\n');
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return Response.json({
					choices: [{ message: { role: 'assistant', content: 'saved output' } }],
				});
			},
		});

		try {
			const result = await completeSubcommand.handler({
				...baseCtx(`http://127.0.0.1:${server.port}`),
				opts: { model: 'gpt-4.1-mini', systemFile, save: outputFile, refreshModels: true },
				args: { prompt: 'Say done' },
			} as never);

			expect(body).toEqual({
				model: 'gpt-4.1-mini',
				messages: [
					{ role: 'system', content: 'Be concise.' },
					{ role: 'user', content: 'Say done' },
				],
			});
			expect(result.text).toBe('saved output');
			expect(await Bun.file(outputFile).text()).toBe('saved output');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test('complete handler streams token output when --stream is set', async () => {
		let body: unknown;
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				if (request.method === 'GET') {
					return completionModelCatalog();
				}
				body = await request.json();
				return new Response(
					[
						'data: {"choices":[{"delta":{"content":"hel"}}]}',
						'',
						'data: {"choices":[{"delta":{"content":"lo"}}]}',
						'',
						'data: [DONE]',
						'',
					].join('\n'),
					{
						headers: {
							'content-type': 'text/event-stream',
							'x-gateway-cost': '0.000789',
							'x-gateway-prompt-tokens': '20',
							'x-gateway-completion-tokens': '10',
						},
					}
				);
			},
		});

		const result = await completeSubcommand.handler({
			...baseCtx(`http://127.0.0.1:${server.port}`),
			opts: { model: 'gpt-4.1-mini', stream: true, refreshModels: true },
			args: { prompt: 'Say hello' },
		} as never);

		expect(body).toEqual({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
			stream: true,
		});
		expect(result.text).toBe('hello');
		expect(result.response).toEqual({ stream: true, model: 'gpt-4.1-mini' });
		expect(result.cost).toEqual({
			total: 0.000789,
			promptTokens: 20,
			completionTokens: 10,
		});
	});
});
