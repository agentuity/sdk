import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaOptionalData } from '../api';
import { ProjectResponseError } from './util';

// Simplified metadata schema for the client
const DeploymentMetadataSchema = z.object({
	git: z
		.object({
			repo: z.string().optional(),
			commit: z.string().optional(),
			message: z.string().optional(),
			branch: z.string().optional(),
			tags: z.array(z.string()).optional(),
			pr: z.string().optional(),
			provider: z.string().optional(),
			trigger: z.string().optional(),
			url: z.string().optional(),
			buildUrl: z.string().optional(),
			event: z.string().optional(),
			pull_request: z
				.object({
					number: z.number(),
					url: z.string().optional(),
					commentId: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	build: z
		.object({
			bun: z.string().optional(),
			agentuity: z.string().optional(),
			arch: z.string().optional(),
			platform: z.string().optional(),
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
const DeploymentActionResponseSchema = APIResponseSchemaOptionalData(
	z.object({ activeDeploymentId: z.string().optional() })
);

export type DeploymentInfo = z.infer<typeof DeploymentSchema>;

export async function projectDeploymentList(
	client: APIClient,
	projectId: string,
	limit = 10
): Promise<DeploymentInfo[]> {
	const resp = await client.get(
		`/cli/project/${projectId}/deployments?limit=${limit}`,
		DeploymentListResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new ProjectResponseError({ message: resp.message });
}

export async function projectDeploymentGet(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<DeploymentInfo> {
	const resp = await client.get(
		`/cli/project/${projectId}/deployments/${deploymentId}`,
		DeploymentGetResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new ProjectResponseError({ message: resp.message });
}

export async function projectDeploymentDelete(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<void> {
	const resp = await client.delete(
		`/cli/project/${projectId}/deployments/${deploymentId}`,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new ProjectResponseError({ message: resp.message });
	}
}

export async function projectDeploymentRollback(
	client: APIClient,
	projectId: string,
	deploymentId: string
): Promise<void> {
	const resp = await client.post(
		`/cli/project/${projectId}/deployments/${deploymentId}/rollback`,
		undefined,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new ProjectResponseError({ message: resp.message });
	}
}

export async function projectDeploymentUndeploy(
	client: APIClient,
	projectId: string
): Promise<void> {
	const resp = await client.post(
		`/cli/project/${projectId}/deployments/undeploy`,
		undefined,
		DeploymentActionResponseSchema
	);
	if (!resp.success) {
		throw new ProjectResponseError({ message: resp.message });
	}
}

export const DeploymentLogSchema = z.object({
	body: z.string(),
	severity: z.string(),
	timestamp: z.string(),
	spanId: z.string(),
	traceId: z.string(),
	serviceName: z.string(),
});

const DeploymentLogsResponseSchema = APIResponseSchema(z.array(DeploymentLogSchema));

export type DeploymentLog = z.infer<typeof DeploymentLogSchema>;

export async function projectDeploymentLogs(
	client: APIClient,
	projectId: string,
	deploymentId: string,
	limit = 100
): Promise<DeploymentLog[]> {
	const resp = await client.get(
		`/cli/project/${projectId}/deployments/${deploymentId}/logs?limit=${limit}`,
		DeploymentLogsResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new ProjectResponseError({ message: resp.message });
}
