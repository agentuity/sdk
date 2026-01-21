import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';

const EvalRunDetailSchema = z.object({
	id: z.string().describe('Eval run ID'),
	sessionId: z.string().describe('Session ID'),
	evalId: z.string().describe('Evaluation record ID'),
	evalIdentifier: z.string().nullable().describe('Stable evaluation identifier'),
	evalName: z.string().nullable().describe('Evaluation name'),
	agentIdentifier: z.string().nullable().describe('Agent identifier'),
	projectId: z.string().describe('Project ID'),
	orgId: z.string().describe('Organization ID'),
	deploymentId: z.string().nullable().describe('Deployment ID'),
	devmode: z.boolean().describe('Whether this is a devmode run'),
	pending: z.boolean().describe('Whether the eval run is pending'),
	success: z.boolean().describe('Whether the eval run succeeded'),
	error: z.string().nullable().describe('Error message if failed'),
	result: z.any().nullable().describe('Eval run result'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().describe('Last updated timestamp'),
});

const EvalRunGetResponseSchema = APIResponseSchema(EvalRunDetailSchema);

export type EvalRunDetail = z.infer<typeof EvalRunDetailSchema>;

export async function evalRunGet(client: APIClient, id: string): Promise<EvalRunDetail> {
	const resp = await client.request<z.infer<typeof EvalRunGetResponseSchema>>(
		'GET',
		`/cli/eval-run/${encodeURIComponent(id)}`,
		EvalRunGetResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new Error(resp.message || 'Failed to get eval run');
}
