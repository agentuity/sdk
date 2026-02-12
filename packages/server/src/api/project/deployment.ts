import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaOptionalData } from '../api';
import { ProjectResponseError } from './util';

// Simplified metadata schema for the client
export const DeploymentMetadataSchema = z.object({
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

export const DeploymentSchema = z.object({
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
	resourceDb: z.string().nullable().optional(),
	resourceStorage: z.string().nullable().optional(),
	deploymentLogsURL: z.string().nullable().optional(),
	buildLogsURL: z.string().nullable().optional(),
	dnsRecords: z.array(z.string()).optional(),
});

export const DeploymentListResponseSchema = APIResponseSchema(z.array(DeploymentSchema));
export const DeploymentGetResponseSchema = APIResponseSchema(DeploymentSchema);
export const DeploymentActionResponseSchema = APIResponseSchemaOptionalData(
	z.object({ activeDeploymentId: z.string().optional() })
);

export type DeploymentInfo = z.infer<typeof DeploymentSchema>;

export async function projectDeploymentList(
	client: APIClient,
	projectId: string,
	limit = 10,
	options?: { orgId?: string }
): Promise<DeploymentInfo[]> {
	const params = new URLSearchParams({ limit: String(limit) });
	if (options?.orgId) params.set('orgId', options.orgId);
	const resp = await client.get(
		`/cli/project/${projectId}/deployments?${params.toString()}`,
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

export const DeploymentLookupSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	orgId: z.string(),
	cloudRegion: z.string().nullable().optional(),
	state: z.string().nullable().optional(),
	active: z.boolean(),
});

export const DeploymentLookupResponseSchema = APIResponseSchema(DeploymentLookupSchema);

export type DeploymentLookup = z.infer<typeof DeploymentLookupSchema>;

/**
 * Get deployment info by ID only (without requiring project ID).
 * Useful for looking up region/project info for a deployment.
 */
export async function deploymentGet(
	client: APIClient,
	deploymentId: string
): Promise<DeploymentLookup> {
	const resp = await client.get(`/cli/deployment/${deploymentId}`, DeploymentLookupResponseSchema);
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

export const DeploymentLogsResponseSchema = APIResponseSchema(z.array(DeploymentLogSchema));

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
