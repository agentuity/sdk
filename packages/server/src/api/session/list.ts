import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const SessionSchema = z.object({
	id: z.string().describe('the session id'),
	created_at: z.string().describe('the creation timestamp'),
	updated_at: z.string().describe('the last update timestamp'),
	deleted: z.boolean().describe('whether the session is deleted'),
	deleted_at: z.string().nullable().describe('the deletion timestamp'),
	deleted_by: z.string().nullable().describe('who deleted the session'),
	start_time: z.string().describe('the session start time'),
	end_time: z.string().nullable().describe('the session end time'),
	duration: z.number().nullable().describe('the session duration in nanoseconds'),
	org_id: z.string().describe('the organization id'),
	project_id: z.string().describe('the project id'),
	deployment_id: z.string().describe('the deployment id'),
	agent_ids: z.array(z.string()).describe('the agent ids involved'),
	trigger: z.string().describe('how the session was triggered'),
	env: z.string().describe('the environment'),
	devmode: z.boolean().describe('whether dev mode was enabled'),
	pending: z.boolean().describe('whether the session is pending'),
	success: z.boolean().describe('whether the session succeeded'),
	error: z.string().nullable().describe('the error message if failed'),
	metadata: z.string().nullable().describe('additional metadata'),
	cpu_time: z.number().nullable().describe('the CPU time in nanoseconds'),
	llm_cost: z.number().nullable().describe('the LLM cost'),
	llm_prompt_token_count: z.number().nullable().describe('the LLM prompt token count'),
	llm_completion_token_count: z.number().nullable().describe('the LLM completion token count'),
	total_cost: z.number().nullable().describe('the total cost'),
	method: z.string().describe('the HTTP method'),
	url: z.string().describe('the request URL'),
	route_id: z.string().describe('the route id'),
	thread_id: z.string().describe('the thread id'),
	timeline: z.unknown().nullable().optional().describe('the session timeline tree'),
});

export { SessionSchema };

const SessionListResponse = z.array(SessionSchema);

const SessionListResponseSchema = APIResponseSchema(SessionListResponse);

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
export type SessionList = z.infer<typeof SessionListResponse>;
export type Session = z.infer<typeof SessionSchema>;

export interface SessionListOptions {
	count?: number;
	projectId?: string;
	deploymentId?: string;
	trigger?: string;
	env?: string;
	devmode?: boolean;
	success?: boolean;
	threadId?: string;
	agentIdentifier?: string;
	startAfter?: string;
	startBefore?: string;
}

/**
 * List sessions
 *
 * @param client
 * @param options filtering and pagination options
 * @returns
 */
export async function sessionList(
	client: APIClient,
	options: SessionListOptions = {}
): Promise<SessionList> {
	const {
		count = 10,
		projectId,
		deploymentId,
		trigger,
		env,
		devmode,
		success,
		threadId,
		agentIdentifier,
		startAfter,
		startBefore,
	} = options;
	const params = new URLSearchParams({ count: count.toString() });
	if (projectId) params.set('projectId', projectId);
	if (deploymentId) params.set('deploymentId', deploymentId);
	if (trigger) params.set('trigger', trigger);
	if (env) params.set('env', env);
	if (devmode !== undefined) params.set('devmode', devmode.toString());
	if (success !== undefined) params.set('success', success.toString());
	if (threadId) params.set('threadId', threadId);
	if (agentIdentifier) params.set('agentIdentifier', agentIdentifier);
	if (startAfter) params.set('startAfter', startAfter);
	if (startBefore) params.set('startBefore', startBefore);

	const resp = await client.request<SessionListResponse>(
		'GET',
		`/session/2025-03-17?${params.toString()}`,
		SessionListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message);
}
