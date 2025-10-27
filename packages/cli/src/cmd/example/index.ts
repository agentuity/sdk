import type { CommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { stepsSubcommand } from './steps';
import { spinnerSubcommand } from './spinner';

export const exampleCommand: CommandDefinition = {
	name: 'example',
	description: 'Example command with subcommands',
	subcommands: [createSubcommand, listSubcommand, stepsSubcommand, spinnerSubcommand],

	register(program: Command, ctx: CommandContext) {
		const cmd = program.command('example').description('Example command with subcommands');

		if (this.subcommands) {
			for (const sub of this.subcommands) {
				sub.register(cmd, ctx);
			}
		}

		cmd.action(() => {
			cmd.help();
		});
	},
};

export default exampleCommand;
