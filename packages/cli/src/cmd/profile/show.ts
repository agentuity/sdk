import { createSubcommand } from '../../types';
import { z } from 'zod';
import { fetchProfiles, loadConfig } from '../../config';
import { readFile } from 'node:fs/promises';
import * as tui from '../../tui';

export const showCommand = createSubcommand({
	name: 'show',
	description: 'Show the configuration of a profile',
	aliases: ['current'],
	schema: {
		options: z.object({
			json: z.boolean().optional().describe('Show the JSON config'),
		}),
		args: z
			.object({
				name: z.string().optional().describe('Profile name to show (optional)'),
			})
			.describe('Profile show arguments'),
	},

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
				return logger.fatal(`Profile "${name}" not found`);
			}

			const profilePath = profile.filename;
			current = profile.selected;

			tui.info(`Profile: ${profilePath}`);

			if (opts?.json) {
				const content = await loadConfig(current ? undefined : profilePath);
				console.log(JSON.stringify(content, null, 2));
			} else {
				tui.newline();
				const content = await readFile(profilePath, 'utf-8');
				console.log(content);
			}
		} catch (error) {
			if (error instanceof Error) {
				logger.fatal(`Failed to show profile: ${error.message}`);
			} else {
				logger.fatal('Failed to show profile');
			}
		}
	},
});
