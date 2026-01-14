import { z } from 'zod';
import { createCommand } from '../../types';
import { hasLoggedInBefore } from '../../auth';
import { showBanner } from '../../banner';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

const validateToken = /[\d]{7,}\.[\w-_.]{22}/;

export const command = createCommand({
	name: 'setup',
	description: 'Display first-run setup information (internal use)',
	hidden: true,
	skipUpgradeCheck: true,
	skipSkill: true,
	tags: ['read-only', 'fast'],
	schema: {
		options: z.object({
			nonInteractive: z.boolean().optional().describe('Run in non-interactive mode'),
			setupToken: z.string().optional().describe('Use a one-time use setup token'),
		}),
	},

	async handler(ctx) {
		const { opts } = ctx;
		const _nonInteractive = opts.nonInteractive ?? false;

		// validate the one time setup token if provided
		if (opts?.setupToken && opts.setupToken !== '-' && validateToken.test(opts.setupToken)) {
			const [hours] = opts.setupToken.split('.');
			if (hours) {
				const now = Math.round(Date.now() / (60_000 * 5));
				if (now === +hours) {
					const ok = await tui.spinner({
						message: 'Validating your identity',
						clearOnSuccess: true,
						callback: async () => {
							const newargs = process.argv.map((x) => (x === 'setup' ? 'login' : x));
							const r = Bun.spawn({
								cmd: newargs.concat('--json'),
								stdout: 'pipe',
								stderr: 'inherit',
							});
							await r.exited;
							try {
								const res = JSON.parse(await r.stdout.text()) as { success: boolean };
								return res.success;
							} catch (ex) {
								/* fall through */
							}
							return false;
						},
					});
					if (ok) {
						/* TODO */
						return;
					}
				}
			}
		}

		tui.newline();
		showBanner();
		tui.newline();

		if (!hasLoggedInBefore()) {
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
