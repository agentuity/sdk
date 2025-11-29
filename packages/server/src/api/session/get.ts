import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SessionSchema } from './list';
import { SessionResponseError } from './util';

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

export interface SpanNode {
	id: string;
	duration: number;
	operation: string;
	attributes: Record<string, unknown>;
	children?: SpanNode[];
}

const SpanNodeSchema: z.ZodType<SpanNode> = z.lazy(() =>
	z.object({
		id: z.string().describe('span ID'),
		duration: z.number().describe('duration in milliseconds'),
		operation: z.string().describe('operation name'),
		attributes: z.record(z.string(), z.unknown()).describe('span attributes'),
		children: z.array(SpanNodeSchema).optional().describe('child spans'),
	})
);

const RouteInfoSchema = z
	.object({
		id: z.string().describe('route id'),
		method: z.string().describe('HTTP method'),
		path: z.string().describe('route path'),
	})
	.nullable();

const AgentInfoSchema = z.object({
	name: z.string().describe('agent name'),
	identifier: z.string().describe('agent identifier'),
});

const EnrichedSessionDataSchema = z.object({
	session: SessionSchema,
	agents: z.array(AgentInfoSchema).describe('resolved agents'),
	eval_runs: z.array(EvalRunSchema).describe('eval runs for this session'),
	route: RouteInfoSchema.describe('route information'),
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
export type RouteInfo = z.infer<typeof RouteInfoSchema>;
export type AgentInfo = z.infer<typeof AgentInfoSchema>;
export type EnrichedSession = {
	session: Session;
	agents: AgentInfo[];
	evalRuns: EvalRun[];
	timeline: SpanNode | null;
	route: RouteInfo;
};

export async function sessionGet(
	client: APIClient,
	request: SessionGetRequest
): Promise<EnrichedSession> {
	const resp = await client.request<SessionGetResponse>(
		'GET',
		`/session/2025-03-17/${request.id}`,
		SessionGetResponseSchema
	);

	if (resp.success) {
		return {
			session: resp.data.session,
			agents: resp.data.agents,
			evalRuns: resp.data.eval_runs,
			timeline: (resp.data.session.timeline as SpanNode) ?? null,
			route: resp.data.route,
		};
	}

	throw new SessionResponseError({ message: resp.message });
}
