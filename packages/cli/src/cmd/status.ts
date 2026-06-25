import { projectDeploymentList, projectGet } from '@agentuity/server';
import { z } from 'zod';
import { APIClient, getAPIBaseURL } from '../api.ts';
import { getCommand } from '../command-prefix.ts';
import { getAuth, loadProjectConfig } from '../config.ts';
import { detectFrameworkWithPackageJson } from './build/detect/index.ts';
import { isJSONMode } from '../output.ts';
import * as tui from '../tui.ts';
import { createCommand } from '../types.ts';

const StatusResponseSchema = z.object({
	ok: z.boolean().describe('Whether the project appears ready and healthy'),
	authenticated: z.boolean().describe('Whether CLI authentication is available'),
	project: z
		.object({
			id: z.string().optional().describe('Project ID'),
			name: z.string().optional().describe('Project name'),
			orgId: z.string().optional().describe('Organization ID'),
			region: z.string().optional().describe('Cloud region'),
			dashboardUrl: z.string().optional().describe('Dashboard URL for the project'),
			appUrl: z.string().optional().describe('Latest deployment app URL'),
			source: z.enum(['flag', 'global-option', 'local-config']).describe('Project ID source'),
		})
		.optional()
		.describe('Linked project summary'),
	framework: z
		.object({
			name: z.string().optional().describe('Detected framework name'),
			runtime: z.string().optional().describe('Detected runtime'),
			packageManager: z.string().optional().describe('Detected package manager'),
			buildCommand: z.string().optional().describe('Detected build command'),
			startCommand: z.string().optional().describe('Detected start command'),
			confidence: z.string().optional().describe('Detection confidence'),
			warnings: z.array(z.string()).optional().describe('Framework detection warnings'),
		})
		.optional()
		.describe('Local framework/build detection summary'),
	deployment: z
		.object({
			id: z.string().describe('Latest deployment ID'),
			state: z.string().optional().describe('Latest deployment state'),
			active: z.boolean().describe('Whether latest deployment is active'),
			healthy: z.boolean().describe('Whether latest deployment is healthy'),
			provisioning: z.boolean().describe('Whether latest deployment is still provisioning'),
			createdAt: z.string().describe('Deployment creation timestamp'),
			url: z.string().optional().describe('Latest deployment app URL'),
			logsUrl: z.string().optional().describe('Deployment logs URL'),
			buildLogsUrl: z.string().optional().describe('Build logs URL'),
			logCommand: z.string().describe('Command to inspect deployment logs'),
		})
		.optional()
		.describe('Latest deployment summary'),
	setupActions: z.array(z.string()).describe('Suggested actions to make the project ready'),
	warnings: z.array(z.string()).describe('Non-fatal status collection warnings'),
});

type StatusResponse = z.infer<typeof StatusResponseSchema>;
type ProjectIdSource = 'flag' | 'global-option' | 'local-config';

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function deploymentHealth(state: string | undefined, active: boolean) {
	const provisioning = state === 'pending' || state === 'building' || state === 'deploying';
	const healthy = active && state === 'completed';
	return { healthy, provisioning };
}

export const command = createCommand({
	name: 'status',
	description: 'Summarize local project and deployment health',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('status --json'), description: 'Show machine-readable status' },
		{
			command: getCommand('status --project-id=proj_abc123xyz --json'),
			description: 'Show status for a specific project',
		},
	],
	schema: {
		options: z.object({
			projectId: z.string().optional().describe('Project ID to inspect'),
		}),
		response: StatusResponseSchema,
	},
	async handler(ctx) {
		const { config, logger, options, opts } = ctx;
		const projectDir = process.cwd();
		const warnings: string[] = [];
		const setupActions: string[] = [];

		const localProject = await loadProjectConfig(projectDir, config).catch((error: unknown) => {
			if (error && typeof error === 'object' && 'name' in error) {
				if (error.name === 'ProjectConfigNotFoundException') {
					setupActions.push(
						`Run ${getCommand('project create')} or ${getCommand('project import')}`
					);
					return undefined;
				}
			}
			warnings.push(`Failed to read local project config: ${errorMessage(error)}`);
			return undefined;
		});

		const frameworkResult = await detectFrameworkWithPackageJson(projectDir).catch(
			(error: unknown) => {
				warnings.push(`Framework detection failed: ${errorMessage(error)}`);
				return undefined;
			}
		);

		const auth = await getAuth().catch((error: unknown) => {
			warnings.push(`Authentication lookup failed: ${errorMessage(error)}`);
			return null;
		});
		if (!auth) {
			setupActions.push(`Run ${getCommand('auth login')} or set AGENTUITY_API_KEY`);
		}

		const globalProjectId = (options as typeof options & { projectId?: string }).projectId;
		const projectId = opts.projectId ?? globalProjectId ?? localProject?.projectId;
		const projectIdSource: ProjectIdSource | undefined = opts.projectId
			? 'flag'
			: globalProjectId
				? 'global-option'
				: localProject?.projectId
					? 'local-config'
					: undefined;
		if (!projectId) {
			setupActions.push(`Pass --project-id or run from a directory with agentuity.json`);
		}

		const apiClient =
			auth && projectId
				? new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config)
				: undefined;
		const cloudProject =
			apiClient && projectId
				? await projectGet(apiClient, { id: projectId, mask: true, keys: false }).catch(
						(error: unknown) => {
							warnings.push(`Failed to fetch cloud project: ${errorMessage(error)}`);
							return undefined;
						}
					)
				: undefined;

		const deployments =
			apiClient && projectId
				? await projectDeploymentList(apiClient, projectId, 1).catch((error: unknown) => {
						warnings.push(`Failed to fetch deployments: ${errorMessage(error)}`);
						return [];
					})
				: [];

		const latestDeployment = deployments[0];
		if (apiClient && projectId && !latestDeployment) {
			setupActions.push(`Run ${getCommand('deploy')}`);
		}

		const framework = frameworkResult?.framework;
		const project =
			projectId && projectIdSource
				? {
						id: projectId,
						name: cloudProject?.name,
						orgId: cloudProject?.orgId ?? localProject?.orgId,
						region: cloudProject?.cloudRegion ?? localProject?.region,
						dashboardUrl: cloudProject?.urls?.dashboard,
						appUrl: cloudProject?.urls?.app,
						source: projectIdSource,
					}
				: undefined;

		const deployment = latestDeployment
			? {
					id: latestDeployment.id,
					state: latestDeployment.state,
					active: latestDeployment.active,
					...deploymentHealth(latestDeployment.state, latestDeployment.active),
					createdAt: latestDeployment.createdAt,
					url: cloudProject?.urls?.app,
					logsUrl: latestDeployment.deploymentLogsURL ?? undefined,
					buildLogsUrl: latestDeployment.buildLogsURL ?? undefined,
					logCommand: getCommand(`cloud deployment logs ${latestDeployment.id}`),
				}
			: undefined;

		if (deployment && !deployment.healthy) {
			if (deployment.provisioning) {
				setupActions.push(`Wait for deployment ${deployment.id} to finish provisioning`);
			} else if (deployment.state === 'failed') {
				setupActions.push(`Run ${deployment.logCommand}`);
			}
		}

		const result: StatusResponse = {
			ok: Boolean(auth && project && deployment?.healthy),
			authenticated: Boolean(auth),
			project,
			framework: framework
				? {
						name: framework.name,
						runtime: framework.runtime,
						packageManager: framework.packageManager,
						buildCommand: framework.buildCommand,
						startCommand: framework.startCommand,
						confidence: framework.confidence,
						warnings: framework.warnings,
					}
				: undefined,
			deployment,
			setupActions,
			warnings,
		};

		if (!isJSONMode(options)) {
			tui.table(
				[
					{
						Authenticated: result.authenticated ? 'Yes' : 'No',
						Project: result.project?.id ?? 'none',
						Framework: result.framework?.name ?? 'unknown',
						Deployment: result.deployment?.id ?? 'none',
						Health: result.deployment?.healthy
							? 'healthy'
							: (result.deployment?.state ?? 'unknown'),
					},
				],
				['Authenticated', 'Project', 'Framework', 'Deployment', 'Health']
			);
			if (setupActions.length > 0) {
				tui.newline();
				tui.info('Suggested next actions');
				for (const action of setupActions) {
					tui.bullet(action);
				}
			}
		}

		return result;
	},
});
