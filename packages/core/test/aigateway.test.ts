import { describe, expect, test } from 'bun:test';
import { createMockAdapter } from '@agentuity/test-utils';
import { AIGatewayService } from '../src/services/aigateway/index.ts';

describe('AIGatewayService', () => {
	const baseUrl = 'https://aigateway.example.com';

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
});
