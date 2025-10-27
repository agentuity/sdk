import type { CommandDefinition, CommandContext } from '@/types';
import { Command } from 'commander';
import useCommand from './use';
import listCommand from './list';
import createCommand from './create';
import { deleteCommand } from './delete';
import showCommand from './show';

export const profileCommand: CommandDefinition = {
	name: 'profile',
	description: 'Manage configuration profiles',
	subcommands: [useCommand, listCommand, createCommand, deleteCommand, showCommand],

	register(program: Command, ctx: CommandContext) {
		const profile = program
			.command('profile')
			.description('Manage configuration profiles')
			.action(() => {
				profile.help();
			});

		if (this.subcommands) {
			for (const sub of this.subcommands) {
				sub.register(profile, ctx);
			}
		}
	},
};

export default profileCommand;
