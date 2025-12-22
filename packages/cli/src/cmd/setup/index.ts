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
	skipSkill: true,
	tags: ['read-only', 'fast'],
	optional: { auth: true },
	schema: {
		options: z.object({
			nonInteractive: z.boolean().optional().describe('Run in non-interactive mode'),
		}),
	},

	async handler(ctx) {
		const { opts, auth } = ctx;
		const _nonInteractive = opts.nonInteractive ?? false;

		tui.newline();
		showBanner();
		tui.newline();

		if (!auth?.expires) {
			tui.output(`${tui.muted('To get started, run:')}`);
			tui.newline();
			tui.output(
				`${tui.colorPrimary(getCommand('login'))}        ${tui.muted('Login to an existing account (or signup)')}`
			);
			tui.output(
				`${tui.colorPrimary(getCommand('create'))}       ${tui.muted('Create a project')}`
			);
			tui.output(
				`${tui.colorPrimary(getCommand('help'))}         ${tui.muted('List commands and options')}`
			);
		} else {
			tui.success('Welcome back! 🙌');
		}

		return undefined;
	},
});
