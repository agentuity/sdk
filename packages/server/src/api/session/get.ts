import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SessionSchema } from './list';

const _SessionGetRequestSchema = z.object({
	id: z.string().describe('the session id'),
});

const EvalRunSchema = z.object({
	id: z.string().describe('eval run id'),
	created_at: z.string().describe('creation timestamp'),
	eval_id: z.string().describe('evaluation id'),
	pending: z.boolean().describe('pending status'),
	success: z.boolean().describe('success status'),
	error: z.string().nullable().describe('error message'),
	result: z.string().nullable().describe('result JSON'),
});

const EnrichedSessionDataSchema = z.object({
	session: SessionSchema,
	agent_names: z.array(z.string()).describe('resolved agent names'),
	eval_runs: z.array(EvalRunSchema).describe('eval runs for this session'),
});

const SessionGetResponseSchema = APIResponseSchema(EnrichedSessionDataSchema);

type SessionGetRequest = z.infer<typeof _SessionGetRequestSchema>;
type SessionGetResponse = z.infer<typeof SessionGetResponseSchema>;

export type Session = z.infer<typeof SessionSchema>;

/**
 * Get a single session by id
 *
 * @param client
 * @param request
 * @returns
 */
export type EvalRun = z.infer<typeof EvalRunSchema>;
export type EnrichedSession = {
	session: Session;
	agentNames: string[];
	evalRuns: EvalRun[];
};

export async function sessionGet(client: APIClient, request: SessionGetRequest): Promise<EnrichedSession> {
	const resp = await client.request<SessionGetResponse>(
		'GET',
		`/session/2025-03-17/${request.id}`,
		SessionGetResponseSchema
	);

	if (resp.success) {
		return {
			session: resp.data.session,
			agentNames: resp.data.agent_names,
			evalRuns: resp.data.eval_runs,
		};
	}

	throw new Error(resp.message);
}
