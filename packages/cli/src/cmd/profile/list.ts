import { z } from 'zod';
import { createSubcommand } from '../../types';
import { fetchProfiles } from '../../config';
import { basename, dirname } from 'node:path';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

const ProfileListResponseSchema = z.array(
	z.object({
		name: z.string().describe('Profile name'),
		filename: z.string().describe('Profile file path'),
		selected: z.boolean().describe('Whether this profile is currently selected'),
	})
);

export const listCommand = createSubcommand({
	name: 'list',
	description: 'List all available profiles',
	tags: ['read-only', 'fast'],
	idempotent: true,
	aliases: ['ls'],
	examples: [getCommand('profile list'), getCommand('profile ls')],
	schema: {
		response: ProfileListResponseSchema,
	},

	async handler(ctx) {
		const { options } = ctx;
		const profiles = await fetchProfiles();

		if (!options.json) {
			if (profiles.length === 0) {
				tui.info('No profiles found');
			} else {
				console.log('Available profiles:');
				for (const profile of profiles) {
					const marker = profile.selected ? '•' : ' ';
					const name = tui.padRight(profile.name, 15, ' ');
					const path = `${basename(dirname(profile.filename))}/${basename(profile.filename)}`;
					console.log(`${marker} ${name} ${tui.muted(path)}`);
				}
			}
		}

		return profiles.map((p) => ({
			name: p.name,
			filename: p.filename,
			selected: p.selected,
		}));
	},
});
