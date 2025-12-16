import type { StandardSchemaV1 } from '@agentuity/core';
import type { CreateEvalConfig, EvalContext } from '@agentuity/runtime';
import type { BaseEvalOptions } from './types';

type CannedEvalConfig<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TInput extends StandardSchemaV1 | undefined = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TOutput extends StandardSchemaV1 | undefined = any,
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
	handler: (
		ctx: Parameters<CreateEvalConfig<TInput, TOutput>['handler']>[0],
		input: Parameters<CreateEvalConfig<TInput, TOutput>['handler']>[1],
		output: Parameters<CreateEvalConfig<TInput, TOutput>['handler']>[2],
		options: TOptions
	) => ReturnType<CreateEvalConfig<TInput, TOutput>['handler']>;
	options: TOptions;
}): (
	overrides?: Partial<Pick<CannedEvalConfig<TInput, TOutput>, 'name' | 'description'> & TOptions>
) => CannedEvalConfig<TInput, TOutput> & { options: TOptions } {
	return (overrides) => {
		const { name, description, ...optionOverrides } = overrides ?? {};
		const currentOptions = { ...config.options, ...optionOverrides } as TOptions;

		return {
			name: name ?? config.name,
			description: description ?? config.description,
			handler: (async (
				ctx: EvalContext,
				input: Parameters<CreateEvalConfig<TInput, TOutput>['handler']>[1],
				output: Parameters<CreateEvalConfig<TInput, TOutput>['handler']>[2]
			) => {
				return config.handler(ctx, input, output, currentOptions);
			}) as unknown as CreateEvalConfig<TInput, TOutput>['handler'],
			options: currentOptions,
		};
	};
}
