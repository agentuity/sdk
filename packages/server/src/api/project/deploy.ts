import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';

export const Resources = z.object({
	memory: z.string().default('500Mi').describe('The memory requirements'),
	cpu: z.string().default('500m').describe('The CPU requirements'),
	disk: z.string().default('500Mi').describe('The disk requirements'),
	db: z.string().optional().describe('the name of the database to use'),
	storage: z.string().optional().describe('the name of the storage bucket to use'),
});

export const Mode = z.object({
	type: z
		.enum(['on-demand', 'provisioned'])
		.default('on-demand')
		.describe('on-demand or provisioned'),
	idle: z.string().optional().describe('duration in seconds if on-demand'),
});

export const Deployment = z.object({
	resources: Resources.optional().describe('the resource requirements for your deployed project'),
	mode: Mode.optional().describe('the provisioning mode for the project'),
	dependencies: z
		.array(z.string().describe('APT dependencies to install prior to launching your project'))
		.optional(),
	domains: z.array(z.string().describe('the custom domain')).optional(),
});

const BaseFileFields = {
	filename: z.string().describe('the relative path for the file'),
	version: z.string().describe('the SHA256 content of the file'),
	identifier: z.string().describe('the folder for the file'),
};

const EvalSchema = z.object({
	...BaseFileFields,
	id: z.string().describe('the unique calculated id for the eval'),
	evalId: z.string().describe('the unique id for eval for the project across deployments'),
	name: z.string().describe('the name of the eval'),
	description: z.string().optional().describe('the eval description'),
	agentIdentifier: z.string().describe('the identifier of the agent'),
	projectId: z.string().describe('the project id'),
});

const BaseAgentFields = {
	...BaseFileFields,
	id: z.string().describe('the unique calculated id for the agent'),
	agentId: z.string().describe('the unique id for agent for the project across deployments'),
	projectId: z.string().describe('the project id'),
	name: z.string().describe('the name of the agent'),
	description: z.string().optional().describe('the agent description'),
	evals: z.array(EvalSchema).optional().describe('the evals for the agent'),
};

const AgentSchema = z.object({
	...BaseAgentFields,
	subagents: z.array(z.object(BaseAgentFields)).optional().describe('subagents of this agent'),
});

export const BuildMetadataSchema = z.object({
	routes: z.array(
		z.object({
			id: z.string().describe('the unique calculated id for the route'),
			filename: z.string().describe('the relative path for the file'),
			path: z.string().describe('the route path'),
			method: z.enum(['get', 'post', 'put', 'delete', 'patch']).describe('the HTTP method'),
			version: z.string().describe('the SHA256 content of the file'),
			type: z.enum(['api', 'sms', 'email', 'cron', 'websocket', 'sse', 'stream']),
			agentIds: z
				.array(z.string())
				.optional()
				.describe('the agent ids associated with this route'),
			config: z
				.record(z.string(), z.unknown())
				.optional()
				.describe('type specific configuration'),
		})
	),
	agents: z.array(AgentSchema),
	assets: z.array(
		z.object({
			filename: z.string().describe('the relative path for the file'),
			kind: z.string().describe('the type of asset'),
			contentType: z.string().describe('the content-type for the file'),
			size: z.number().describe('the size in bytes for the file'),
		})
	),
	project: z.object({
		id: z.string().describe('the project id'),
		name: z.string().describe('the name of the project (from package.json)'),
		version: z.string().optional().describe('the version of the project (from package.json)'),
		orgId: z.string().describe('the organization id for the project'),
	}),
	deployment: z.intersection(
		Deployment,
		z.object({
			id: z.string().describe('the deployment id'),
			date: z.string().describe('the date the deployment was created in UTC format'),
			git: z
				.object({
					repo: z.string().optional().describe('the repository name'),
					commit: z.string().optional().describe('the git commit sha'),
					message: z.string().optional().describe('the git commit message'),
					branch: z.string().optional().describe('the git branch'),
					tags: z.array(z.string()).optional().describe('the tags for the current branch'),
					pr: z.string().optional().describe('the pull request number'),
					provider: z.string().optional().describe('the CI provider'),
					trigger: z
						.string()
						.default('cli')
						.optional()
						.describe('the trigger that caused the build'),
					url: z.url().optional().describe('the url to the commit for the CI provider'),
					buildUrl: z.url().optional().describe('the url to the build for the CI provider'),
					event: z
						.enum(['pull_request', 'push', 'manual', 'workflow'])
						.default('manual')
						.optional()
						.describe(
							'The type of Git-related event that triggered the deployment: pull_request (A pull request or merge request was opened, updated, or merged), push (A commit was pushed directly to a branch), manual (A deployment was triggered manually via CLI or a button), workflow (A deployment was triggered by an automated workflow, such as a CI pipeline)'
						),
					pull_request: z
						.object({
							number: z.number(),
							url: z.string().optional(),
							commentId: z.string().optional(),
						})
						.optional()
						.describe(
							'This is only present when the deployment was triggered via a pull request.'
						),
				})
				.optional()
				.describe('git commit information'),
			build: z.object({
				bun: z.string().describe('the version of bun that was used to build the deployment'),
				agentuity: z.string().describe('the version of the agentuity runtime'),
				arch: z.string().describe('the machine architecture'),
				platform: z.string().describe('the machine os platform'),
			}),
		})
	),
});

export type BuildMetadata = z.infer<typeof BuildMetadataSchema>;

const CreateProjectDeployment = z.object({
	id: z.string().describe('the unique id for the deployment'),
	orgId: z.string().describe('the organization id'),
	publicKey: z.string().describe('the public key to use for encrypting the deployment'),
});

const CreateProjectDeploymentSchema = APIResponseSchema(CreateProjectDeployment);

type CreateProjectDeploymentPayload = z.infer<typeof CreateProjectDeploymentSchema>;

export type Deployment = z.infer<typeof CreateProjectDeployment>;

/**
 * Create a new project deployment
 *
 * @param client
 * @param projectId
 * @returns
 */
export async function projectDeploymentCreate(
	client: APIClient,
	projectId: string,
	deploymentConfig?: z.infer<typeof Deployment>
): Promise<Deployment> {
	const resp = await client.request<CreateProjectDeploymentPayload>(
		'POST',
		`/cli/deploy/1/start/${projectId}`,
		CreateProjectDeploymentSchema,
		deploymentConfig ?? {}
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}

const DeploymentInstructionsObject = z.object({
	deployment: z.string().describe('the url for uploading the encrypted deployment archive'),
	assets: z
		.record(
			z.string().describe('the asset id'),
			z.string().describe('the url for the asset upload')
		)
		.describe('the upload metadata for public assets'),
});

const DeploymentInstructionsSchema = APIResponseSchema(DeploymentInstructionsObject);

type DeploymentInstructionsResponse = z.infer<typeof DeploymentInstructionsSchema>;
export type DeploymentInstructions = z.infer<typeof DeploymentInstructionsObject>;

/**
 * Update the deployment with the build metadata
 *
 * @param client
 * @param deploymentId
 * @returns
 */
export async function projectDeploymentUpdate(
	client: APIClient,
	deploymentId: string,
	deployment: BuildMetadata
): Promise<DeploymentInstructions> {
	const resp = await client.request<DeploymentInstructionsResponse, BuildMetadata>(
		'PUT',
		`/cli/deploy/1/start/${deploymentId}`,
		DeploymentInstructionsSchema,
		deployment,
		BuildMetadataSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}

const DeploymentCompleteObject = z.object({
	publicUrls: z
		.object({
			latest: z.url().describe('the public url for the latest deployment'),
			deployment: z.url().describe('the public url for this deployment'),
			custom: z.array(z.string().describe('the custom domain')),
		})
		.describe('the map of public urls'),
});

const DeploymentCompleteObjectSchema = APIResponseSchema(DeploymentCompleteObject);

type DeploymentCompleteResponse = z.infer<typeof DeploymentCompleteObjectSchema>;
export type DeploymentComplete = z.infer<typeof DeploymentCompleteObject>;

/**
 * Complete the deployment once build is uploaded
 *
 * @param client
 * @param deploymentId
 * @returns
 */
export async function projectDeploymentComplete(
	client: APIClient,
	deploymentId: string
): Promise<DeploymentComplete> {
	const resp = await client.request<DeploymentCompleteResponse>(
		'POST',
		`/cli/deploy/1/complete/${deploymentId}`,
		DeploymentCompleteObjectSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message);
}
