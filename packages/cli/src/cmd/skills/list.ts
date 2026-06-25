import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { createSuccessResponse, isJSONMode, outputJSON } from '../../output.ts';
import { listBundledSkills, SKILLS_PACKAGE } from '../../skills/index.ts';
import * as tui from '../../tui.ts';
import { createSubcommand } from '../../types.ts';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List skills bundled in the installed @agentuity/skills package',
	tags: ['read-only', 'fast'],
	examples: [
		{
			command: getCommand('skills list'),
			description: 'Show available Agentuity skills from node_modules',
		},
	],
	schema: {
		options: z.object({}),
	},

	async handler(ctx) {
		const { logger, options } = ctx;
		const projectDir = process.cwd();
		const skills = await listBundledSkills(projectDir);

		if (isJSONMode(options)) {
			outputJSON(createSuccessResponse({ skills, package: SKILLS_PACKAGE }));
			return;
		}

		if (skills.length === 0) {
			logger.info(
				`No skills found — run \`agentuity skills install\` to install ${SKILLS_PACKAGE}`
			);
			return;
		}

		tui.table(
			skills.map((skill) => ({
				Skill: skill.name,
				Description: skill.description ?? '',
			})),
			['Skill', 'Description']
		);
	},
});
