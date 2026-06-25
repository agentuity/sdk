import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { createSuccessResponse, isJSONMode, outputJSON, outputSuccess } from '../../output.ts';
import { runSkillsNpm, wireSkillsToProject } from '../../skills/index.ts';
import { createSubcommand } from '../../types.ts';

export const setupSubcommand = createSubcommand({
	name: 'setup',
	description: 'Add @agentuity/skills, skills-npm, and a prepare hook to the current project',
	tags: ['mutating'],
	examples: [
		{
			command: getCommand('skills setup'),
			description: 'Configure npm skills for the current project',
		},
	],
	schema: {
		options: z.object({
			sync: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run skills-npm after wiring (use --no-sync to skip)'),
		}),
	},

	async handler(ctx) {
		const { opts, logger, options } = ctx;
		const projectDir = process.cwd();

		const result = await wireSkillsToProject({ projectDir });
		let synced = false;
		let syncExitCode: number | undefined;

		if (opts.sync !== false) {
			logger.info('Syncing skills to agent directories...');
			const exitCode = await runSkillsNpm({ cwd: projectDir });
			if (exitCode !== 0) {
				syncExitCode = exitCode;
				logger.warn(
					'skills-npm sync failed — run `bun install` (or npm install) then `agentuity skills sync`'
				);
			} else {
				synced = true;
			}
		}

		if (isJSONMode(options)) {
			outputJSON(createSuccessResponse({ ...result, synced, syncExitCode }));
			return;
		}

		if (synced) {
			outputSuccess('Configured and synced npm agent skills for this project', options);
		} else if (result.alreadyConfigured && !result.changed) {
			outputSuccess('Agent skills are already configured for this project', options);
		} else {
			outputSuccess('Configured npm agent skills for this project', options);
		}
	},
});
