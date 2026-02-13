import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';

export const EvalRunSchema = z.object({
	id: z.string().describe('Eval run ID'),
	sessionId: z.string().describe('Session ID'),
	evalId: z.string().describe('Evaluation record ID'),
	evalIdentifier: z.string().nullable().describe('Stable evaluation identifier'),
	evalName: z.string().nullable().describe('Evaluation name'),
	agentIdentifier: z.string().nullable().describe('Agent identifier'),
	projectId: z.string().describe('Project ID'),
	deploymentId: z.string().nullable().describe('Deployment ID'),
	devmode: z.boolean().describe('Whether this is a devmode run'),
	pending: z.boolean().describe('Whether the eval run is pending'),
	success: z.boolean().describe('Whether the eval run succeeded'),
	error: z.string().nullable().describe('Error message if failed'),
	result: z.any().nullable().describe('Eval run result'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().describe('Last updated timestamp'),
});

export const EvalRunListResponseData = z.array(EvalRunSchema);
export const EvalRunListResponseSchema = APIResponseSchema(EvalRunListResponseData);

export type EvalRunListItem = z.infer<typeof EvalRunSchema>;
export type EvalRunListRequest = {
	projectId?: string;
	agentId?: string;
	evalId?: string;
	sessionId?: string;
	orgId?: string;
};

export async function evalRunList(
	client: APIClient,
	request: EvalRunListRequest = {}
): Promise<EvalRunListItem[]> {
	const params = new URLSearchParams();
	if (request.orgId) params.set('orgId', request.orgId);
	if (request.projectId) params.set('projectId', request.projectId);
	if (request.agentId) params.set('agentId', request.agentId);
	if (request.evalId) params.set('evalId', request.evalId);
	if (request.sessionId) params.set('sessionId', request.sessionId);

	const queryString = params.toString();
	const url = `/cli/eval-run${queryString ? `?${queryString}` : ''}`;

	const resp = await client.request<z.infer<typeof EvalRunListResponseSchema>>(
		'GET',
		url,
		EvalRunListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message || 'Failed to list eval runs');
}
