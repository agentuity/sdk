import { createSubcommand } from '../../types.ts';
import { z } from 'zod';
import { fetchProfiles, saveProfile } from '../../config.ts';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';

const ProfileUseResponseSchema = z.object({
	success: z.boolean().describe('Whether the profile switch succeeded'),
	name: z.string().describe('Profile name'),
	path: z.string().describe('Profile file path'),
});

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
		response: ProfileUseResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
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
		if (!options.json) {
			tui.success(`Switched to profile "${name}"`);
		}

		return {
			success: true,
			name,
			path: profile!.filename,
		};
	},
});
