import type { InferOutput, StandardSchemaV1 } from '@agentuity/core';
import type { CreateEvalConfig, EvalContext } from '@agentuity/runtime';
import type { BaseEvalOptions, EvalMiddleware } from './types';
import { s } from '@agentuity/schema';

// Default schemas for canned evals - change these to update all evals
export const DefaultEvalInputSchema = s.object({ string: s.string() });
export const DefaultEvalOutputSchema = s.object({ string: s.string() });
export type DefaultEvalInput = typeof DefaultEvalInputSchema;
export type DefaultEvalOutput = typeof DefaultEvalOutputSchema;

// Infer the output type from a schema, or any if undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferSchemaOutput<T> = T extends StandardSchemaV1 ? InferOutput<T> : any;

type CannedEvalOverrides<
	TEvalInput extends StandardSchemaV1 | undefined,
	TEvalOutput extends StandardSchemaV1 | undefined,
	TOptions extends BaseEvalOptions,
	TAgentInput,
	TAgentOutput,
> = Partial<{ name?: string; description?: string } & TOptions> & {
	middleware?: EvalMiddleware<
		TAgentInput,
		TAgentOutput,
		InferSchemaOutput<TEvalInput>,
		InferSchemaOutput<TEvalOutput>
	>;
};

// Return type is compatible with any agent's createEval method
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CannedEvalResult<TOptions extends BaseEvalOptions> = CreateEvalConfig<any, any> & {
	name: string;
	options: TOptions;
};

export function createCannedEval<
	TEvalInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TEvalOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
	TOptions extends BaseEvalOptions = BaseEvalOptions,
>(config: {
	name: string;
	description?: string;
	handler: (
		ctx: EvalContext,
		input: InferSchemaOutput<TEvalInput>,
		output: InferSchemaOutput<TEvalOutput>,
		options: TOptions
	) => ReturnType<CreateEvalConfig<TEvalInput, TEvalOutput>['handler']>;
	options: TOptions;
}): <
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TAgentInput extends StandardSchemaV1 | undefined = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TAgentOutput extends StandardSchemaV1 | undefined = any,
>(
	overrides?: CannedEvalOverrides<
		TEvalInput,
		TEvalOutput,
		TOptions,
		InferSchemaOutput<TAgentInput>,
		InferSchemaOutput<TAgentOutput>
	>
) => CannedEvalResult<TOptions> {
	return (overrides) => {
		const { name, description, middleware, ...optionOverrides } = overrides ?? {};
		const currentOptions = { ...config.options, ...optionOverrides } as TOptions;

		return {
			name: name ?? config.name,
			description: description ?? config.description,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			handler: (async (ctx: EvalContext, input: any, output: any) => {
				const evalInput = middleware
					? middleware.transformInput(input)
					: (input as InferSchemaOutput<TEvalInput>);
				const evalOutput = middleware
					? middleware.transformOutput(output)
					: (output as InferSchemaOutput<TEvalOutput>);
				return config.handler(ctx, evalInput, evalOutput, currentOptions);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			}) as any,
			options: currentOptions,
		};
	};
}
