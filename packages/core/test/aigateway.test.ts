import { describe, expect, test } from 'bun:test';
import { createMockAdapter } from '@agentuity/test-utils';
import { z } from 'zod';
import {
	AIGatewayChatCompletionParamsSchema,
	AIGatewayService,
	applyAIGatewayResponseSchema,
	buildAIGatewayCompletionParams,
	getAIGatewayCompletionStructured,
	getAIGatewayCompletionText,
	getAIGatewayCompletionTextResult,
	getAIGatewayProviderFamily,
	getAIGatewayStreamDeltaText,
	getAIGatewayStreamReasoningText,
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
		expect(models.openai?.[0]?.api).toBeUndefined();
		expect(models.openai?.[0]?.input_modalities).toEqual(['text']);
		expect(models.openai?.[0]?.output_modalities).toEqual(['text']);
		expect(models.openai?.[0]?.pricing?.unit).toBe('per_million_tokens');
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

	test('builds Google Generative AI-shaped params from model API metadata', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'google-generative-ai',
				maxTokens: 1024,
				messages: [
					{ role: 'user', content: 'Say hello' },
					{ role: 'assistant', content: 'Hello' },
				],
				model: 'googleai/gemini-2.5-flash',
				reasoning: '1024',
				systemPrompt: 'You are concise.',
			})
		).toEqual({
			model: 'googleai/gemini-2.5-flash',
			contents: [
				{ role: 'user', parts: [{ text: 'Say hello' }] },
				{ role: 'model', parts: [{ text: 'Hello' }] },
			],
			systemInstruction: {
				parts: [{ text: 'You are concise.' }],
			},
			generationConfig: {
				maxOutputTokens: 1024,
				thinkingConfig: { thinkingBudget: 1024 },
			},
		});
	});

	test('builds Google thinkingLevel params for named reasoning levels', () => {
		expect(
			buildAIGatewayCompletionParams({
				api: 'google-generative-ai',
				maxTokens: 1024,
				messages: [{ role: 'user', content: 'Say hello' }],
				model: 'googleai/gemini-3.1-flash-lite',
				reasoning: 'low',
			})
		).toEqual({
			model: 'googleai/gemini-3.1-flash-lite',
			contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
			generationConfig: {
				maxOutputTokens: 1024,
				thinkingConfig: { thinkingLevel: 'MINIMAL' },
			},
		});
	});

	test('extracts provider stream text through AI Gateway adapters', () => {
		expect(
			getAIGatewayStreamDeltaText({
				choices: [{ delta: { content: 'Hello' } }],
			})
		).toBe('Hello');
		expect(
			getAIGatewayStreamDeltaText({
				type: 'response.output_text.delta',
				delta: 'Hi',
			})
		).toBe('Hi');
		expect(
			getAIGatewayStreamDeltaText({
				type: 'response.output_text.done',
				text: 'Hi',
			})
		).toBe('');
		expect(
			getAIGatewayStreamDeltaText({
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: 'Claude' },
			})
		).toBe('Claude');
		expect(
			getAIGatewayStreamDeltaText({
				candidates: [
					{
						content: {
							parts: [{ text: 'Gemini' }],
						},
					},
				],
			})
		).toBe('Gemini');
		expect(
			getAIGatewayStreamDeltaText([
				{
					candidates: [
						{
							content: {
								parts: [{ text: 'Gemini' }],
							},
						},
					],
				},
				{
					candidates: [
						{
							content: {
								parts: [{ text: ' array' }],
							},
						},
					],
				},
			])
		).toBe('Gemini array');
	});

	test('extracts provider stream reasoning through AI Gateway adapters', () => {
		expect(
			getAIGatewayStreamReasoningText({
				type: 'response.reasoning_summary_text.delta',
				delta: 'Thinking',
			})
		).toBe('Thinking');
		expect(
			getAIGatewayStreamReasoningText({
				type: 'response.reasoning_text.delta',
				delta: 'More thinking',
			})
		).toBe('More thinking');
		expect(
			getAIGatewayStreamReasoningText({
				type: 'response.reasoning_summary_text.done',
				text: 'Thinking',
			})
		).toBe('');
		expect(
			getAIGatewayStreamReasoningText({
				type: 'content_block_delta',
				delta: { type: 'thinking_delta', thinking: 'Claude thinking' },
			})
		).toBe('Claude thinking');
		expect(
			getAIGatewayStreamReasoningText({
				choices: [{ delta: { reasoning_content: 'DeepSeek thinking' } }],
			})
		).toBe('DeepSeek thinking');
		expect(
			getAIGatewayStreamReasoningText([
				{ type: 'response.reasoning_text.delta', delta: 'Array' },
				{ type: 'response.reasoning_text.delta', delta: ' reasoning' },
			])
		).toBe('Array reasoning');
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

	test('sends upstream-shaped gateway requests to custom paths', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: {
					embedding: [0.1, 0.2],
				},
				headers: {
					'x-gateway-cost': '0.000012',
					'x-gateway-billing-unit': 'per_million_tokens',
					'x-gateway-input-quantity': '3.000000',
					'x-gateway-output-quantity': '0.000000',
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const result = await service.request<{ embedding: number[] }>({
			path: '/v1/embeddings',
			body: { model: 'openai/text-embedding-3-small', input: 'hello' },
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${baseUrl}/v1/embeddings`);
		expect(calls[0]?.options.method).toBe('POST');
		expect(calls[0]?.options.contentType).toBe('application/json');
		expect(JSON.parse(String(calls[0]?.options.body))).toEqual({
			model: 'openai/text-embedding-3-small',
			input: 'hello',
		});
		expect(result.data.embedding).toEqual([0.1, 0.2]);
		expect(result.metadata.cost).toEqual({
			total: 0.000012,
			unit: 'per_million_tokens',
			inputQuantity: 3,
			outputQuantity: 0,
			promptTokens: undefined,
			completionTokens: undefined,
			reasoningTokens: undefined,
		});
	});

	test('extracts non-token metered gateway metadata from headers', async () => {
		const { adapter } = createMockAdapter([
			{
				ok: true,
				data: { text: 'You' },
				headers: {
					'x-gateway-cost': '0.000120',
					'x-gateway-billing-unit': 'per_minute_audio',
					'x-gateway-input-quantity': '0.016667',
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const result = await service.request({
			path: '/v1/audio/transcriptions',
			body: { model: 'openai/whisper-1' },
		});

		expect(result.metadata.cost).toEqual({
			total: 0.00012,
			unit: 'per_minute_audio',
			inputQuantity: 0.016667,
			outputQuantity: undefined,
			promptTokens: undefined,
			completionTokens: undefined,
			reasoningTokens: undefined,
		});
	});

	test('streams upstream-shaped gateway requests from custom paths', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: undefined,
				headers: {
					'content-type': 'text/event-stream',
					'x-gateway-cost': '0.000045',
				},
				body: 'data: {"text":"hello"}\n\n',
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		const result = await service.streamRequest({
			path: '/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent',
			body: {
				contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(
			`${baseUrl}/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent`
		);
		expect(calls[0]?.options.method).toBe('POST');
		expect(calls[0]?.options.headers).toEqual({ Accept: 'text/event-stream' });
		expect(calls[0]?.options.binary).toBe(true);
		expect(await new Response(result.stream).text()).toContain('hello');
		expect((await result.metadata).cost?.total).toBe(0.000045);
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
					'data: {"type":"response.completed","response":{"usage":{"output_tokens_details":{"reasoning_tokens":64}},"agentuity":{"headers":{"x-gateway-cost":"0.000498","x-gateway-prompt-tokens":"37","x-gateway-completion-tokens":"203","x-gateway-billing-unit":"per_million_tokens","x-gateway-input-quantity":"37.000000","x-gateway-output-quantity":"203.000000"},"cost":{"total":0.000498,"promptTokens":37,"completionTokens":203,"unit":"per_million_tokens","inputQuantity":37,"outputQuantity":203}}}}\n\n',
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
				'x-gateway-billing-unit': 'per_million_tokens',
				'x-gateway-input-quantity': '37.000000',
				'x-gateway-output-quantity': '203.000000',
			},
			cost: {
				total: 0.000498,
				unit: 'per_million_tokens',
				inputQuantity: 37,
				outputQuantity: 203,
				promptTokens: 37,
				completionTokens: 203,
				reasoningTokens: 64,
			},
		});
	});

	test('translates response_schema to response_format on the wire for OpenAI models', async () => {
		const { adapter, calls } = createMockAdapter([
			{
				ok: true,
				data: {
					id: 'chatcmpl_struct',
					choices: [
						{
							message: { role: 'assistant', content: '{"name":"ada","age":42}' },
							finish_reason: 'stop',
						},
					],
				},
			},
		]);
		const service = new AIGatewayService(baseUrl, adapter);

		await service.complete({
			model: 'openai/gpt-4.1-mini',
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

		const sent = JSON.parse(String(calls[0]?.options.body)) as Record<string, unknown>;
		expect(sent.response_schema).toBeUndefined();
		const rf = sent.response_format as Record<string, unknown>;
		expect(rf?.type).toBe('json_schema');
		expect((rf?.json_schema as Record<string, unknown>)?.name).toBe('user');
	});
});

describe('getAIGatewayCompletionText', () => {
	test('extracts a string content from an OpenAI chat completion', () => {
		const result = getAIGatewayCompletionTextResult({
			choices: [
				{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' },
			],
		});

		expect(result).toEqual({ text: 'Hello world', hasText: true, finishReason: 'stop' });
		expect(getAIGatewayCompletionText({ choices: [{ message: { content: 'Hi' } }] })).toBe('Hi');
	});

	test('concatenates content-parts from a Claude-style chat completion', () => {
		const result = getAIGatewayCompletionTextResult({
			choices: [
				{
					message: {
						role: 'assistant',
						content: [
							{ type: 'text', text: 'Hello ' },
							{ type: 'text', text: 'world' },
						],
					},
					finish_reason: 'stop',
				},
			],
		});

		expect(result.text).toBe('Hello world');
		expect(result.hasText).toBe(true);
	});

	test('distinguishes empty content (no text) from an empty-string reply', () => {
		const noContent = getAIGatewayCompletionTextResult({
			choices: [
				{
					message: {
						role: 'assistant',
						content: null,
						tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'go' } }],
					},
					finish_reason: 'tool_calls',
				},
			],
		});
		expect(noContent).toEqual({
			text: '',
			hasText: false,
			finishReason: 'tool_calls',
			toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'go' } }],
		});

		const emptyString = getAIGatewayCompletionTextResult({
			choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
		});
		expect(emptyString).toEqual({ text: '', hasText: false, finishReason: 'stop' });
		expect(emptyString.hasText).toBe(false); // distinguishable only via finish_reason here
	});

	test('extracts text from an OpenAI Responses-API completion', () => {
		const result = getAIGatewayCompletionTextResult({
			id: 'resp_1',
			status: 'completed',
			output: [
				{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking' }] },
				{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] },
			],
		});

		expect(result.text).toBe('Hello');
		expect(result.hasText).toBe(true);
		expect(result.finishReason).toBe('stop');
	});

	test('extracts text from an Anthropic Messages-API completion', () => {
		const result = getAIGatewayCompletionTextResult({
			id: 'msg_1',
			role: 'assistant',
			content: [
				{ type: 'thinking', thinking: 'reasoning aloud' },
				{ type: 'text', text: 'Hello world' },
			],
			stop_reason: 'end_turn',
		});

		expect(result.text).toBe('Hello world');
		expect(result.finishReason).toBe('stop');
	});

	test('surfaces tool_use from an Anthropic Messages-API completion', () => {
		const result = getAIGatewayCompletionTextResult({
			content: [{ type: 'tool_use', id: 'tu_1', name: 'lookup', input: { query: 'x' } }],
			stop_reason: 'tool_use',
		});

		expect(result.text).toBe('');
		expect(result.hasText).toBe(false);
		expect(result.finishReason).toBe('tool_calls');
		expect(result.toolCalls).toHaveLength(1);
	});

	test('extracts text from a Google Generative-AI completion', () => {
		const result = getAIGatewayCompletionTextResult({
			candidates: [
				{
					content: { parts: [{ text: 'Hello' }, { text: ' world' }] },
					finishReason: 'STOP',
				},
			],
		});

		expect(result.text).toBe('Hello world');
		expect(result.finishReason).toBe('stop');
	});

	test('returns an empty result for unknown / non-object inputs', () => {
		expect(getAIGatewayCompletionTextResult(null)).toEqual({ text: '', hasText: false });
		expect(getAIGatewayCompletionTextResult(undefined)).toEqual({ text: '', hasText: false });
		expect(getAIGatewayCompletionTextResult('hello')).toEqual({ text: '', hasText: false });
		expect(getAIGatewayCompletionTextResult({})).toEqual({ text: '', hasText: false });
	});
});

describe('getAIGatewayProviderFamily', () => {
	test('identifies model families by id prefix', () => {
		expect(getAIGatewayProviderFamily('openai/gpt-4.1-mini')).toBe('openai');
		expect(getAIGatewayProviderFamily('gpt-4o')).toBe('openai');
		expect(getAIGatewayProviderFamily('o3-mini')).toBe('openai');
		expect(getAIGatewayProviderFamily('anthropic/claude-haiku-4-5')).toBe('anthropic');
		expect(getAIGatewayProviderFamily('claude-3-5-sonnet')).toBe('anthropic');
		expect(getAIGatewayProviderFamily('google/gemini-2.5-flash')).toBe('google');
		expect(getAIGatewayProviderFamily('gemini-2.5-flash')).toBe('google');
		expect(getAIGatewayProviderFamily('deepseek/deepseek-chat')).toBe('unknown');
	});
});

describe('applyAIGatewayResponseSchema', () => {
	const userSchema = {
		type: 'object',
		properties: { name: { type: 'string' }, age: { type: 'number' } },
		required: ['name', 'age'],
	};

	test('passes through when no response_schema is set', () => {
		const input = {
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user' as const, content: 'hi' }],
		};
		const result = applyAIGatewayResponseSchema(input);
		expect(result.applied).toBe(false);
		expect(result.family).toBe('openai');
		expect(result.params).toBe(input);
	});

	test('translates to OpenAI response_format for openai-family models', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: { name: 'user', schema: userSchema },
		});
		expect(result.applied).toBe(true);
		expect(result.family).toBe('openai');
		expect((result.params as Record<string, unknown>).response_schema).toBeUndefined();
		const rf = (result.params as Record<string, unknown>).response_format as Record<
			string,
			unknown
		>;
		expect(rf.type).toBe('json_schema');
		const js = rf.json_schema as Record<string, unknown>;
		expect(js.name).toBe('user');
		expect(js.strict).toBe(true);
		expect((js.schema as Record<string, unknown>).additionalProperties).toBe(false);
	});

	test('translates to Anthropic tool-use for anthropic-family models', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'anthropic/claude-haiku-4-5',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: { name: 'finding', schema: userSchema },
		});
		expect(result.applied).toBe(true);
		expect(result.family).toBe('anthropic');
		const params = result.params as Record<string, unknown>;
		const tools = params.tools as Array<Record<string, unknown>>;
		expect(tools).toHaveLength(1);
		expect(tools[0]?.name).toBe('finding');
		expect(tools[0]?.input_schema).toBeDefined();
		expect(params.tool_choice).toEqual({ type: 'tool', name: 'finding' });
		expect(params.response_schema).toBeUndefined();
	});

	test('translates to Google generationConfig.responseSchema for google-family models', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'google/gemini-2.5-flash',
			contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
			response_schema: { schema: userSchema },
		});
		expect(result.applied).toBe(true);
		expect(result.family).toBe('google');
		const gc = (result.params as Record<string, unknown>).generationConfig as Record<
			string,
			unknown
		>;
		expect(gc.responseMimeType).toBe('application/json');
		expect(gc.responseSchema).toBeDefined();
	});

	test('falls back to schema-injected system message for unknown families', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'deepseek/deepseek-chat',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: { schema: userSchema },
		});
		expect(result.applied).toBe(true);
		expect(result.family).toBe('unknown');
		const params = result.params as Record<string, unknown>;
		expect(params.tools).toBeUndefined();
		expect(params.response_format).toBeUndefined();
		const messages = params.messages as Array<Record<string, unknown>>;
		expect(messages[0]?.role).toBe('system');
		expect(String(messages[0]?.content)).toContain('JSON');
		expect(String(messages[0]?.content)).toContain('"type": "object"');
	});

	test('accepts a raw JSON Schema as response_schema', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: userSchema,
		});
		expect(result.applied).toBe(true);
		const rf = (result.params as Record<string, unknown>).response_format as Record<
			string,
			unknown
		>;
		const js = rf.json_schema as Record<string, unknown>;
		expect(js.name).toBe('response');
	});

	test('accepts a Zod schema as response_schema', () => {
		const zodSchema = z.object({ name: z.string(), age: z.number() });
		const result = applyAIGatewayResponseSchema({
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: { name: 'user', schema: zodSchema },
		});
		expect(result.applied).toBe(true);
		const rf = (result.params as Record<string, unknown>).response_format as Record<
			string,
			unknown
		>;
		const js = rf.json_schema as Record<string, unknown>;
		const schema = js.schema as Record<string, unknown>;
		expect(schema.type).toBe('object');
		expect((schema.properties as Record<string, unknown>).name).toBeDefined();
	});

	test('strict=false leaves additionalProperties alone', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'openai/gpt-4.1-mini',
			messages: [{ role: 'user' as const, content: 'hi' }],
			response_schema: { schema: userSchema, strict: false },
		});
		const rf = (result.params as Record<string, unknown>).response_format as Record<
			string,
			unknown
		>;
		const js = rf.json_schema as Record<string, unknown>;
		expect(js.strict).toBe(false);
		expect((js.schema as Record<string, unknown>).additionalProperties).toBeUndefined();
	});

	test('appends to an existing system message in the fallback path', () => {
		const result = applyAIGatewayResponseSchema({
			model: 'deepseek/deepseek-chat',
			messages: [
				{ role: 'system' as const, content: 'You are terse.' },
				{ role: 'user' as const, content: 'hi' },
			],
			response_schema: { schema: userSchema },
		});
		const messages = (result.params as Record<string, unknown>).messages as Array<
			Record<string, unknown>
		>;
		expect(messages[0]?.role).toBe('system');
		expect(String(messages[0]?.content)).toContain('You are terse.');
		expect(String(messages[0]?.content)).toContain('JSON');
	});
});

describe('getAIGatewayCompletionStructured', () => {
	test('parses JSON from OpenAI chat content', () => {
		const result = getAIGatewayCompletionStructured({
			choices: [
				{ message: { role: 'assistant', content: '{"ok":true,"n":3}' }, finish_reason: 'stop' },
			],
		});
		expect(result).toEqual({ ok: true, n: 3 });
	});

	test('strips ```json code fences before parsing', () => {
		const result = getAIGatewayCompletionStructured({
			choices: [
				{
					message: { role: 'assistant', content: '```json\n{"ok":true}\n```' },
					finish_reason: 'stop',
				},
			],
		});
		expect(result).toEqual({ ok: true });
	});

	test('returns the tool_use input for anthropic completions', () => {
		const result = getAIGatewayCompletionStructured(
			{
				content: [
					{
						type: 'tool_use',
						id: 'tu_1',
						name: 'finding',
						input: { findings: [{ path: 'a', line: 1 }] },
					},
				],
				stop_reason: 'tool_use',
			},
			'anthropic'
		);
		expect(result).toEqual({ findings: [{ path: 'a', line: 1 }] });
	});

	test('returns undefined when no parseable JSON is available', () => {
		expect(
			getAIGatewayCompletionStructured({
				choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }],
			})
		).toBeUndefined();
		expect(getAIGatewayCompletionStructured({}, 'openai')).toBeUndefined();
	});
});
