import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';

export const EvaluationSchema = z.object({
	id: z.string().describe('Evaluation ID'),
	name: z.string().describe('Evaluation name'),
	description: z.string().nullable().describe('Evaluation description'),
	identifier: z.string().nullable().describe('Stable evaluation identifier'),
	agentIdentifier: z.string().describe('Agent identifier'),
	projectId: z.string().describe('Project ID'),
	devmode: z.boolean().describe('Whether this is a devmode evaluation'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().describe('Last updated timestamp'),
});

export const EvalListResponseData = z.array(EvaluationSchema);
export const EvalListResponseSchema = APIResponseSchema(EvalListResponseData);

export type Evaluation = z.infer<typeof EvaluationSchema>;
export type EvaluationListRequest = {
	projectId?: string;
	agentId?: string;
};

export async function evalList(
	client: APIClient,
	request: EvaluationListRequest = {}
): Promise<Evaluation[]> {
	const params = new URLSearchParams();
	if (request.projectId) params.set('projectId', request.projectId);
	if (request.agentId) params.set('agentId', request.agentId);

	const queryString = params.toString();
	const url = `/cli/eval${queryString ? `?${queryString}` : ''}`;

	const resp = await client.request<z.infer<typeof EvalListResponseSchema>>(
		'GET',
		url,
		EvalListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message || 'Failed to list evaluations');
}
