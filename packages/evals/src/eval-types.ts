/**
 * Eval types — local definitions for the evals package.
 *
 * These were previously imported from @agentuity/runtime but are now
 * defined locally since the runtime is deprecated. When evals is
 * rewritten, these types will be redesigned from scratch.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InferOutput, StandardSchemaV1 } from '@agentuity/core';
import { z } from 'zod';

/**
 * Minimal logger interface used by eval handlers.
 */
export interface EvalLogger {
	warn(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	debug(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Context passed to eval handlers.
 * In the v2 runtime this was `AgentContext<any, any, any>`.
 * Simplified to just what eval handlers actually use.
 */
export interface EvalContext {
	logger: EvalLogger;
	[key: string]: any;
}

/**
 * Schema for eval handler results.
 */
export const EvalHandlerResultSchema = z.object({
	passed: z.boolean(),
	score: z.number().min(0).max(1).optional(),
	reason: z.string().optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Result returned by an eval handler.
 */
export type EvalHandlerResult = z.infer<typeof EvalHandlerResultSchema>;

/**
 * Eval handler function signature.
 */
export type EvalFunction<TInput = any, TOutput = any> = [TInput] extends [undefined]
	? [TOutput] extends [undefined]
		? (ctx: EvalContext) => Promise<EvalHandlerResult>
		: (ctx: EvalContext, output: TOutput) => Promise<EvalHandlerResult>
	: [TOutput] extends [undefined]
		? (ctx: EvalContext, input: TInput) => Promise<EvalHandlerResult>
		: (ctx: EvalContext, input: TInput, output: TOutput) => Promise<EvalHandlerResult>;

/**
 * Configuration for creating an eval.
 */
export interface CreateEvalConfig<
	TInput extends StandardSchemaV1 | undefined = any,
	TOutput extends StandardSchemaV1 | undefined = any,
> {
	description?: string;
	handler: EvalFunction<
		TInput extends StandardSchemaV1 ? InferOutput<TInput> : undefined,
		TOutput extends StandardSchemaV1 ? InferOutput<TOutput> : undefined
	>;
}
