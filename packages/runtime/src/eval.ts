/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1, InferInput, InferOutput } from '@agentuity/core';
import type { AgentContext } from './agent';
import { z } from 'zod';

// Eval SDK types
export type EvalContext = AgentContext<any, any, any>;

export type EvalRunResultMetadata = {
	// biome-ignore lint/suspicious/noExplicitAny: metadata can contain any type of data
	[key: string]: any;
};

export const EvalHandlerResultSchema = z.object({
	passed: z.boolean(),
	score: z.number().min(0).max(1).optional(),
	metadata: z.record(z.string(), z.any()),
});

export type EvalHandlerResult = z.infer<typeof EvalHandlerResultSchema>;

// Internal types for catalyst (include success field)
export const EvalRunResultSuccessSchema = z.object({
	success: z.literal(true),
	passed: z.boolean(),
	score: z.number().min(0).max(1).optional(),
	metadata: z.record(z.string(), z.any()),
});

export type EvalRunResultSuccess = z.infer<typeof EvalRunResultSuccessSchema>;

export type EvalRunResultError = {
	success: false;
	error: string;
};

export type EvalRunResult = EvalRunResultSuccess | EvalRunResultError;

export type CreateEvalRunRequest = {
	projectId: string;
	sessionId: string;
	result: EvalRunResult;
	evalId: string;
	promptHash?: string;
	deploymentId?: string;
};

type InternalEvalMetadata = {
	/**
	 * the unique identifier for this eval and project
	 */
	id: string;
	/**
	 * the unique identifier for this project and eval across multiple deployments.
	 */
	evalId: string;
	/**
	 * the folder name for the eval
	 */
	identifier: string;
	/**
	 * the relative path to the eval from the root project directory
	 */
	filename: string;
	/**
	 * a unique version for the eval. computed as the SHA256 contents of the file.
	 */
	version: string;
};

export type ExternalEvalMetadata = {
	/**
	 * the human readable name for the eval (identifier is used if not specified)
	 */
	name: string;
	/**
	 * the human readable description for the eval (empty if not provided)
	 */
	description: string;
};

export type EvalMetadata = InternalEvalMetadata & ExternalEvalMetadata;

type InferSchemaInput<T> = T extends StandardSchemaV1 ? InferInput<T> : any;
type InferSchemaOutput<T> = T extends StandardSchemaV1 ? InferOutput<T> : any;

export type EvalFunction<TInput = any, TOutput = any> = [TInput] extends [undefined]
	? [TOutput] extends [undefined]
		? (ctx: EvalContext) => Promise<EvalHandlerResult>
		: (ctx: EvalContext, output: TOutput) => Promise<EvalHandlerResult>
	: [TOutput] extends [undefined]
		? (ctx: EvalContext, input: TInput) => Promise<EvalHandlerResult>
		: (ctx: EvalContext, input: TInput, output: TOutput) => Promise<EvalHandlerResult>;

/**
 * The Eval handler interface.
 */
export type Eval<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> = {
	metadata: EvalMetadata;
	handler: EvalFunction<InferSchemaInput<TInput>, InferSchemaOutput<TOutput>>;
} & (TInput extends StandardSchemaV1 ? { inputSchema: TInput } : { inputSchema?: never }) &
	(TOutput extends StandardSchemaV1 ? { outputSchema: TOutput } : { outputSchema?: never });
