import { createSubcommand, ConfigSchema } from '../../types';
import { z } from 'zod';
import { fetchProfiles, loadConfig } from '../../config';
import { readFile } from 'node:fs/promises';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

const ProfileShowResponseSchema = ConfigSchema;

export const showCommand = createSubcommand({
	name: 'show',
	description: 'Show the configuration of a profile',
	tags: ['read-only', 'fast'],
	aliases: ['current'],
	examples: [
		{ command: getCommand('profile show'), description: 'Show details' },
		{ command: getCommand('profile show production'), description: 'Show details' },
		{
			command: getCommand('profile show staging --json'),
			description: 'Show output in JSON format',
		},
	],
	schema: {
		args: z
			.object({
				name: z.string().optional().describe('Profile name to show (optional)'),
			})
			.describe('Profile show arguments'),
		response: ProfileShowResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { logger, args, options } = ctx;

		try {
			let current = false;
			let name = args.name;

			const profiles = await fetchProfiles();

			if (!name) {
				name = await tui.showProfileList(profiles, 'Select profile to show:');
			}

			const profile = profiles.find((p) => p.name === name);

			if (!profile) {
				return logger.fatal(
					`Profile "${name}" not found`,
					ErrorCode.RESOURCE_NOT_FOUND
				) as never;
			}

			const profilePath = profile.filename;
			current = profile.selected;

			const content = await loadConfig(current ? undefined : profilePath);
			if (!content) {
				return logger.fatal(
					`Failed to load profile configuration`,
					ErrorCode.INTERNAL_ERROR
				) as never;
			}

			if (!options.json) {
				tui.info(`Profile: ${profilePath}`);
				tui.newline();
				const textContent = await readFile(profilePath, 'utf-8');
				console.log(textContent);
			}

			return content;
		} catch (error) {
			if (error instanceof Error) {
				return logger.fatal(`Failed to show profile: ${error.message}`) as never;
			} else {
				return logger.fatal('Failed to show profile') as never;
			}
		}
	},
});
