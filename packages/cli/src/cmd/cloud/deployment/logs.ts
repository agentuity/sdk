import { z } from 'zod';
import { DeploymentLogSchema } from '@agentuity/server';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectDeploymentLogs } from '@agentuity/server';
import { resolveProjectId } from './utils.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { isJSONMode } from '../../../output.ts';
import { followDeploymentLogs, parseDurationMs } from './follow-logs.ts';

const DeploymentLogsFollowResponseSchema = z.object({
	deploymentId: z.string().describe('Deployment ID'),
	projectId: z.string().describe('Project ID'),
	logs: z.array(DeploymentLogSchema).describe('Log entries emitted during follow'),
	timedOut: z.boolean().describe('Whether follow ended due to timeout'),
	state: z.string().optional().describe('Deployment state when follow ended'),
	bytesRead: z.number().describe('Approximate bytes read while following'),
});

export const logsSubcommand = createSubcommand({
	name: 'logs',
	aliases: ['log'],
	description: 'View logs for a specific deployment',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz'),
			description: 'View logs for deployment',
		},
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz --follow'),
			description: 'Follow deployment logs until completion or timeout',
		},
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz --follow --since 10m --json'),
			description: 'Follow recent logs with JSON events',
		},
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz --limit=50'),
			description: 'Limit to 50 log entries',
		},
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz --no-timestamps'),
			description: 'Hide timestamps',
		},
		{
			command: getCommand('cloud deployment logs deploy_abc123xyz --project-id=proj_abc123xyz'),
			description: 'View logs with specific project',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			projectId: z.string().optional().describe('Project ID'),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.default(100)
				.describe('Maximum number of logs to return in snapshot mode'),
			timestamps: z.boolean().default(true).describe('Show timestamps in output'),
			follow: z.boolean().default(false).describe('Follow logs until deployment completes'),
			since: z
				.string()
				.optional()
				.describe('Only follow logs newer than this duration (e.g. 10m)'),
			timeout: z
				.string()
				.default('10m')
				.describe('Maximum time to follow logs (e.g. 30s, 10m, 1h)'),
		}),
		response: z.union([z.array(DeploymentLogSchema), DeploymentLogsFollowResponseSchema]),
	},
	idempotent: true,
	async handler(ctx) {
		const { apiClient, args, options, logger, config } = ctx;
		const limit = ctx.opts.limit;
		const showTimestamps = ctx.opts.timestamps;
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });

		try {
			if (!ctx.opts.follow) {
				const logs = await projectDeploymentLogs(
					apiClient,
					projectId,
					args.deployment_id,
					limit
				);

				if (!isJSONMode(options)) {
					if (logs.length === 0) {
						tui.info('No logs found for this deployment');
					} else {
						for (const log of logs) {
							const severityColor = tui.getSeverityColor(log.severity);
							if (showTimestamps) {
								const timestamp = new Date(log.timestamp).toLocaleString();
								console.log(
									`${tui.muted(timestamp)} ${severityColor(log.severity.padEnd(5))} ${log.body}`
								);
							} else {
								console.log(`${severityColor(log.severity.padEnd(5))} ${log.body}`);
							}
						}
					}
				}

				return logs;
			}

			const abortController = new AbortController();
			const handleSignal = () => {
				abortController.abort();
			};
			process.on('SIGINT', handleSignal);
			process.on('SIGTERM', handleSignal);

			try {
				const sinceMs = ctx.opts.since
					? Date.now() - parseDurationMs(ctx.opts.since)
					: undefined;
				const result = await followDeploymentLogs({
					apiClient,
					projectId,
					deploymentId: args.deployment_id,
					config,
					logger,
					sinceMs,
					timeoutMs: parseDurationMs(ctx.opts.timeout),
					json: isJSONMode(options),
					showTimestamps,
					abortSignal: abortController.signal,
					projectDir: process.cwd(),
				});

				if (!isJSONMode(options) && result.timedOut) {
					tui.warning(
						`Stopped following deployment logs after ${ctx.opts.timeout} (state: ${result.state ?? 'unknown'})`
					);
				}

				return result;
			} finally {
				process.off('SIGINT', handleSignal);
				process.off('SIGTERM', handleSignal);
			}
		} catch (ex) {
			tui.fatal(`Failed to fetch deployment logs: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
