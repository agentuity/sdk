import { createSubcommand } from '../../types';
import { z } from 'zod';
import { fetchProfiles, saveProfile } from '../../config';
import * as tui from '../../tui';

export const useCommand = createSubcommand({
	name: 'use',
	description: 'Switch to a different configuration profile',
	aliases: ['switch'],
	schema: {
		args: z.object({
			name: z.string().describe('The name of the profile to use'),
		}),
	},

	async handler(ctx) {
		const { logger, args } = ctx;
		const { name } = args;

		const profiles = await fetchProfiles();
		const profile = profiles.find((p) => p.name === name);

		if (!profile) {
			logger.fatal(`Profile "${name}" not found`);
		}

		await saveProfile(profile!.filename);
		tui.success(`Switched to profile "${name}"`);
	},
});
