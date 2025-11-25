import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { sessionLogs } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const SessionLogsResponseSchema = z.array(
	z.object({
		body: z.string().describe('Log body'),
		severity: z.string().describe('Log severity'),
		timestamp: z.string().describe('Log timestamp'),
	})
);

export const logsSubcommand = createSubcommand({
	name: 'logs',
	description: 'Get logs for a specific session',
	tags: ['read-only', 'slow', 'requires-auth'],
	examples: [`${getCommand('cloud session logs')} sess_abc123xyz`],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	schema: {
		args: z.object({
			session_id: z.string().describe('Session ID'),
		}),
		options: z.object({
			projectId: z.string().optional().describe('Project ID (for display purposes)'),
			deploymentId: z.string().optional().describe('Deployment ID (for display purposes)'),
		}),
		response: SessionLogsResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, args, options } = ctx;

		try {
			const logs = await sessionLogs(apiClient, { id: args.session_id });

			if (!options.json) {
				if (logs.length === 0) {
					tui.info('No logs found for this session.');
				} else {
					tui.banner(`Logs for Session ${args.session_id}`, `${logs.length} log entries`);

					for (const log of logs) {
						const timestamp = new Date(log.timestamp).toLocaleTimeString();
						const severity = log.severity.padEnd(5);
						const severityColor =
							log.severity === 'ERROR'
								? tui.error(severity)
								: log.severity === 'WARN'
									? tui.warning(severity)
									: tui.muted(severity);

						console.log(`${tui.muted(timestamp)} ${severityColor} ${log.body}`);
					}
				}
			}

			return logs;
		} catch (ex) {
			tui.fatal(
				`Failed to get session logs: ${ex instanceof Error ? ex.message : String(ex)}`,
				ErrorCode.API_ERROR
			);
		}
	},
});
