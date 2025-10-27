import type { SubcommandDefinition, CommandContext } from '../../types';
import { Command } from 'commander';
import * as tui from '../../tui';

export const spinnerSubcommand: SubcommandDefinition = {
	name: 'spinner',
	description: 'Demo of spinner TUI component',

	register(program: Command, _ctx: CommandContext) {
		program
			.command('spinner')
			.description('Demo of spinner TUI component')
			.action(async () => {
				// Example 1: Success case
				await tui.spinner('Loading configuration...', async () => {
					await Bun.sleep(2000);
					return { loaded: true };
				});

				// Example 2: Another success case with Promise directly
				await tui.spinner('Fetching data...', Bun.sleep(1500));

				// Example 3: Success with return value
				const result = await tui.spinner('Processing...', async () => {
					await Bun.sleep(1000);
					return 42;
				});

				tui.info(`Result: ${result}`);

				// Example 4: Error case (uncomment to test)
				try {
					await tui.spinner('This will fail...', async () => {
						await Bun.sleep(1000);
						throw new Error('Something went wrong!');
					});
				} catch (err) {
					tui.error(`Caught error: ${err instanceof Error ? err.message : String(err)}`);
				}
			});
	},
};
