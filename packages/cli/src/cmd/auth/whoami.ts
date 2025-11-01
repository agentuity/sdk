import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { whoami } from '@agentuity/server';

export const whoamiCommand = createSubcommand({
	name: 'whoami',
	description: 'Display information about the currently authenticated user',
	requires: { auth: true, apiClient: true },
	schema: {
		options: z.object({
			format: z
				.enum(['json', 'table'])
				.optional()
				.describe('the output format: json, table (default)'),
		}),
	},

	async handler(ctx) {
		const { apiClient, opts, auth } = ctx;

		const result = await tui.spinner('Fetching user information', () => {
			return whoami(apiClient);
		});

		if (!result.data) {
			tui.fatal('Failed to get user information');
		}

		const user = result.data;

		if (opts?.format === 'json') {
			console.log(
				JSON.stringify(
					{
						userId: auth?.userId,
						firstName: user.firstName,
						lastName: user.lastName,
						organizations: user.organizations,
					},
					null,
					2
				)
			);
		} else {
			const fullName = `${user.firstName} ${user.lastName}`;

			tui.newline();
			console.log(tui.bold('Currently logged in as:'));
			tui.newline();
			console.log(`  ${tui.padRight('Name:', 15, ' ')} ${tui.bold(fullName)}`);
			console.log(`  ${tui.padRight('User ID:', 15, ' ')} ${tui.muted(auth?.userId || '')}`);
			tui.newline();

			if (user.organizations.length > 0) {
				console.log(tui.bold('Organizations:'));
				tui.newline();
				for (const org of user.organizations) {
					console.log(`  ${tui.padRight(org.name, 30, ' ')} ${tui.muted(org.id)}`);
				}
			}
			tui.newline();
		}
	},
});
