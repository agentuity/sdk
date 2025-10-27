import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { fetchProfiles, getDefaultConfigPath, saveProfile } from '@/config';
import { unlink } from 'node:fs/promises';
import * as tui from '@/tui';

export const deleteCommand: SubcommandDefinition = {
	name: 'delete',
	description: 'Delete a configuration profile',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('delete')
			.alias('rm')
			.alias('del')
			.argument('[name]', 'The name of the profile to delete')
			.description('Delete a configuration profile')
			.action(async (name?: string) => {
				const { logger } = ctx;
				const profiles = await fetchProfiles();

				if (profiles.length === 0) {
					logger.fatal('No profiles found');
				}

				let targetProfile;

				if (name) {
					const found = profiles.find((p) => p.name === name);
					if (!found) {
						tui.error(`Profile "${name}" not found`);
						tui.newline();
						console.log('Available profiles:');
						for (const profile of profiles) {
							tui.bullet(profile.name);
						}
						logger.fatal('');
					}
					targetProfile = found;
				} else {
					console.log('Available profiles to delete:');
					for (const profile of profiles) {
						const marker = profile.selected ? '•' : ' ';
						console.log(`${marker} ${profile.name}`);
					}
					tui.newline();
					console.log('Usage: agentuity profile delete <name>');
					return;
				}

				const defaultConfigPath = getDefaultConfigPath();
				if (targetProfile!.filename === defaultConfigPath) {
					logger.fatal('Cannot delete the default config.yaml profile');
				}

				try {
					await unlink(targetProfile!.filename);
					tui.success(`Deleted profile "${targetProfile!.name}"`);

					if (targetProfile!.selected) {
						console.log('Switching to default profile...');
						await saveProfile(defaultConfigPath);
					}
				} catch (error) {
					logger.fatal(`Failed to delete profile: ${error}`);
				}
			});
	},
};
