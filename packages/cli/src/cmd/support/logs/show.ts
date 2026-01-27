import { createSubcommand } from '../../../types';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { getLatestLogSession, getLogsDirPath } from '../../../internal-logger';
import * as tui from '../../../tui';
import { join } from 'node:path';

const argsSchema = z.object({});

const optionsSchema = z.object({
	session: z.boolean().optional().default(false).describe('Show session metadata only'),
	tail: z.number().optional().describe('Show last N log entries'),
});

export default createSubcommand({
	name: 'show',
	description: 'Show the most recent CLI command logs',
	schema: {
		args: argsSchema,
		options: optionsSchema,
	},
	handler: async (ctx) => {
		const { opts } = ctx;
		const isJsonMode = ctx.options.json;

		const sessionDir = getLatestLogSession();
		if (!sessionDir) {
			if (isJsonMode) {
				console.log(
					JSON.stringify({
						error: 'No logs found',
						logsDir: getLogsDirPath(),
					})
				);
				return;
			}
			tui.warning('No CLI logs found');
			tui.info(`Logs are stored in: ${tui.muted(getLogsDirPath())}`);
			return;
		}

		const sessionFile = join(sessionDir, 'session.json');
		const logsFile = join(sessionDir, 'logs.jsonl');

		if (!existsSync(sessionFile)) {
			if (isJsonMode) {
				console.log(JSON.stringify({ error: 'Session metadata not found' }));
				return;
			}
			tui.error('Session metadata not found');
			return;
		}

		// Read session metadata
		const sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));

		if (opts.session) {
			// Show session metadata only
			if (isJsonMode) {
				console.log(JSON.stringify(sessionData, null, 2));
			} else {
				tui.info(tui.bold('CLI Command Session'));
				tui.newline();
				tui.output(`Session ID:  ${tui.colorPrimary(sessionData.sessionId)}`);
				tui.output(`Command:     ${tui.colorInfo(sessionData.command)}`);
				tui.output(`Args:        ${sessionData.args.join(' ')}`);
				tui.output(`Timestamp:   ${sessionData.timestamp}`);
				tui.output(`CLI Version: ${sessionData.cli.version}`);
				tui.output(`Platform:    ${sessionData.system.platform}/${sessionData.system.arch}`);
				tui.output(`CWD:         ${sessionData.cwd}`);
				tui.newline();
				tui.output(tui.muted(`Session directory: ${sessionDir}`));
			}
			return;
		}

		// Read log entries
		if (!existsSync(logsFile)) {
			if (isJsonMode) {
				console.log(JSON.stringify({ session: sessionData, logs: [] }));
				return;
			}
			tui.warning('No log entries found for this session');
			return;
		}

		const logLines = readFileSync(logsFile, 'utf-8')
			.split('\n')
			.filter((line) => line.trim());
		const logEntries = logLines.map((line) => JSON.parse(line));

		// Apply tail filter if specified
		const displayEntries = opts.tail ? logEntries.slice(-opts.tail) : logEntries;

		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						session: sessionData,
						logs: displayEntries,
					},
					null,
					2
				)
			);
		} else {
			// Human-readable output
			tui.info(tui.bold('CLI Command Session'));
			tui.newline();
			tui.output(`Session ID:  ${tui.colorPrimary(sessionData.sessionId)}`);
			tui.output(`Command:     ${tui.colorInfo(sessionData.command)}`);
			tui.output(`Timestamp:   ${sessionData.timestamp}`);
			tui.output(`Total Logs:  ${logEntries.length}`);
			if (opts.tail) {
				tui.output(`Showing:     Last ${opts.tail} entries`);
			}
			tui.newline();

			// Display log entries
			for (const entry of displayEntries) {
				const levelColor =
					entry.level === 'error'
						? tui.colorError
						: entry.level === 'warn'
							? tui.warn
							: entry.level === 'info'
								? tui.colorInfo
								: tui.muted;

				const timestamp = new Date(entry.timestamp).toLocaleTimeString();
				const level = entry.level.toUpperCase().padEnd(5);

				tui.output(`${tui.muted(timestamp)} ${levelColor(level)} ${entry.message}`);

				if (entry.context && Object.keys(entry.context).length > 0) {
					tui.output(tui.muted(`  Context: ${JSON.stringify(entry.context)}`));
				}
			}

			tui.newline();
			tui.output(tui.muted(`Session directory: ${sessionDir}`));
		}
	},
});
