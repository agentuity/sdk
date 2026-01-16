import { z } from 'zod';
import { createSubcommand, type CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import type { CLISchema } from '../../../schema-generator';
import * as tui from '../../../tui';
import * as path from 'node:path';
import { generateSkills, collectSkillsForPreview } from './generator';

const OptionsSchema = z.object({
	output: z.string().describe('Output directory for generated skills'),
	includeHidden: z.boolean().default(false).describe('Include hidden commands'),
});

export const generateSubcommand = createSubcommand({
	name: 'generate',
	description: 'Generate Agent Skills from CLI schema',
	tags: ['fast'],
	idempotent: true,
	examples: [
		{
			command: getCommand('ai skills generate --output ./skills'),
			description: 'Generate skills to a directory',
		},
		{
			command: getCommand('--dry-run ai skills generate --output ./skills'),
			description: 'Preview without writing files',
		},
		{
			command: getCommand('ai skills generate --output ./skills --include-hidden'),
			description: 'Include hidden commands',
		},
	],
	schema: {
		options: OptionsSchema,
	},
	async handler(ctx: CommandContext<undefined, undefined, undefined, typeof OptionsSchema>) {
		const { logger, opts, options } = ctx;
		const { output, includeHidden } = opts;
		const dryRun = options.dryRun === true;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const schema = (global as any).__CLI_SCHEMA__ as CLISchema | undefined;

		if (!schema) {
			return logger.fatal('Schema not available. This is a CLI bug.', ErrorCode.INTERNAL_ERROR);
		}

		const baseDir = path.join(output, 'skills', 'agentuity', 'cli');

		if (dryRun) {
			const skills = collectSkillsForPreview(schema, output, includeHidden);
			if (skills.length === 0) {
				logger.warn('No skills to generate');
				return;
			}
			tui.info(`Would generate ${skills.length} skills:`);
			for (const skillPath of skills) {
				console.log(tui.muted(`  ${skillPath}`));
			}
			return;
		}

		const created = await generateSkills(schema, output, includeHidden);

		if (created === 0) {
			logger.warn('No skills to generate');
			return;
		}

		tui.success(`Generated ${created} skills to ${baseDir}`);
	},
});

export default generateSubcommand;
