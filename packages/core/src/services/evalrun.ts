import { z } from 'zod';

export const EvalRunStartEventSchema = z
	.object({
		id: z.string().describe('the eval run id'),
		sessionId: z.string().describe('the session id'),
		evalId: z.string().describe('the eval id'),
		orgId: z.string().describe('the organization id'),
		projectId: z.string().describe('the project id'),
		devmode: z.boolean().describe('true if running in devmode'),
	})
	.describe('The event to record an eval run started');

export type EvalRunStartEvent = z.infer<typeof EvalRunStartEventSchema>;

export const EvalRunCompleteEventSchema = z
	.object({
		id: z.string().describe('the eval run id'),
		error: z.string().optional().describe('the optional error message if the eval run failed'),
		result: z.any().optional().describe('the eval run result'),
	})
	.describe('The event to record an eval run completed');

export type EvalRunCompleteEvent = z.infer<typeof EvalRunCompleteEventSchema>;

export const EvalRunStartEventDelayedSchema = z.intersection(
	EvalRunStartEventSchema,
	z.object({ timestamp: z.number().describe('the event timestamp in epoch') })
);

export const EvalRunCompleteEventDelayedSchema = z.intersection(
	EvalRunCompleteEventSchema,
	z.object({ timestamp: z.number().describe('the event timestamp in epoch') })
);

/**
 * EvalRunEventProvider is a provider for logging and tracking agent evaluation run lifecycle events.
 * Eval runs represent test executions of agents for quality assurance and performance monitoring.
 */
export interface EvalRunEventProvider {
	/**
	 * Called when an agent evaluation run starts. Records the initial context including
	 * the evaluation ID, associated session, and organization/project metadata.
	 *
	 * @param event - EvalRunStartEvent containing evaluation initialization data
	 *
	 * @example
	 * ```typescript
	 * await evalProvider.start({
	 *   id: 'eval-run-123',
	 *   sessionId: 'session-abc',
	 *   evalId: 'eval-def',
	 *   orgId: 'org-456',
	 *   projectId: 'proj-789',
	 *   devmode: true
	 * });
	 * ```
	 */
	start(event: EvalRunStartEvent): Promise<void>;

	/**
	 * Called when an agent evaluation run completes (successfully or with error).
	 * Records final results, metrics, and any errors encountered during evaluation.
	 *
	 * @param event - EvalRunCompleteEvent containing evaluation results and status
	 *
	 * @example
	 * ```typescript
	 * // Successful evaluation completion
	 * await evalProvider.complete({
	 *   id: 'eval-run-123',
	 *   result: {
	 *     passed: true,
	 *     score: 0.95,
	 *     metrics: { latency: 250, accuracy: 0.98 }
	 *   }
	 * });
	 * 
	 * // Evaluation with error
	 * await evalProvider.complete({
	 *   id: 'eval-run-123',
	 *   error: 'Agent timeout after 30 seconds',
	 *   result: { passed: false }
	 * });
	 * ```
	 */
	complete(event: EvalRunCompleteEvent): Promise<void>;
}
