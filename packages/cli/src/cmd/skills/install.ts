import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';
import { run } from '../../node-compat/proc.ts';
import {
	createErrorResponse,
	createSuccessResponse,
	isJSONMode,
	outputJSON,
	outputSuccess,
} from '../../output.ts';
import { runSkillsNpm, wireSkillsToProject } from '../../skills/index.ts';
import * as tui from '../../tui.ts';
import { createSubcommand } from '../../types.ts';
import type { PackageManager } from '../build/detect/types.ts';
import { detectPackageManager } from '../build/detect/util.ts';

function installCommand(packageManager: PackageManager): string[] {
	return packageManager === 'yarn' ? ['yarn', 'install'] : [packageManager, 'install'];
}

export const installSubcommand = createSubcommand({
	name: 'install',
	description: 'Install @agentuity/skills and sync them to local coding agents',
	tags: ['mutating'],
	examples: [
		{
			command: getCommand('skills install'),
			description: 'Install Agentuity skills in the current project',
		},
		{
			command: getCommand('skills install --package-manager npm'),
			description: 'Install Agentuity skills using npm',
		},
	],
	schema: {
		options: z.object({
			packageManager: z
				.enum(['bun', 'npm', 'pnpm', 'yarn'])
				.optional()
				.describe('Package manager to use. Defaults to lockfile detection.'),
			sync: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run skills-npm after installing (use --no-sync to skip)'),
		}),
	},

	async handler(ctx) {
		const { opts, logger, options } = ctx;
		const projectDir = process.cwd();
		const packageManager = opts.packageManager ?? (await detectPackageManager(projectDir));
		const jsonMode = isJSONMode(options);

		const result = await wireSkillsToProject({ projectDir });
		const cmd = installCommand(packageManager);
		const installExitCode = jsonMode
			? ((await run({ cwd: projectDir, cmd })).exitCode ?? 1)
			: await tui.runCommand({
					command: cmd.join(' '),
					cwd: projectDir,
					cmd,
					clearOnSuccess: true,
				});

		if (installExitCode !== 0) {
			if (jsonMode) {
				process.exitCode = 1;
				outputJSON(
					createErrorResponse(
						ErrorCode.RUNTIME_ERROR,
						`Failed to install dependencies with ${packageManager}`,
						{
							...result,
							installed: false,
							installExitCode,
							packageManager,
							synced: false,
						}
					)
				);
				return;
			}
			logger.fatal(
				`Failed to install dependencies with ${packageManager}`,
				ErrorCode.RUNTIME_ERROR
			);
			return;
		}

		let synced = false;
		let syncExitCode: number | undefined;
		if (opts.sync !== false) {
			if (!jsonMode) {
				logger.info('Syncing skills to agent directories...');
			}
			syncExitCode = await runSkillsNpm({ cwd: projectDir, silent: jsonMode });
			synced = syncExitCode === 0;
			if (!synced && !jsonMode) {
				logger.warn('skills-npm sync failed — run `agentuity skills sync` after install');
			}
		}

		if (jsonMode) {
			outputJSON(
				createSuccessResponse({
					...result,
					installed: true,
					packageManager,
					synced,
					syncExitCode,
				})
			);
			return;
		}

		if (synced) {
			outputSuccess('Installed and synced Agentuity skills for this project', options);
		} else {
			outputSuccess('Installed Agentuity skills for this project', options);
		}
	},
});
