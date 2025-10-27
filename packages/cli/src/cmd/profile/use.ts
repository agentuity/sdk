import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { fetchProfiles, saveProfile } from '@/config';
import * as tui from '@/tui';

export const useCommand: SubcommandDefinition = {
	name: 'use',
	description: 'Switch to a different configuration profile',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('use')
			.alias('select')
			.argument('[name]', 'The name of the profile to use')
			.description('Switch to a different configuration profile')
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
						logger.fatal(`Profile "${name}" not found`);
					}
					targetProfile = found;
				} else {
					// If no name provided, show current profile or list available
					const current = profiles.find((p) => p.selected);
					if (current) {
						tui.info(`Current profile: ${current.name}`);
					}
					tui.newline();
					console.log('Available profiles:');
					for (const profile of profiles) {
						const marker = profile.selected ? '•' : ' ';
						console.log(`${marker} ${profile.name}`);
					}
					tui.newline();
					console.log('Usage: agentuity profile use <name>');
					return;
				}

				await saveProfile(targetProfile!.filename);
				tui.success(`Switched to profile: ${targetProfile!.name}`);
			});
	},
};

export default useCommand;
