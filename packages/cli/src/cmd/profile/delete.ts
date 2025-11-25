import { createSubcommand } from '../../types';
import { z } from 'zod';
import { fetchProfiles } from '../../config';
import { unlink } from 'node:fs/promises';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

export const deleteCommand = createSubcommand({
	name: 'delete',
	description: 'Delete a configuration profile',
	tags: ['destructive', 'deletes-resource', 'fast'],
	idempotent: false,
	aliases: ['remove', 'rm', 'del'],
	examples: [
		getCommand('profile delete staging'),
		getCommand('profile delete old-dev --confirm'),
		getCommand('profile delete'),
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('The name of the profile to delete'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompt'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether deletion succeeded'),
			name: z.string().describe('Deleted profile name'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts } = ctx;
		let { name } = args;

		const profiles = await fetchProfiles();

		if (!name) {
			name = await tui.showProfileList(profiles, 'Select profile to delete:');
		}

		const profile = profiles.find((p) => p.name === name);

		if (!profile) {
			return logger.fatal(`Profile "${name}" not found`, ErrorCode.RESOURCE_NOT_FOUND) as never;
		}

		// Ask for confirmation unless --confirm flag is passed
		if (!opts?.confirm) {
			const confirmed = await tui.confirm(`Delete profile "${name}"?`, false);
			if (!confirmed) {
				logger.info('Cancelled');
				return { success: false, name };
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

			return { success: true, name };
		} catch (error) {
			return logger.fatal(
				`Failed to delete profile: ${error}`,
				ErrorCode.FILE_WRITE_ERROR
			) as never;
		}
	},
});
