import { createSubcommand } from '../../types';
import { z } from 'zod';
import { getProfile, fetchProfiles } from '../../config';
import { readFile } from 'node:fs/promises';
import * as tui from '../../tui';

export const showCommand = createSubcommand({
	name: 'show',
	description: 'Show the configuration of a profile (defaults to current)',
	aliases: ['current'],
	schema: {
		args: z
			.object({
				name: z.string().optional().describe('Profile name to show (optional)'),
			})
			.describe('Profile show arguments'),
	},

	async handler(ctx) {
		const { logger, args } = ctx;

		try {
			let profilePath: string;

			if (args.name) {
				// Find profile by name
				const profiles = await fetchProfiles();
				const profile = profiles.find((p) => p.name === args.name);

				if (!profile) {
					return logger.fatal(`Profile "${args.name}" not found`);
				}

				profilePath = profile.filename;
			} else {
				// Use current profile
				profilePath = await getProfile();
			}

			const content = await readFile(profilePath, 'utf-8');

			tui.info(`Profile: ${profilePath}`);
			tui.newline();

			console.log(content);
		} catch (error) {
			if (error instanceof Error) {
				logger.fatal(`Failed to show profile: ${error.message}`);
			} else {
				logger.fatal('Failed to show profile');
			}
		}
	},
});
