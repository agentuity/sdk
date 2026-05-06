import { z } from 'zod';
import {
	AIGatewayChatCompletionParamsSchema,
	AIGatewayChatCompletionSchema,
	AIGatewayModelsResponseSchema,
} from './service.ts';
import type { Service } from '../api-reference.ts';

const AIGatewayStreamCompletionSchema = z
	.object({
		choices: z
			.array(
				z
					.object({
						delta: z
							.object({
								role: z
									.string()
									.optional()
									.describe('Role for the streamed message delta.'),
								content: z.string().optional().describe('Token or text delta.'),
							})
							.optional()
							.describe('Incremental assistant message content.'),
						finish_reason: z
							.string()
							.nullable()
							.optional()
							.describe('Reason the model stopped generating, when available.'),
					})
					.catchall(z.unknown())
			)
			.describe('Streamed completion choices.'),
	})
	.catchall(z.unknown())
	.describe('A single Server-Sent Events data frame for streamed completions.');

const service: Service = {
	name: 'AI Gateway',
	slug: 'ai-gateway',
	description: 'List supported LLM models and run routed AI Gateway completions',
	host: 'aigateway',
	endpoints: [
		{
			id: 'list-models',
			title: 'List Models',
			method: 'GET',
			path: '/models',
			description:
				'List model metadata for LLM providers available through AI Gateway, grouped by provider.',
			pathParams: [],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'JSON response containing provider keys mapped to arrays of supported model metadata.',
			responseFields: { schema: AIGatewayModelsResponseSchema },
			statuses: [
				{ code: 200, description: 'Model catalog returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 402, description: 'Payment required — upgrade to a paid plan' },
			],
			examplePath: '/models',
		},
		{
			id: 'create-chat-completion',
			title: 'Create Completion',
			method: 'POST',
			path: '/',
			description:
				'Create a completion through the AI Gateway auto-router. The gateway routes by model and request shape, so chat `messages` and legacy `prompt` payloads are both supported.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description:
					'Completion request. Use `messages` for chat-compatible models and `prompt` for legacy OpenAI completions-compatible models. Additional provider-specific fields are passed through.',
				fields: { schema: AIGatewayChatCompletionParamsSchema },
			},
			responseDescription: 'Provider-compatible completion response.',
			responseHeaders: [
				{
					name: 'X-Gateway-Cost',
					description:
						'Estimated total gateway cost in USD, when billing metadata is available.',
				},
				{
					name: 'X-Gateway-Prompt-Tokens',
					description: 'Prompt token count used for gateway billing.',
				},
				{
					name: 'X-Gateway-Completion-Tokens',
					description: 'Completion token count used for gateway billing.',
				},
			],
			responseFields: { schema: AIGatewayChatCompletionSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Completion created' },
				{ code: 400, description: 'Invalid completion request' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 402, description: 'Payment required — upgrade to a paid plan' },
			],
			examplePath: '/',
			exampleBody: {
				model: 'openai/gpt-4o-mini',
				messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
				max_tokens: 64,
			},
		},
		{
			id: 'stream-chat-completion',
			title: 'Stream Completion',
			method: 'POST',
			path: '/',
			description:
				'Create a streaming completion through the AI Gateway auto-router. Set `stream: true` to receive Server-Sent Events token deltas.',
			pathParams: [],
			queryParams: [],
			requestBody: {
				description: 'Completion request with `stream` set to `true`.',
				fields: { schema: AIGatewayChatCompletionParamsSchema },
			},
			responseDescription:
				'Server-Sent Events stream. Each `data:` frame contains a provider-compatible delta payload. The stream ends with `data: [DONE]`.',
			responseHeaders: [
				{
					name: 'Trailer',
					description:
						'Declares billing trailers such as `X-Gateway-Cost`, `X-Gateway-Prompt-Tokens`, and `X-Gateway-Completion-Tokens` for streamed responses.',
				},
				{
					name: 'X-Gateway-Cost',
					description:
						'Estimated total gateway cost in USD. For streaming responses this may be delivered as an HTTP trailer after the body completes.',
				},
				{
					name: 'X-Gateway-Prompt-Tokens',
					description:
						'Prompt token count used for gateway billing. For streaming responses this may be delivered as an HTTP trailer.',
				},
				{
					name: 'X-Gateway-Completion-Tokens',
					description:
						'Completion token count used for gateway billing. For streaming responses this may be delivered as an HTTP trailer.',
				},
			],
			responseFields: { schema: AIGatewayStreamCompletionSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Streaming completion started' },
				{ code: 400, description: 'Invalid completion request' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 402, description: 'Payment required — upgrade to a paid plan' },
			],
			examplePath: '/',
			exampleHeaders: { Accept: 'text/event-stream' },
			exampleBody: {
				model: 'openai/gpt-4o-mini',
				messages: [{ role: 'user', content: 'Count to three.' }],
				stream: true,
			},
		},
	],
};

export default service;
