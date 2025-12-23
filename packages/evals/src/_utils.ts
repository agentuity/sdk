import type { InferOutput, StandardSchemaV1 } from '@agentuity/core';
import type { CreateEvalConfig, EvalContext, EvalHandlerResult } from '@agentuity/runtime';
import type { BaseEvalOptions, EvalMiddleware } from './types';
import { s } from '@agentuity/schema';
import { generateText, type LanguageModel } from 'ai';

// Default schemas for preset evals - change these to update all evals
export const DefaultEvalInputSchema = s.object({
	request: s.string(),
	context: s.string().optional(),
});
export const DefaultEvalOutputSchema = s.object({
	response: s.string(),
});
export type DefaultEvalInput = typeof DefaultEvalInputSchema;
export type DefaultEvalOutput = typeof DefaultEvalOutputSchema;

/**
 * Interpolates a prompt template with the provided variables.
 * Replaces {{VARIABLE_NAME}} placeholders with their values.
 *
 * @example
 * ```typescript
 * const prompt = interpolatePrompt(politenessPrompt, {
 *   USER_REQUEST: input.request,
 *   MODEL_RESPONSE: output.response,
 * });
 * ```
 */
export function interpolatePrompt(template: string, variables: Record<string, string>): string {
	return Object.entries(variables).reduce(
		(prompt, [key, value]) => prompt.replaceAll(`{{${key}}}`, value),
		template
	);
}

export type GenerateEvalResultOptions = {
	model: LanguageModel;
	prompt: string;
	maxRetries?: number;
};

function validateEvalResult(parsed: unknown): EvalHandlerResult {
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error('Expected object');
	}

	const obj = parsed as Record<string, unknown>;

	if (typeof obj.passed !== 'boolean') {
		throw new Error('Expected "passed" to be boolean');
	}

	if (
		obj.score !== undefined &&
		(typeof obj.score !== 'number' || obj.score < 0 || obj.score > 1)
	) {
		throw new Error('Expected "score" to be number between 0 and 1');
	}

	if (typeof obj.metadata !== 'object' || obj.metadata === null) {
		throw new Error('Expected "metadata" to be object');
	}

	return {
		passed: obj.passed,
		score: obj.score as number | undefined,
		metadata: obj.metadata as Record<string, unknown>,
	};
}

/**
 * Generates an eval result using LLM with built-in JSON parsing and validation retries.
 *
 * @example
 * ```typescript
 * const result = await generateEvalResult({
 *   model: options.model,
 *   prompt: interpolatePrompt(myPrompt, { ... }),
 * });
 * // result is typed as EvalHandlerResult
 * ```
 */
export async function generateEvalResult(
	options: GenerateEvalResultOptions
): Promise<EvalHandlerResult> {
	const { model, prompt, maxRetries = 3 } = options;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const result = await generateText({ model, prompt });

		try {
			// Extract JSON from response (handles markdown code blocks)
			const jsonMatch = result.text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, result.text];
			const jsonText = jsonMatch[1]?.trim() || result.text.trim();

			const parsed = JSON.parse(jsonText);
			return validateEvalResult(parsed);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on last attempt
			if (attempt === maxRetries - 1) break;
		}
	}

	throw new Error(
		`Failed to generate valid eval result after ${maxRetries} attempts: ${lastError?.message}`
	);
}

// Infer the output type from a schema, or any if undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferSchemaOutput<T> = T extends StandardSchemaV1 ? InferOutput<T> : any;

type PresetEvalOverrides<
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
type PresetEvalResult<TOptions extends BaseEvalOptions> = CreateEvalConfig<any, any> & {
	name: string;
	options: TOptions;
};

export function createPresetEval<
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
	overrides?: PresetEvalOverrides<
		TEvalInput,
		TEvalOutput,
		TOptions,
		InferSchemaOutput<TAgentInput>,
		InferSchemaOutput<TAgentOutput>
	>
) => PresetEvalResult<TOptions> {
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
