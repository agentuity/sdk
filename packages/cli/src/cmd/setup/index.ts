import { z } from 'zod';
import { createCommand } from '../../types';
import { showBanner } from '../../banner';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'setup',
	description: 'Display first-run setup information (internal use)',
	hidden: true,
	skipUpgradeCheck: true,
	tags: ['read-only', 'fast'],
	schema: {
		options: z.object({
			cliVersion: z.string().optional().describe('Version to display in the banner'),
		}),
	},

	async handler(ctx) {
		const { opts } = ctx;

		tui.newline();
		showBanner(opts.cliVersion);
		tui.newline();

		tui.output(`${tui.muted('To get started, run:')}`);
		tui.newline();
		tui.output(
			`${getCommand('login')}        ${tui.muted('Login to an existing account (or signup)')}`
		);
		tui.output(`${getCommand('create')}       ${tui.muted('Create a project')}`);
		tui.output(`${getCommand('help')}         ${tui.muted('List commands and options')}`);

		return undefined;
	},
});
