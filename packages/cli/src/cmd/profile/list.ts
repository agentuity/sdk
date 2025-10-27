import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { fetchProfiles } from '@/config';
import { basename, dirname } from 'node:path';
import * as tui from '@/tui';

export const listCommand: SubcommandDefinition = {
	name: 'list',
	description: 'List all available profiles',

	register(parent: Command, _ctx: CommandContext) {
		parent
			.command('list')
			.alias('ls')
			.description('List all available profiles')
			.action(async () => {
				const profiles = await fetchProfiles();

				if (profiles.length === 0) {
					tui.info('No profiles found');
					return;
				}

				console.log('Available profiles:');
				for (const profile of profiles) {
					const marker = profile.selected ? '•' : ' ';
					const name = tui.padRight(profile.name, 15, ' ');
					const path = `${dirname(profile.filename).split('/').pop()}/${basename(profile.filename)}`;
					console.log(`${marker} ${name} ${tui.muted(path)}`);
				}
			});
	},
};

export default listCommand;
