import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api.ts';
import { SessionResponseError } from './util.ts';

export const _SessionLogsRequestSchema = z.object({
	id: z.string().describe('the session id'),
});

export const LogSchema = z.object({
	body: z.string().describe('the log body'),
	severity: z.string().describe('the log severity'),
	timestamp: z.string().describe('the log timestamp'),
});

export const SessionLogsResponse = z.array(LogSchema);

export const SessionLogsResponseSchema = APIResponseSchema(SessionLogsResponse);

type SessionLogsRequest = z.infer<typeof _SessionLogsRequestSchema>;
type SessionLogsResponse = z.infer<typeof SessionLogsResponseSchema>;

export type SessionLog = z.infer<typeof LogSchema>;
export type SessionLogs = SessionLog[];

/**
 * Get logs for a session from the App API
 *
 * @param client APIClient configured for the App API base URL
 * @param request
 * @returns
 */
export async function sessionLogs(
	client: APIClient,
	request: SessionLogsRequest
): Promise<SessionLogs> {
	const resp = await client.request<SessionLogsResponse>(
		'GET',
		`/cli/session/${request.id}/logs`,
		SessionLogsResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SessionResponseError({ message: resp.message });
}
