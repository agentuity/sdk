import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { dbLogs, DbQueryLogSchema, listOrgResources } from '@agentuity/server/index.ts';
import { getGlobalCatalystAPIClient, getCatalystAPIClient } from '../../../config.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { getResourceInfo, setResourceInfo } from '../../../cache/index.ts';

const DbLogsResponseSchema = z.array(DbQueryLogSchema);

export const logsSubcommand = createSubcommand({
	name: 'logs',
	aliases: ['log'],
	description: 'Get query logs for a specific database',
	tags: ['read-only', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud db logs my-database'),
			description: 'View query logs for database',
		},
		{
			command: getCommand('cloud db logs my-database --limit=50'),
			description: 'Limit to 50 log entries',
		},
		{
			command: getCommand('cloud db logs my-database --has-error'),
			description: 'Show only queries with errors',
		},
		{
			command: getCommand('cloud db logs my-database --username=user123'),
			description: 'Filter by username',
		},
		{
			command: getCommand('cloud db logs my-database --command=SELECT'),
			description: 'Filter by SQL command type',
		},
		{
			command: getCommand('cloud db logs my-database --session-id=sess_abc123'),
			description: 'Filter by session ID',
		},
		{
			command: getCommand('cloud db logs my-database --show-session-id'),
			description: 'Show session ID column',
		},
		{
			command: getCommand('cloud db logs my-database --show-username'),
			description: 'Show username column',
		},
		{
			command: getCommand('cloud db logs my-database --pretty'),
			description: 'Show full formatted SQL on separate lines',
		},
	],
	requires: { auth: true },
	optional: { org: true },
	idempotent: true,
	schema: {
		args: z.object({
			database: z.string().describe('Database name'),
		}),
		options: z.object({
			startDate: z.string().optional().describe('Start date for filtering logs'),
			endDate: z.string().optional().describe('End date for filtering logs'),
			username: z.string().optional().describe('Filter by username'),
			command: z.string().optional().describe('Filter by SQL command type'),
			hasError: z.boolean().optional().describe('Show only queries with errors'),
			sessionId: z.string().optional().describe('Filter by session ID (trace ID)'),
			showSessionId: z.boolean().default(false).describe('Show session ID column in output'),
			showUsername: z.boolean().default(false).describe('Show username column in output'),
			pretty: z.boolean().default(false).describe('Show full formatted SQL on separate line'),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.default(100)
				.describe('Maximum number of logs to return'),
			timestamps: z.boolean().default(true).describe('Show timestamps in output'),
		}),
		response: DbLogsResponseSchema,
	},
	async handler(ctx) {
		const { args, options, logger, auth, config } = ctx;
		const showTimestamps = ctx.opts.timestamps ?? true;
		const showSessionId = ctx.opts.showSessionId ?? false;
		const showUsername = ctx.opts.showUsername ?? false;
		const prettySQL = ctx.opts.pretty ?? false;

		const profileName = config?.name ?? 'production';

		try {
			const globalClient = await getGlobalCatalystAPIClient(logger, auth, profileName);

			// Check cache first for orgId
			const cachedInfo = await getResourceInfo('db', profileName, args.database);
			const orgId = ctx.orgId ?? cachedInfo?.orgId;

			if (!orgId) {
				tui.fatal(
					`Organization not found for database '${args.database}'. Run 'agentuity cloud db list' first or specify --org-id.`,
					ErrorCode.INVALID_ARGUMENT
				);
			}

			// Look up the database to get its region
			const resources = await listOrgResources(globalClient, { type: 'db', orgId });
			const database = resources.db.find((db) => db.name === args.database);
			if (!database) {
				tui.fatal(`Database '${args.database}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			const region = database.cloud_region;

			// Cache the database info for future lookups
			await setResourceInfo('db', profileName, database.name, region, orgId);

			// Use regional client for logs (ClickHouse queries are region-specific)
			const catalystClient = getCatalystAPIClient(logger, auth, region);

			const logs = await dbLogs(catalystClient, {
				database: args.database,
				orgId,
				region,
				startDate: ctx.opts.startDate,
				endDate: ctx.opts.endDate,
				username: ctx.opts.username,
				command: ctx.opts.command,
				hasError: ctx.opts.hasError,
				sessionId: ctx.opts.sessionId,
				limit: ctx.opts.limit,
			});

			if (!options.json) {
				if (logs.length === 0) {
					tui.info('No logs found for this database.');
				} else {
					for (const log of logs) {
						// Format timestamp with explicit locale for consistency
						const timestamp = showTimestamps
							? `${tui.muted(new Date(log.timestamp).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).padEnd(22))} `
							: '';

						// Format command with cyan color (using info color) and consistent width
						const commandText = log.command.padEnd(8);
						const command = tui.colorInfo(commandText);

						// Format duration with consistent width
						const duration = `${log.duration.toFixed(2)}ms`.padStart(9);

						// Format username if requested
						const username = showUsername
							? `${tui.muted(`[${log.username}]`.padEnd(14))} `
							: '';

						// Format session ID if requested (already has sess_ prefix from API)
						const sessionId = showSessionId
							? `${tui.muted((log.sessionId || '').padEnd(38))} `
							: '';

						if (prettySQL) {
							// Pretty mode: show metadata on first line, full SQL on next line
							console.log(
								`${timestamp}${command} ${tui.muted(duration)} ${username}${sessionId}`
							);
							// Show full formatted SQL indented on next line with clear color
							console.log(`  ${log.sql}`);
						} else {
							// Normal mode: truncate SQL and show inline
							const sqlClean = log.sql
								.replace(/[\n\r\t]+/g, ' ')
								.replace(/\s+/g, ' ')
								.trim();
							const sql =
								sqlClean.length > 100 ? `${sqlClean.substring(0, 97)}...` : sqlClean;
							console.log(
								`${timestamp}${command} ${tui.muted(duration)} ${username}${sessionId}${sql}`
							);
						}

						// Show error on separate line underneath if present
						if (log.error) {
							console.log(tui.colorError(`  ↳ ERROR: ${log.error}`));
						}
					}
				}
			}

			return logs;
		} catch (ex) {
			tui.fatal(`Failed to get database logs: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
