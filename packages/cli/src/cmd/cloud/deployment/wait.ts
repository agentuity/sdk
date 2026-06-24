import { z } from 'zod';
import { DeploymentStateValue } from '@agentuity/server';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { isJSONMode } from '../../../output.ts';
import { resolveProjectId } from './utils.ts';
import { parseDurationMs, waitForDeployment } from './wait-core.ts';

const DeploymentWaitResponseSchema = z.object({
	success: z.boolean().describe('Whether the deployment reached a healthy terminal state'),
	timedOut: z.boolean().describe('Whether the wait ended before reaching a terminal state'),
	state: DeploymentStateValue.describe('Final deployment state observed'),
	deploymentId: z.string().describe('Deployment ID'),
	projectId: z.string().describe('Project ID'),
	active: z.boolean().describe('Whether the deployment is active'),
	urls: z
		.object({
			dashboard: z.string().describe('Dashboard URL for the deployment'),
			app: z.string().optional().describe('Latest project app URL'),
			custom: z.array(z.string()).optional().describe('Custom domain URLs'),
		})
		.describe('Relevant deployment URLs'),
	recentLogs: z.array(z.string()).optional().describe('Recent log lines when the wait failed'),
	message: z.string().optional().describe('Failure or timeout message'),
});

export const waitSubcommand = createSubcommand({
	name: 'wait',
	description: 'Wait until a deployment reaches a terminal state',
	tags: ['read-only', 'slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: getCommand('cloud deployment wait deploy_abc123xyz --timeout 10m --json'),
			description: 'Wait for deployment completion with JSON output',
		},
		{
			command: getCommand('cloud deployment wait deploy_abc123xyz --project-id=proj_abc123xyz'),
			description: 'Wait for a deployment in a specific project',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	idempotent: true,
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			projectId: z.string().optional().describe('Project ID'),
			timeout: z.string().default('10m').describe('Maximum time to wait (e.g. 30s, 10m, 1h)'),
		}),
		response: DeploymentWaitResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, args, options, logger, config } = ctx;
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });
		const timeoutMs = parseDurationMs(ctx.opts.timeout);

		try {
			const result = await waitForDeployment({
				apiClient,
				projectId,
				deploymentId: args.deployment_id,
				config,
				logger,
				timeoutMs,
				projectDir: process.cwd(),
			});

			if (!isJSONMode(options)) {
				if (result.success) {
					tui.success(`Deployment ${result.deploymentId} is ready (${result.state})`);
					if (result.urls.app) {
						tui.info(`App URL: ${tui.link(result.urls.app)}`);
					}
					tui.info(`Dashboard: ${tui.link(result.urls.dashboard)}`);
				} else if (result.timedOut) {
					tui.warning(
						`Deployment ${result.deploymentId} did not finish within ${ctx.opts.timeout} (state: ${result.state})`
					);
				} else {
					tui.error(`Deployment ${result.deploymentId} failed (${result.state})`);
					if (result.recentLogs?.length) {
						tui.newline();
						tui.warning(`Recent logs:`);
						for (const line of result.recentLogs) {
							console.log(`  ${line}`);
						}
					}
				}
			}

			return result;
		} catch (ex) {
			tui.fatal(`Failed to wait for deployment: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
