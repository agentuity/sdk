import type { CommandDefinition, CommandContext } from '@/types';
import { Command } from 'commander';
import loginCommand from './login';
import logoutCommand from './logout';

export const authCommand: CommandDefinition = {
	name: 'auth',
	description: 'Authentication and authorization related commands',
	subcommands: [loginCommand, logoutCommand],

	register(program: Command, ctx: CommandContext) {
		const auth = program
			.command('auth')
			.description('Authentication and authorization related commands')
			.action(() => {
				auth.help();
			});

		if (this.subcommands) {
			for (const sub of this.subcommands) {
				sub.register(auth, ctx);
			}
		}
	},
};

export default authCommand;
