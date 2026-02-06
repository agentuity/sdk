import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

export const EvaluationDetailSchema = z.object({
	id: z.string().describe('Evaluation ID'),
	name: z.string().describe('Evaluation name'),
	description: z.string().nullable().describe('Evaluation description'),
	identifier: z.string().nullable().describe('Stable evaluation identifier'),
	agentIdentifier: z.string().describe('Agent identifier'),
	projectId: z.string().describe('Project ID'),
	orgId: z.string().describe('Organization ID'),
	devmode: z.boolean().describe('Whether this is a devmode evaluation'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().describe('Last updated timestamp'),
});

const EvalGetResponseSchema = APIResponseSchema(EvaluationDetailSchema);

export type EvaluationDetail = z.infer<typeof EvaluationDetailSchema>;

export async function evalGet(client: APIClient, id: string): Promise<EvaluationDetail> {
	const resp = await client.request<z.infer<typeof EvalGetResponseSchema>>(
		'GET',
		`/cli/eval/${encodeURIComponent(id)}`,
		EvalGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message || 'Failed to get evaluation');
}
