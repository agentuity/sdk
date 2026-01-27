import { createSubcommand } from '../../../types';
import { z } from 'zod';
import { getLatestLogSession, getLogsDirPath } from '../../../internal-logger';
import * as tui from '../../../tui';

const argsSchema = z.object({});

const optionsSchema = z.object({
	logs: z.boolean().optional().default(false).describe('Show path to logs directory instead of session'),
});

export default createSubcommand({
	name: 'path',
	description: 'Show the path to the most recent log session',
	schema: {
		args: argsSchema,
		options: optionsSchema,
	},
	handler: async (ctx) => {
		const { opts } = ctx;
		const isJsonMode = ctx.options.json;

		if (opts.logs) {
			// Show the logs directory path
			const logsDir = getLogsDirPath();
			if (isJsonMode) {
				console.log(JSON.stringify({ logsDir }));
			} else {
				console.log(logsDir);
			}
			return;
		}

		const sessionDir = getLatestLogSession();
		if (!sessionDir) {
			if (isJsonMode) {
				console.log(
					JSON.stringify({
						error: 'No logs found',
						logsDir: getLogsDirPath(),
					})
				);
			} else {
				tui.warning('No CLI logs found');
				tui.info(`Logs directory: ${tui.muted(getLogsDirPath())}`);
			}
			return;
		}

		if (isJsonMode) {
			console.log(JSON.stringify({ sessionDir }));
		} else {
			console.log(sessionDir);
		}
	},
});
