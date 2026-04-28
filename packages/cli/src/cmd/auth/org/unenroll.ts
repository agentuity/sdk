import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { orgAuthUnenroll } from '@agentuity/server';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';

const UnenrollResponseSchema = z.object({
	success: z.boolean().describe('Whether the unenrollment succeeded'),
});

export const unenrollSubcommand = createSubcommand({
	name: 'unenroll',
	description: 'Remove the public key from the organization, disabling self-hosted infrastructure',
	tags: ['mutating', 'destructive', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('auth org unenroll'),
			description: 'Remove the public key from the current organization (with confirmation)',
		},
		{
			command: getCommand('auth org unenroll --confirm'),
			description: 'Remove the public key without confirmation prompt',
		},
	],
	requires: { auth: true, apiClient: true, org: true },
	idempotent: true,
	schema: {
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: UnenrollResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, options, opts, orgId } = ctx;

		if (!opts.confirm) {
			if (process.stdin.isTTY) {
				tui.newline();
				tui.warning(
					'Removing your public key will immediately stop all network traffic and routing to your machines and all further traffic will immediately fail.'
				);
				tui.newline();

				const confirmed = await tui.confirm(
					'Are you sure you want to remove organization authentication?',
					false
				);

				if (!confirmed) {
					tui.info('Unenrollment cancelled.');
					return { success: false };
				}
			} else {
				tui.error(
					'Non-interactive sessions require --confirm flag to unenroll. Use: ' +
						getCommand('auth org unenroll --confirm')
				);
				return { success: false };
			}
		}

		try {
			await tui.spinner({
				type: 'simple',
				message: 'Removing organization authentication...',
				callback: () => orgAuthUnenroll(apiClient, orgId),
				clearOnSuccess: true,
			});

			if (!options.json) {
				tui.success('Organization authentication removed');
			}

			return { success: true };
		} catch (ex) {
			tui.fatal(`Failed to unenroll organization: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
