import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';

// Simplified metadata schema for the client
const DeploymentMetadataSchema = z.object({
	origin: z
		.object({
			trigger: z.string().optional(),
			provider: z.string().optional(),
			event: z.string().optional(),
			branch: z.string().optional(),
			commit: z
				.object({
					hash: z.string(),
					message: z.string(),
					url: z.string().optional(),
					author: z
						.object({
							name: z.string().optional(),
							email: z.string().optional(),
						})
						.optional(),
				})
				.optional(),
			pr: z
				.object({
					number: z.number(),
					url: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

const DeploymentSchema = z.object({
	id: z.string(),
	state: z.string().optional(),
	message: z.string().nullable().optional(),
	tags: z.array(z.string()),
	active: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string().nullable().optional(),
	metadata: DeploymentMetadataSchema.optional(),
	customDomains: z.array(z.string()).nullable().optional(),
	cloudRegion: z.string().nullable().optional(),
});

const DeploymentListResponseSchema = APIResponseSchema(z.array(DeploymentSchema));
const DeploymentGetResponseSchema = APIResponseSchema(DeploymentSchema);
const DeploymentActionResponseSchema = APIResponseSchema(
	z
		.object({ success: z.boolean() })
		.or(z.object({ success: z.boolean(), activeDeploymentId: z.string() }))
);

export type DeploymentInfo = z.infer<typeof DeploymentSchema>;

export async function projectDeploymentList(
	client: APIClient,
	projectId: string,
	limit = 10
): Promise<DeploymentInfo[]> {
	const resp = await client.request(
		'GET',
		`/cli/project/${projectId}/deployments?limit=${limit}`,
		DeploymentListResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}

export async function projectDeploymentGet(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<DeploymentInfo> {
	const resp = await client.request(
		'GET',
		`/cli/project/${projectId}/deployments/${deploymentId}`,
		DeploymentGetResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}

export async function projectDeploymentDelete(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<void> {
	const resp = await client.request(
		'DELETE',
		`/cli/project/${projectId}/deployments/${deploymentId}`,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new Error(resp.message);
	}
}

export async function projectDeploymentRollback(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<void> {
	const resp = await client.request(
		'POST',
		`/cli/project/${projectId}/deployments/${deploymentId}/rollback`,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new Error(resp.message);
	}
}

export async function projectDeploymentUndeploy(
	client: APIClient,
	projectId: string
): Promise<void> {
	const resp = await client.request(
		'POST',
		`/cli/project/${projectId}/deployments/undeploy`,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new Error(resp.message);
	}
}
