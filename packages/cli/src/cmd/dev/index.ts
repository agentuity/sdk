/**
 * Dev command — runs the project's own dev script.
 *
 * Detects the package manager (bun/npm/pnpm/yarn) and runtime
 * (bun/deno/node) from the project, then runs `<pm> run dev`.
 * No Agentuity-specific behavior — just a passthrough to the
 * framework's dev server.
 */

import { resolve } from 'node:path';
import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { detectFrameworkWithPackageJson } from '../build/detect';
import { detectPackageManager, getRunCommand } from '../build/detect/util';

const DEFAULT_PORT = 3000;

export const command = createCommand({
	name: 'dev',
	description: 'Run the project development server',
	tags: ['mutating', 'slow'],
	idempotent: true,
	optional: { project: true },
	examples: [
		{ command: getCommand('dev'), description: 'Start development server' },
		{ command: getCommand('dev --port 8080'), description: 'Specify custom port' },
	],
	schema: {
		options: z.object({
			port: z
				.number()
				.min(1024)
				.max(65535)
				.optional()
				.describe('Port to pass to the dev server via PORT env var'),
			script: z
				.string()
				.optional()
				.describe('Custom script name to run instead of "dev" (e.g., "dev:web")'),
		}),
	},

	async handler(ctx) {
		const { opts, projectDir, logger } = ctx;
		const rootDir = resolve(projectDir);

		// Read package.json
		const { framework, packageJson } = await detectFrameworkWithPackageJson(rootDir);

		if (!packageJson) {
			tui.fatal(
				'No package.json found. Ensure you are in a JS/TS project directory.',
				ErrorCode.CONFIG_INVALID
			);
		}

		// Determine which script to run
		const scriptName = opts.script ?? 'dev';

		if (!packageJson.scripts?.[scriptName]) {
			const available = packageJson.scripts
				? Object.keys(packageJson.scripts).join(', ')
				: 'none';
			tui.fatal(
				`No "${scriptName}" script found in package.json. Available scripts: ${available}`,
				ErrorCode.CONFIG_INVALID
			);
		}

		// Detect package manager
		const pm = await detectPackageManager(rootDir);
		const runCmd = getRunCommand(pm);

		// Build the command
		const cmd = runCmd.split(' ');
		cmd.push(scriptName);

		// Build environment
		const env: Record<string, string> = { ...process.env } as Record<string, string>;
		const port = opts.port ?? DEFAULT_PORT;
		env.PORT = String(port);

		// Log what we're doing
		const frameworkLabel = framework
			? framework.name === 'generic'
				? ''
				: ` (${framework.name})`
			: '';
		tui.info(`Starting dev server${frameworkLabel} on port ${port}`);
		tui.info(tui.muted(`$ ${cmd.join(' ')}`));
		tui.newline();

		// Run the dev command, inheriting stdio for full interactivity
		const proc = Bun.spawn(cmd, {
			cwd: rootDir,
			env,
			stdin: 'inherit',
			stdout: 'inherit',
			stderr: 'inherit',
		});

		// Forward signals
		const signalHandler = (signal: NodeJS.Signals) => {
			proc.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
		};
		process.on('SIGINT', signalHandler);
		process.on('SIGTERM', signalHandler);

		const exitCode = await proc.exited;

		process.off('SIGINT', signalHandler);
		process.off('SIGTERM', signalHandler);

		if (exitCode !== 0 && exitCode !== 130) {
			// 130 = SIGINT (Ctrl+C), which is normal
			logger.debug('Dev server exited with code %d', exitCode);
		}

		process.exit(exitCode ?? 0);
	},
});
