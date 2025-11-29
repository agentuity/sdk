import { z } from 'zod';
import type { APIClient } from '../api';
import { APIResponseSchema } from '../api';
import { AgentNotFoundError, ProjectResponseError } from './util';

const AgentSchema = z.object({
	id: z.string().describe('Agent ID (same as identifier)'),
	name: z.string().describe('Agent name'),
	description: z.string().nullable().describe('Agent description'),
	identifier: z.string().describe('Agent identifier'),
	deploymentId: z.string().nullable().describe('Deployment ID'),
	devmode: z.boolean().describe('Whether agent is in development mode'),
	metadata: z.record(z.string(), z.unknown()).nullable().describe('Agent metadata'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().describe('Last update timestamp'),
	evals: z
		.array(
			z.object({
				id: z.string().describe('Evaluation ID'),
				name: z.string().describe('Evaluation name'),
				description: z.string().nullable().describe('Evaluation description'),
				identifier: z.string().nullable().describe('Evaluation identifier'),
				devmode: z.boolean().describe('Whether evaluation is in development mode'),
				createdAt: z.string().describe('Creation timestamp'),
				updatedAt: z.string().describe('Last update timestamp'),
			})
		)
		.describe('Associated evaluations'),
});

const AgentListResponseSchema = APIResponseSchema(z.array(AgentSchema));
const AgentGetResponseSchema = APIResponseSchema(z.array(AgentSchema));

export type Agent = z.infer<typeof AgentSchema>;

/**
 * List agents for a project
 */
export async function projectAgentList(
	client: APIClient,
	projectId: string,
	options?: {
		deploymentId?: string;
	}
): Promise<Agent[]> {
	const queryParams = new URLSearchParams();
	if (options?.deploymentId) {
		queryParams.set('deploymentId', options.deploymentId);
	}

	const url = `/cli/agent/${projectId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

	const resp = await client.request('GET', url, AgentListResponseSchema);

	if (resp.success) {
		return resp.data;
	}
	throw new ProjectResponseError({ message: resp.message });
}

/**
 * Get a specific agent by identifier
 */
export async function projectAgentGet(
	client: APIClient,
	projectId: string,
	agentId: string
): Promise<Agent> {
	const resp = await client.request(
		'GET',
		`/cli/agent/${projectId}?identifier=${agentId}`,
		AgentGetResponseSchema
	);

	if (resp.success) {
		if (resp.data.length === 0) {
			throw new AgentNotFoundError({ id: agentId, message: `Agent not found: ${agentId}` });
		}
		return resp.data[0];
	}
	throw new ProjectResponseError({ message: resp.message });
}
