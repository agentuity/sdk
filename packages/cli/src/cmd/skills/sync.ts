import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';
import { createSuccessResponse, isJSONMode, outputJSON } from '../../output.ts';
import { runSkillsNpm } from '../../skills/index.ts';
import { createSubcommand } from '../../types.ts';

export const syncSubcommand = createSubcommand({
	name: 'sync',
	description: 'Discover npm-bundled skills and symlink them for coding agents',
	tags: ['mutating', 'fast'],
	examples: [
		{
			command: getCommand('skills sync'),
			description: 'Re-sync skills from node_modules to agent directories',
		},
	],
	schema: {
		options: z.object({}),
	},

	async handler(ctx) {
		const { logger, options } = ctx;
		const projectDir = process.cwd();
		const exitCode = await runSkillsNpm({ cwd: projectDir });

		if (exitCode !== 0) {
			logger.fatal(
				'Failed to sync skills — ensure @agentuity/skills and skills-npm are installed',
				ErrorCode.RUNTIME_ERROR
			);
			return;
		}

		if (isJSONMode(options)) {
			outputJSON(createSuccessResponse({ synced: true }));
			return;
		}

		logger.info('Skills synced successfully');
	},
});
