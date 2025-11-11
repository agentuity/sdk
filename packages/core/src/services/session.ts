import { z } from 'zod';

export const SessionStartEventSchema = z
	.object({
		id: z.string().describe('the session id'),
		threadId: z.string().describe('the thread id'),
		orgId: z.string().describe('the organization id'),
		projectId: z.string().describe('the project id'),
		deploymentId: z.string().optional().describe('the deployment id'),
		routeId: z.string().describe('the route id'),
		environment: z.string().describe('the environment (AGENTUITY_ENVIRONMENT)'),
		devmode: z.boolean().describe('true if running in devmode'),
		url: z.string().describe('the url for the session event'),
		method: z.string().describe('the method for the session event'),
		trigger: z
			.enum(['agent', 'api', 'email', 'sms', 'cron', 'manual'])
			.describe('how the session was triggered'),
	})
	.describe('The event to record a session started');

export type SessionStartEvent = z.infer<typeof SessionStartEventSchema>;

export const SessionCompleteEventSchema = z
	.object({
		id: z.string().describe('the session id'),
		error: z.string().optional().describe('the optional error message if the session failed'),
		agentIds: z
			.array(z.string())
			.optional()
			.describe('optional array of ids for the agents that executed for the session'),
		statusCode: z.number().describe('the HTTP status code'),
	})
	.describe('The event to record a session completed successfully');

export type SessionCompleteEvent = z.infer<typeof SessionCompleteEventSchema>;

export const SessionStartEventDelayedSchema = z.intersection(
	SessionStartEventSchema,
	z.object({ timestamp: z.int().describe('the event timestamp in epoch') })
);

export const SessionCompleteEventDelayedSchema = z.intersection(
	SessionCompleteEventSchema,
	z.object({ timestamp: z.int().describe('the event timestamp in epoch') })
);

/**
 * SessionEventProvider is a provider for logging session events
 */
export interface SessionEventProvider {
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	start(event: SessionStartEvent): Promise<void>;

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	complete(event: SessionCompleteEvent): Promise<void>;
}
