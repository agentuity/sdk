/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1 } from '@agentuity/core';
import type { AgentContext } from './agent';

// Eval SDK types
export type EvalContext = AgentContext;

export type EvalRunResultMetadata = {
	reason: string;
	// biome-ignore lint/suspicious/noExplicitAny: metadata can contain any type of data
	[key: string]: any;
};

export type EvalRunResultBinary = {
	success: true;
	passed: boolean;
	metadata: EvalRunResultMetadata;
};

export type EvalRunResultScore = {
	success: true;
	score: number; // 0-1 range
	metadata: EvalRunResultMetadata;
};

export type EvalRunResultError = {
	success: false;
	error: string;
};

export type EvalRunResult = EvalRunResultBinary | EvalRunResultScore | EvalRunResultError;

export type CreateEvalRunRequest = {
	projectId: string;
	sessionId: string;
	spanId: string;
	result: EvalRunResult;
	evalId: string;
	promptHash?: string;
};

type InternalEvalMetadata = {
	/**
	 * the unique identifier for this eval and project
	 */
	id: string;
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

type InferSchemaInput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferInput<T> : any;
type InferSchemaOutput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> : any;

export type EvalFunction<TInput = any, TOutput = any> = TInput extends undefined
	? TOutput extends undefined
		? (ctx: EvalContext) => Promise<EvalRunResult>
		: (ctx: EvalContext, output: TOutput) => Promise<EvalRunResult>
	: TOutput extends undefined
		? (ctx: EvalContext, input: TInput) => Promise<EvalRunResult>
		: (ctx: EvalContext, input: TInput, output: TOutput) => Promise<EvalRunResult>;

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
