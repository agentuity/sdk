import { describe, expect, test } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import { z } from 'zod';
import { AIGatewayClient } from '../src/index.ts';

describe('AIGatewayClient.completeText', () => {
	test('returns the assistant text plus the raw completion', async () => {
		mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl_text_1',
						model: 'gpt-4.1-mini',
						choices: [
							{
								message: { role: 'assistant', content: 'Hello world' },
								finish_reason: 'stop',
							},
						],
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);

		const client = new AIGatewayClient({
			apiKey: 'test-key',
			url: 'https://aigateway.example.com',
		});
		const result = await client.completeText({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Say hello' }],
		});

		expect(result.text).toBe('Hello world');
		expect(result.hasText).toBe(true);
		expect(result.finishReason).toBe('stop');
		expect(result.completion.id).toBe('chatcmpl_text_1');
	});

	test('returns hasText=false when the model produced no textual content', async () => {
		mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl_tools_1',
						model: 'gpt-4.1-mini',
						choices: [
							{
								message: {
									role: 'assistant',
									content: null,
									tool_calls: [
										{ id: 'call_1', type: 'function', function: { name: 'lookup' } },
									],
								},
								finish_reason: 'tool_calls',
							},
						],
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);

		const client = new AIGatewayClient({
			apiKey: 'test-key',
			url: 'https://aigateway.example.com',
		});
		const result = await client.completeText({
			model: 'gpt-4.1-mini',
			messages: [{ role: 'user', content: 'Look up the weather' }],
		});

		expect(result.text).toBe('');
		expect(result.hasText).toBe(false);
		expect(result.finishReason).toBe('tool_calls');
		expect(result.toolCalls).toHaveLength(1);
	});
});

describe('AIGatewayClient.completeStructured', () => {
	test('translates a Zod response_schema and returns parsed data for openai-family models', async () => {
		let capturedBody: Record<string, unknown> | undefined;
		mockFetch(async (_url, init) => {
			capturedBody = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify({
					id: 'chatcmpl_struct',
					model: 'gpt-4.1-mini',
					choices: [
						{
							message: { role: 'assistant', content: '{"name":"ada","age":42}' },
							finish_reason: 'stop',
						},
					],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});

		const client = new AIGatewayClient({
			apiKey: 'test-key',
			url: 'https://aigateway.example.com',
		});
		const UserSchema = z.object({ name: z.string(), age: z.number() });
		const result = await client.completeStructured<z.infer<typeof UserSchema>>({
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user', content: 'who?' }],
			response_schema: { name: 'user', schema: UserSchema },
		});

		expect(capturedBody?.response_schema).toBeUndefined();
		const rf = capturedBody?.response_format as Record<string, unknown>;
		expect(rf?.type).toBe('json_schema');
		expect(result.family).toBe('openai');
		expect(result.data).toEqual({ name: 'ada', age: 42 });
		expect(result.completion.id).toBe('chatcmpl_struct');
	});

	test('returns the anthropic tool_use input when the model is claude-family', async () => {
		mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						id: 'msg_struct',
						content: [
							{
								type: 'tool_use',
								id: 'tu_1',
								name: 'user',
								input: { name: 'ada', age: 42 },
							},
						],
						stop_reason: 'tool_use',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);

		const client = new AIGatewayClient({
			apiKey: 'test-key',
			url: 'https://aigateway.example.com',
		});
		const result = await client.completeStructured({
			model: 'anthropic/claude-haiku-4-5',
			messages: [{ role: 'user', content: 'who?' }],
			response_schema: {
				name: 'user',
				schema: {
					type: 'object',
					properties: { name: { type: 'string' }, age: { type: 'number' } },
					required: ['name', 'age'],
				},
			},
		});

		expect(result.family).toBe('anthropic');
		expect(result.data).toEqual({ name: 'ada', age: 42 });
	});
});
