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
 * EvalRunEventProvider is a provider for logging eval run events
 */
export interface EvalRunEventProvider {
	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	start(event: EvalRunStartEvent): Promise<void>;

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	complete(event: EvalRunCompleteEvent): Promise<void>;
}
