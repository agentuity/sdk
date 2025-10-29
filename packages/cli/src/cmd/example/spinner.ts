import { createSubcommand } from '../../types';
import * as tui from '../../tui';

export const spinnerSubcommand = createSubcommand({
	name: 'spinner',
	description: 'Demo of spinner TUI component',

	async handler() {
		await tui.spinner('Loading configuration...', async () => {
			await Bun.sleep(2000);
			return { loaded: true };
		});

		await tui.spinner('Fetching data...', Bun.sleep(1500));

		const result = await tui.spinner('Processing...', async () => {
			await Bun.sleep(1000);
			return 42;
		});

		tui.info(`Result: ${result}`);

		// Spinner with progress tracking
		await tui.spinner({
			type: 'progress',
			message: 'Downloading file...',
			callback: async (progress) => {
				for (let i = 0; i <= 100; i += 5) {
					progress(i);
					await Bun.sleep(100);
				}
			},
		});

		try {
			await tui.spinner('This will fail...', async () => {
				await Bun.sleep(1000);
				throw new Error('Something went wrong!');
			});
		} catch (err) {
			tui.error(`Caught error: ${err instanceof Error ? err.message : String(err)}`);
		}
	},
});
