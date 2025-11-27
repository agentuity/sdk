import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentLogs, DeploymentLogSchema } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

export const logsSubcommand = createSubcommand({
	name: 'logs',
	aliases: ['log'],
	description: 'View logs for a specific deployment',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-deployment'],
	examples: [
		`${getCommand('cloud deployment logs')} deploy_abc123xyz`,
		`${getCommand('cloud deployment logs')} deploy_abc123xyz --limit=50`,
		`${getCommand('cloud deployment logs')} deploy_abc123xyz --no-timestamps  # hide timestamps`,
		`${getCommand('cloud deployment logs')} deploy_abc123xyz --project-id=proj_abc123xyz`,
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
				.describe('Maximum number of logs to return'),
			timestamps: z.boolean().default(true).describe('Show timestamps in output'),
		}),
		response: z.array(DeploymentLogSchema),
	},
	idempotent: true,
	async handler(ctx) {
		const { apiClient, args, options } = ctx;
		const limit = ctx.opts.limit;
		const showTimestamps = ctx.opts.timestamps;

		try {
			const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });
			const logs = await projectDeploymentLogs(apiClient, projectId, args.deployment_id, limit);

			if (!options.json) {
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
		} catch (ex) {
			tui.fatal(
				`Failed to fetch deployment logs: ${ex instanceof Error ? ex.message : String(ex)}`,
				ErrorCode.API_ERROR
			);
		}
	},
});
