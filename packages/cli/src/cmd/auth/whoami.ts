import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { whoami } from '@agentuity/server';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';

const WhoamiResponseSchema = z.object({
	userId: z.string().describe('Unique user identifier'),
	firstName: z.string().describe('User first name'),
	lastName: z.string().describe('User last name'),
	organizations: z
		.array(
			z.object({
				id: z.string().describe('Organization ID'),
				name: z.string().describe('Organization name'),
			})
		)
		.describe('Organizations the user belongs to'),
});

export const whoamiCommand = createSubcommand({
	name: 'whoami',
	description: 'Display information about the currently authenticated user',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		response: WhoamiResponseSchema,
	},
	examples: [getCommand('auth whoami'), getCommand('--json auth whoami')],

	async handler(ctx) {
		const { apiClient, auth, options } = ctx;

		const user = await tui.spinner({
			message: 'Fetching user information',
			clearOnSuccess: true,
			callback: () => {
				return whoami(apiClient);
			},
		});

		const result = {
			userId: auth?.userId || '',
			firstName: user.firstName,
			lastName: user.lastName,
			organizations: user.organizations,
		};

		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
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

		return result;
	},
});
