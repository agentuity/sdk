import { createSubcommand } from '../../types.ts';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform, arch, cpus, totalmem, homedir } from 'node:os';
import { getLatestLogSession } from '../../internal-logger.ts';
import * as tui from '../../tui.ts';
import { getVersion, getPackageName } from '../../version.ts';
import { getAuth } from '../../config.ts';
import { getExecutingAgent } from '../../agent-detection.ts';

const argsSchema = z.object({});

const optionsSchema = z.object({});

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get user ID from latest session
 */
function getUserId(): string | null {
	const sessionDir = getLatestLogSession();
	if (!sessionDir) {
		return null;
	}

	const sessionFile = join(sessionDir, 'session.json');
	if (!existsSync(sessionFile)) {
		return null;
	}

	try {
		const sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
		return sessionData.userId || null;
	} catch {
		return null;
	}
}

export default createSubcommand({
	name: 'system',
	description: 'Display system information for support',
	schema: {
		args: argsSchema,
		options: optionsSchema,
	},
	handler: async (ctx) => {
		const isJsonMode = ctx.options.json;

		// Get userId from auth (keychain or config)
		let userId = 'not authenticated';
		try {
			const auth = await getAuth();
			if (auth?.userId) {
				userId = auth.userId;
			}
		} catch {
			// If that fails, try from session
			const sessionUserId = getUserId();
			if (sessionUserId) {
				userId = sessionUserId;
			}
		}

		// Get detected agent (if any)
		const detectedAgent = getExecutingAgent();

		// Gather system information
		const systemInfo = {
			cli: {
				name: getPackageName(),
				version: getVersion(),
			},
			bun: {
				path: process.execPath || 'unknown',
				version: Bun.version || process.version,
			},
			system: {
				platform: platform(),
				arch: arch(),
				cpus: cpus().length,
				memory: totalmem(),
				memoryFormatted: formatBytes(totalmem()),
			},
			paths: {
				cwd: process.cwd(),
				home: homedir(),
				configDir: join(homedir(), '.config', 'agentuity'),
			},
			user: {
				userId: userId,
			},
			agent: detectedAgent || null,
		};

		if (isJsonMode) {
			tui.json(systemInfo);
		} else {
			// Display in vertical table format
			tui.info(tui.bold('System Information'));
			tui.newline();

			// Flatten the data for table display
			const tableData = [
				{ Property: 'CLI Name', Value: systemInfo.cli.name },
				{ Property: 'CLI Version', Value: systemInfo.cli.version },
				{ Property: 'Bun Path', Value: systemInfo.bun.path },
				{ Property: 'Bun Version', Value: systemInfo.bun.version },
				{ Property: 'Platform', Value: systemInfo.system.platform },
				{ Property: 'Architecture', Value: systemInfo.system.arch },
				{ Property: 'CPUs', Value: String(systemInfo.system.cpus) },
				{ Property: 'Memory', Value: systemInfo.system.memoryFormatted },
				{ Property: 'Home Directory', Value: systemInfo.paths.home },
				{ Property: 'Config Directory', Value: systemInfo.paths.configDir },
				{ Property: 'User ID', Value: systemInfo.user.userId },
				{ Property: 'Detected Agent', Value: systemInfo.agent || 'none' },
			];

			tui.table(tableData, ['Property', 'Value'], { layout: 'vertical' });
		}
	},
});
