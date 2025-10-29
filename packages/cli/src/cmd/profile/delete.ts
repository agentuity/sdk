import { createSubcommand } from '../../types';
import { z } from 'zod';
import { fetchProfiles } from '../../config';
import { unlink } from 'node:fs/promises';
import * as tui from '../../tui';

export const deleteCommand = createSubcommand({
	name: 'delete',
	description: 'Delete a configuration profile',
	aliases: ['remove', 'rm'],
	schema: {
		args: z.object({
			name: z.string().describe('The name of the profile to delete'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompt'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts } = ctx;
		const { name } = args;

		const profiles = await fetchProfiles();
		const profile = profiles.find((p) => p.name === name);

		if (!profile) {
			return logger.fatal(`Profile "${name}" not found`);
		}

		// Ask for confirmation unless --confirm flag is passed
		if (!opts?.confirm) {
			const confirmed = await tui.confirm(`Delete profile "${name}"?`, false);
			if (!confirmed) {
				logger.info('Cancelled');
				return;
			}
		}

		try {
			await unlink(profile.filename);
			tui.success(`Deleted profile "${name}"`);
			if (profile.selected) {
				tui.warning(
					'The active profile was deleted. Use "profile use <name>" to select a new default.'
				);
			}
		} catch (error) {
			logger.fatal(`Failed to delete profile: ${error}`);
		}
	},
});
