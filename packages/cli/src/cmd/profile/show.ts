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
		getCommand('profile show'),
		getCommand('profile show production'),
		getCommand('profile show staging --json'),
	],
	schema: {
		options: z.object({
			json: z.boolean().optional().describe('Show the JSON config'),
		}),
		args: z
			.object({
				name: z.string().optional().describe('Profile name to show (optional)'),
			})
			.describe('Profile show arguments'),
		response: ProfileShowResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { logger, args, opts } = ctx;

		try {
			let current = false;
			let name = args.name;

			const profiles = await fetchProfiles();

			if (!name) {
				name = await tui.showProfileList(profiles, 'Select profile to show:');
			}

			const profile = profiles.find((p) => p.name === name);

			if (!profile) {
				return logger.fatal(`Profile "${name}" not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			const profilePath = profile.filename;
			current = profile.selected;

			tui.info(`Profile: ${profilePath}`);

			const content = await loadConfig(current ? undefined : profilePath);

			if (opts?.json) {
				console.log(JSON.stringify(content, null, 2));
			} else {
				tui.newline();
				const textContent = await readFile(profilePath, 'utf-8');
				console.log(textContent);
			}

			return content;
		} catch (error) {
			if (error instanceof Error) {
				logger.fatal(`Failed to show profile: ${error.message}`);
			} else {
				logger.fatal('Failed to show profile');
			}
		}
	},
});
