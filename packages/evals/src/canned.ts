import type { CreateEvalConfig } from '@agentuity/runtime';
import type { StandardSchemaV1 } from '@agentuity/core';
import type { BaseEvalOptions } from './types';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

type CannedEvalConfig<
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = CreateEvalConfig<TInput, TOutput> & {
	name: string;
};

export function createCannedEval<
	TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOptions extends BaseEvalOptions = BaseEvalOptions,
>(config: {
	name: string;
	description?: string;
	handler: CreateEvalConfig<TInput, TOutput>['handler'];
	options: TOptions;
}): (
	overrides?: Partial<Pick<CannedEvalConfig<TInput, TOutput>, 'name' | 'description'>> & {
		options?: TOptions;
	}
) => CannedEvalConfig<TInput, TOutput> & { options: TOptions } {
	return (overrides) => ({
		name: overrides?.name ?? config.name,
		description: overrides?.description ?? config.description,
		handler: config.handler,
		options: overrides?.options ?? config.options,
	});
}

export const politenessEval = createCannedEval({
	name: 'politeness',
	description: 'Checks if the agent is polite',
	options: {
		model: 'gpt-4o',
	},
	handler: async (ctx, _input, _output) => {
		ctx.logger.info('test');

		generateText({
			model: openai('gpt-4o'),
			prompt: 'Are you polite?',
		});
		return {
			success: true,
			passed: true,
			metadata: {
				reason: 'test',
			},
		};
	},
});

politenessEval();
