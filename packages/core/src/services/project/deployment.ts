import { z } from 'zod';
import { type APIClient, APIResponseSchema, APIResponseSchemaOptionalData } from '../api.ts';
import { ProjectResponseError } from './util.ts';

// Simplified metadata schema for the client
export const DeploymentMetadataSchema = z
	.object({
		git: z
			.object({
				repo: z.string().optional().describe('Git repository URL or name.'),
				commit: z.string().optional().describe('Git commit SHA.'),
				message: z.string().optional().describe('Git commit message.'),
				branch: z.string().optional().describe('Git branch name.'),
				tags: z.array(z.string()).optional().describe('Git tags associated with the commit.'),
				pr: z.string().optional().describe('Pull request identifier.'),
				provider: z.string().optional().describe('CI/CD provider (e.g., github, gitlab).'),
				trigger: z
					.string()
					.optional()
					.describe('What triggered the deployment (e.g., push, pr, manual).'),
				url: z.string().optional().describe('URL to the source commit or repository.'),
				buildUrl: z.string().optional().describe('URL to the CI/CD build logs.'),
				event: z
					.string()
					.optional()
					.describe('Git event that triggered the build (e.g., push, pull_request).'),
				pull_request: z
					.object({
						number: z.number().describe('Pull request number.'),
						url: z.string().optional().describe('URL to the pull request.'),
					})
					.optional()
					.describe('Pull request details, if deployment was triggered by a PR.'),
			})
			.optional()
			.describe('Git metadata for the deployment source.'),
		build: z
			.object({
				bun: z.string().optional().describe('Bun runtime version used for the build.'),
				agentuity: z.string().optional().describe('Agentuity SDK version used for the build.'),
				arch: z.string().optional().describe('Build architecture (e.g., x64, arm64).'),
				platform: z.string().optional().describe('Build platform (e.g., linux, darwin).'),
			})
			.optional()
			.describe('Build environment metadata.'),
	})
	.describe('Metadata about a deployment including git and build information.');

export const DeploymentSchema = z
	.object({
		id: z.string().describe('Unique identifier for the deployment.'),
		state: z
			.string()
			.optional()
			.describe('Current state of the deployment (e.g., building, deployed, failed).'),
		message: z.string().nullable().optional().describe('Status message or error description.'),
		tags: z.array(z.string()).describe('Tags associated with the deployment.'),
		active: z.boolean().describe('Whether this is the currently active deployment.'),
		createdAt: z.string().describe('ISO 8601 timestamp when the deployment was created.'),
		updatedAt: z
			.string()
			.nullable()
			.optional()
			.describe('ISO 8601 timestamp when the deployment was last updated.'),
		metadata: DeploymentMetadataSchema.optional().describe(
			'Git and build metadata for the deployment.'
		),
		customDomains: z
			.array(z.string())
			.nullable()
			.optional()
			.describe('Custom domains configured for this deployment.'),
		cloudRegion: z
			.string()
			.nullable()
			.optional()
			.describe('Cloud region where the deployment is running.'),
		resourceDb: z
			.string()
			.nullable()
			.optional()
			.describe('Database resource identifier for the deployment.'),
		resourceStorage: z
			.string()
			.nullable()
			.optional()
			.describe('Storage resource identifier for the deployment.'),
		deploymentLogsURL: z
			.string()
			.nullable()
			.optional()
			.describe('URL to view deployment runtime logs.'),
		buildLogsURL: z.string().nullable().optional().describe('URL to view build logs.'),
		dnsRecords: z.array(z.string()).optional().describe('DNS records for the deployment.'),
	})
	.describe('Deployment information for a project.');

export const DeploymentListResponseSchema = APIResponseSchema(z.array(DeploymentSchema));
export const DeploymentGetResponseSchema = APIResponseSchema(DeploymentSchema);
export const DeploymentActionResponseSchema = APIResponseSchemaOptionalData(
	z.object({
		activeDeploymentId: z
			.string()
			.optional()
			.describe('ID of the currently active deployment after the action.'),
	})
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

export const DeploymentLookupSchema = z
	.object({
		id: z.string().describe('Unique identifier for the deployment.'),
		projectId: z.string().describe('Project ID the deployment belongs to.'),
		orgId: z.string().describe('Organization ID that owns the deployment.'),
		cloudRegion: z
			.string()
			.nullable()
			.optional()
			.describe('Cloud region where the deployment is running.'),
		state: z.string().nullable().optional().describe('Current state of the deployment.'),
		active: z.boolean().describe('Whether this is the currently active deployment.'),
	})
	.describe('Lightweight deployment lookup result.');

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

export const DeploymentLogSchema = z
	.object({
		body: z.string().describe('Log entry body content.'),
		severity: z.string().describe('Log severity level (e.g., INFO, ERROR, WARN).'),
		timestamp: z.string().describe('ISO 8601 timestamp of the log entry.'),
		spanId: z.string().describe('OpenTelemetry span ID for trace correlation.'),
		traceId: z.string().describe('OpenTelemetry trace ID for trace correlation.'),
		serviceName: z.string().describe('Name of the service that generated the log.'),
	})
	.describe('A deployment log entry.');

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
