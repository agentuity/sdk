import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import { z } from 'zod';
import { AIGatewayClient } from '../src/index.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
	AGENTUITY_AIGATEWAY_URL: process.env.AGENTUITY_AIGATEWAY_URL,
	AGENTUITY_CLOUD_ORG_ID: process.env.AGENTUITY_CLOUD_ORG_ID,
	AGENTUITY_ORG_ID: process.env.AGENTUITY_ORG_ID,
	AGENTUITY_ORGID: process.env.AGENTUITY_ORGID,
	AGENTUITY_REGION: process.env.AGENTUITY_REGION,
	AGENTUITY_SDK_KEY: process.env.AGENTUITY_SDK_KEY,
};

function restoreEnv(): void {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe('AIGatewayClient orgId resolution', () => {
	let requestHeaders: Headers | undefined;

	beforeEach(() => {
		restoreEnv();
		process.env.AGENTUITY_AIGATEWAY_URL = 'https://aigateway.test';
		process.env.AGENTUITY_SDK_KEY = 'key_test';
		requestHeaders = undefined;
		globalThis.fetch = async (_input, init) => {
			requestHeaders = new Headers(init?.headers);
			return Response.json({
				choices: [{ message: { role: 'assistant', content: 'Bonjour' } }],
			});
		};
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
		restoreEnv();
	});

	test('sends org header from AGENTUITY_ORGID', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient();
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_env');
	});

	test('prefers explicit orgId over env org', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient({ orgId: 'org_explicit' });
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_explicit');
	});

	test('ignores blank explicit orgId and falls back to env org', async () => {
		process.env.AGENTUITY_ORGID = 'org_env';

		const client = new AIGatewayClient({ orgId: '   ' });
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_env');
	});

	test('falls back to AGENTUITY_CLOUD_ORG_ID', async () => {
		process.env.AGENTUITY_CLOUD_ORG_ID = 'org_cloud';

		const client = new AIGatewayClient();
		await client.complete({
			model: 'openai/gpt-4o-mini',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(requestHeaders?.get('x-agentuity-orgid')).toBe('org_cloud');
	});
});

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

	test('hasText=true when the model returned an explicit empty-string reply', async () => {
		mockFetch(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl_empty_1',
						model: 'gpt-4.1-mini',
						choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
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
			messages: [{ role: 'user', content: 'Say nothing' }],
		});

		expect(result.text).toBe('');
		expect(result.hasText).toBe(true);
		expect(result.finishReason).toBe('stop');
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
