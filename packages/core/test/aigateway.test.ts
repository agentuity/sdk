import { describe, expect, test } from 'bun:test';
import { createMockAdapter } from '@agentuity/test-utils';
import {
	AIGatewayChatCompletionParamsSchema,
	AIGatewayService,
	buildAIGatewayCompletionParams,
} from '../src/services/aigateway/index.ts';

describe('AIGatewayService', () => {
	const baseUrl = 'https://aigateway.example.com';

	test('requires prompt or messages for completion params', () => {
		expect(AIGatewayChatCompletionParamsSchema.safeParse({ model: 'gpt-4.1-mini' }).success).toBe(
			false
		);
		expect(
			AIGatewayChatCompletionParamsSchema.safeParse({
				model: 'gpt-4.1-mini',
				prompt: '   ',
			}).success
		).toBe(false);
		expect(
			AIGatewayChatCompletionParamsSchema.safeParse({
				model: 'gpt-4.1-mini',
				prompt: ['Say hello'],
			}).success
		).toBe(true);
		expect(
			AIGatewayChatCompletionParamsSchema.safeParse({
				model: 'gpt-5-mini',
				input: [{ role: 'user', content: 'Say hello' }],
			}).success
		).toBe(true);
	});

	test('lists models from the gateway catalog', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: {
					success: true,
					data: {
						openai: [
							{
								id: 'gpt-4.1-mini',
								name: 'GPT 4.1 Mini',
								reasoning: false,
								input_modalities: ['text'],
								output_modalities: ['text'],
								provider: { api: 'https://api.openai.com' },
								pricing: {
									input: 0.4,
									output: 1.6,
									unit: 'per_million_tokens',
									currency: 'USD',
								},
							},
						],
					},
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const models = await service.listModels();

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${baseUrl}/models`);
		expect(calls[0]?.options.method).toBe('GET');
		expect(models.openai?.[0]?.id).toBe('gpt-4.1-mini');
	});

	test('creates completions through the AI Gateway auto-router endpoint', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: {
					id: 'chatcmpl_123',
					model: 'gpt-4.1-mini',
					choices: [{ message: { role: 'assistant', content: 'Hello' } }],
				},
				headers: {
					'x-gateway-cost': '0.000123',
					'x-gateway-prompt-tokens': '10',
					'x-gateway-completion-tokens': '5',
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const completion = await service.complete({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
			temperature: 0.2,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${baseUrl}/`);
		expect(calls[0]?.options.method).toBe('POST');
		expect(calls[0]?.options.contentType).toBe('application/json');
		expect(JSON.parse(String(calls[0]?.options.body))).toEqual({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
			temperature: 0.2,
		});
		expect(completion.id).toBe('chatcmpl_123');
		expect(completion.agentuity?.cost).toEqual({
			total: 0.000123,
			promptTokens: 10,
			completionTokens: 5,
		});
		expect(completion.agentuity?.headers?.['x-gateway-cost']).toBe('0.000123');
	});

	test('creates responses-shaped completions through the AI Gateway auto-router endpoint', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: {
					id: 'resp_123',
					model: 'gpt-5-mini',
					output: [
						{
							type: 'reasoning',
							summary: [{ type: 'summary_text', text: 'Reasoned briefly.' }],
						},
						{
							type: 'message',
							content: [{ type: 'output_text', text: 'Hello' }],
						},
					],
					usage: {
						output_tokens_details: {
							reasoning_tokens: 64,
						},
					},
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const completion = await service.complete({
			model: 'gpt-5-mini',
			input: [{ role: 'user', content: 'Say hello' }],
			max_output_tokens: 64,
			reasoning: { effort: 'low', summary: 'detailed' },
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${baseUrl}/`);
		expect(calls[0]?.options.method).toBe('POST');
		expect(JSON.parse(String(calls[0]?.options.body))).toEqual({
			model: 'gpt-5-mini',
			input: [{ role: 'user', content: 'Say hello' }],
			max_output_tokens: 64,
			reasoning: { effort: 'low', summary: 'detailed' },
		});
		expect(completion.id).toBe('resp_123');
		expect(completion.output).toEqual([
			{
				type: 'reasoning',
				summary: [{ type: 'summary_text', text: 'Reasoned briefly.' }],
			},
			{
				type: 'message',
				content: [{ type: 'output_text', text: 'Hello' }],
			},
		]);
		expect(completion.agentuity?.cost?.reasoningTokens).toBe(64);
	});

	test('prefers provider reasoning token usage over zero gateway metadata', async () => {
		const { adapter } = createMockAdapter([
			{
				ok: true,
				data: {
					id: 'resp_456',
					model: 'gpt-5-mini',
					output: [],
					usage: {
						output_tokens_details: {
							reasoning_tokens: 128,
						},
					},
				},
				headers: {
					'x-gateway-cost': '0.000123',
					'x-gateway-completion-tokens': '5',
					'x-gateway-prompt-tokens': '10',
					'x-gateway-reasoning-tokens': '0',
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const completion = await service.complete({
			model: 'gpt-5-mini',
			input: [{ role: 'user', content: 'Say hello' }],
		});

		expect(completion.agentuity?.cost).toEqual({
			total: 0.000123,
			promptTokens: 10,
			completionTokens: 5,
			reasoningTokens: 128,
		});
	});

	test('builds OpenAI Responses-shaped params from model API metadata', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'openai-responses',
				maxTokens: 64,
				messages: [{ role: 'user', content: 'Say hello' }],
				model: 'openai/gpt-5-mini',
				reasoning: 'low',
				systemPrompt: 'You are concise.',
			})
		).toEqual({
			model: 'openai/gpt-5-mini',
			input: [
				{ role: 'developer', content: 'You are concise.' },
				{ role: 'user', content: 'Say hello' },
			],
			reasoning: { effort: 'low', summary: 'detailed' },
			max_output_tokens: 64,
		});
	});

	test('builds Anthropic Messages-shaped params from model API metadata', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'anthropic-messages',
				maxTokens: 1024,
				messages: [{ role: 'user', content: 'Say hello' }],
				model: 'anthropic/claude-opus-4-7',
				reasoning: '1024',
				systemPrompt: 'You are concise.',
			})
		).toEqual({
			model: 'anthropic/claude-opus-4-7',
			messages: [{ role: 'user', content: 'Say hello' }],
			system: 'You are concise.',
			thinking: { budget_tokens: 1024, type: 'enabled' },
			max_tokens: 1024,
		});
	});

	test('builds DeepSeek OpenAI-compatible params with explicit thinking disabled', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'openai-completions',
				maxTokens: 256,
				messages: [{ role: 'user', content: 'Say hello' }],
				model: 'deepseek/deepseek-v4-pro',
				reasoning: 'off',
				systemPrompt: 'You are concise.',
			})
		).toEqual({
			model: 'deepseek/deepseek-v4-pro',
			messages: [
				{ role: 'system', content: 'You are concise.' },
				{ role: 'user', content: 'Say hello' },
			],
			thinking: { type: 'disabled' },
			max_tokens: 256,
		});
	});

	test('builds DeepSeek OpenAI-compatible params with thinking enabled', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'openai-completions',
				maxTokens: 256,
				messages: [{ role: 'user', content: 'Say hello' }],
				model: 'deepseek/deepseek-v4-pro',
				reasoning: 'high',
			})
		).toEqual({
			model: 'deepseek/deepseek-v4-pro',
			messages: [{ role: 'user', content: 'Say hello' }],
			reasoning_effort: 'high',
			thinking: { type: 'enabled' },
			max_tokens: 256,
		});
	});

	test('streams completions through the AI Gateway auto-router endpoint', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: undefined,
				headers: { 'content-type': 'text/event-stream' },
				body: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const stream = await service.streamComplete({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${baseUrl}/`);
		expect(calls[0]?.options.method).toBe('POST');
		expect(calls[0]?.options.contentType).toBe('application/json');
		expect(calls[0]?.options.headers).toEqual({ Accept: 'text/event-stream' });
		expect(calls[0]?.options.binary).toBe(true);
		expect(JSON.parse(String(calls[0]?.options.body))).toEqual({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
			stream: true,
		});
		expect(stream).toBeInstanceOf(ReadableStream);
	});

	test('streams chat completions with gateway metadata', async () => {
		const { adapter } = createMockAdapter([
			{
				ok: true,
				data: undefined,
				headers: {
					'content-type': 'text/event-stream',
					'x-gateway-cost': '0.000234',
					'x-gateway-prompt-tokens': '11',
					'x-gateway-completion-tokens': '7',
				},
				body: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const completion = await service.streamCompleteWithMetadata({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
		});

		expect(completion.stream).toBeInstanceOf(ReadableStream);
		const streamText = await new Response(completion.stream).text();
		expect(streamText).toContain('Hello');
		expect(await completion.metadata).toEqual({
			headers: {
				'x-gateway-cost': '0.000234',
				'x-gateway-prompt-tokens': '11',
				'x-gateway-completion-tokens': '7',
			},
			cost: {
				total: 0.000234,
				promptTokens: 11,
				completionTokens: 7,
			},
		});
	});

	test('extracts streaming metadata from the final SSE payload', async () => {
		const { adapter } = createMockAdapter([
			{
				ok: true,
				data: undefined,
				headers: { 'content-type': 'text/event-stream' },
				body:
					'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n' +
					'data: {"type":"response.completed","response":{"usage":{"output_tokens_details":{"reasoning_tokens":64}},"agentuity":{"headers":{"x-gateway-cost":"0.000498","x-gateway-prompt-tokens":"37","x-gateway-completion-tokens":"203"},"cost":{"total":0.000498,"promptTokens":37,"completionTokens":203}}}}\n\n',
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const completion = await service.streamCompleteWithMetadata({
			model: 'gpt-5-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
		});

		expect(completion.stream).toBeInstanceOf(ReadableStream);
		const streamText = await new Response(completion.stream).text();
		expect(streamText).toContain('Hello');
		expect(streamText).toContain('response.completed');
		expect(await completion.metadata).toEqual({
			headers: {
				'x-gateway-cost': '0.000498',
				'x-gateway-prompt-tokens': '37',
				'x-gateway-completion-tokens': '203',
			},
			cost: {
				total: 0.000498,
				promptTokens: 37,
				completionTokens: 203,
				reasoningTokens: 64,
			},
		});
	});
});
