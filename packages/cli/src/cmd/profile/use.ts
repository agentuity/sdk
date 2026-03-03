import { createSubcommand } from '../../types';
import { z } from 'zod';
import { fetchProfiles, saveProfile } from '../../config';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

export const useCommand = createSubcommand({
	name: 'use',
	description: 'Switch to a different configuration profile',
	tags: ['mutating', 'updates-resource', 'fast'],
	aliases: ['switch'],
	idempotent: true,
	examples: [
		{
			command: getCommand('profile use production'),
			description: 'Switch to the "production" profile',
		},
		{
			command: getCommand('profile switch staging'),
			description: 'Switch to the "staging" profile',
		},
		{
			command: getCommand('profile use'),
			description: 'Show interactive profile selection menu',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('The name of the profile to use'),
		}),
	},

	async handler(ctx) {
		const { args } = ctx;
		let { name } = args;

		const profiles = await fetchProfiles();

		if (!name) {
			name = await tui.showProfileList(profiles, 'Select profile to use:');
		}

		const profile = profiles.find((p) => p.name === name);

		if (!profile) {
			tui.fatal(`Profile "${name}" not found`);
		}

		await saveProfile(profile!.filename);
		tui.success(`Switched to profile "${name}"`);
	},
});
