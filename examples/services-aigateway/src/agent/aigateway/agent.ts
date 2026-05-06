/**
 * AI Gateway Example
 *
 * Demonstrates how to use the standalone @agentuity/aigateway TypeScript API
 * from an Agentuity agent.
 */

import { AIGatewayClient } from '@agentuity/aigateway';
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const inputSchema = s.union([
	s.object({
		operation: s.literal('models'),
		provider: s.string().optional(),
		input: s.string().optional(),
		reasoning: s.boolean().optional(),
	}),
	s.object({
		operation: s.literal('complete'),
		model: s.string(),
		prompt: s.string(),
		system: s.string().optional(),
		temperature: s.number().optional(),
		maxTokens: s.number().optional(),
	}),
]);

function getCompletionText(response: unknown): string {
	const choices = (response as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return '';
	}
	const first = choices[0] as { message?: { content?: unknown }; text?: unknown };
	const content = first.message?.content ?? first.text;
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object' && 'text' in part) {
					const text = (part as { text?: unknown }).text;
					return typeof text === 'string' ? text : '';
				}
				return '';
			})
			.join('');
	}
	return '';
}

export default createAgent('aigateway', {
	description: 'Example agent demonstrating AI Gateway model discovery and completions',
	schema: {
		input: inputSchema,
		output: s.any(),
	},
	handler: async (ctx, input) => {
		const client = new AIGatewayClient({ logger: ctx.logger });

		switch (input.operation) {
			case 'models': {
				const catalog = await client.listModels();
				const models = Object.entries(catalog)
					.filter(([provider]) => !input.provider || provider === input.provider)
					.flatMap(([provider, providerModels]) =>
						providerModels
							.filter(
								(model) => !input.input || model.input_modalities?.includes(input.input)
							)
							.filter((model) => !input.reasoning || model.reasoning)
							.map((model) => ({
								provider,
								id: model.id,
								name: model.name,
								api: model.api,
								contextWindow: model.context_window,
								maxOutputTokens: model.max_output_tokens,
								reasoning: model.reasoning,
								inputModalities: model.input_modalities,
								outputModalities: model.output_modalities,
							}))
					);
				return { models, count: models.length };
			}

			case 'complete': {
				const response = await client.complete({
					model: input.model,
					messages: [
						...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
						{ role: 'user' as const, content: input.prompt },
					],
					temperature: input.temperature,
					max_tokens: input.maxTokens,
				});
				return {
					text: getCompletionText(response),
					response,
				};
			}
		}
	},
});
