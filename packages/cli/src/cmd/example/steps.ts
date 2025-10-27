import type { SubcommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';
import { runSteps } from '../../steps';

export const stepsSubcommand: SubcommandDefinition = {
	name: 'steps',
	description: 'Demo of step progress UI component',

	register(program: Command, _ctx: CommandContext) {
		program
			.command('steps')
			.description('Demo of step progress UI component')
			.action(async () => {
				await runSteps([
					{
						label: 'Launching application...',
						run: async () => {
							await Bun.sleep(1500);
							return { status: 'success' };
						},
					},
					{
						label: 'Installing dependencies...',
						run: async () => {
							await Bun.sleep(2000);
							return { status: 'success' };
						},
					},
					{
						label: 'Checking for updates...',
						run: async () => {
							await Bun.sleep(800);
							return { status: 'skipped', reason: 'already up to date' };
						},
					},
					{
						label: 'Registering service...',
						run: async () => {
							await Bun.sleep(1200);
							return { status: 'success' };
						},
					},
					{
						label: 'Building project...',
						run: async () => {
							await Bun.sleep(1800);
							return { status: 'success' };
						},
					},
					{
						label: 'Deploying the app ...',
						run: async () => {
							await Bun.sleep(1200);
							return { status: 'error', message: 'something bad happened' };
						},
					},
				]);
			});
	},
};
