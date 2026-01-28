import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { orgAuthStatus } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const StatusResponseSchema = z.object({
	publicKey: z.string().nullable().describe('The public key or null if not set'),
});

export const statusSubcommand = createSubcommand({
	name: 'status',
	aliases: ['show'],
	description: 'Get the current public key status for an organization',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('auth org status'),
			description: 'Show the current public key for the organization',
		},
		{
			command: getCommand('auth org show'),
			description: 'Show the current public key (alias)',
		},
	],
	requires: { auth: true, apiClient: true, org: true },
	idempotent: true,
	schema: {
		response: StatusResponseSchema,
	},
	async handler(ctx) {
		const { apiClient, options, orgId } = ctx;

		try {
			const result = await tui.spinner({
				type: 'simple',
				message: 'Fetching organization authentication status...',
				callback: () => orgAuthStatus(apiClient, orgId),
				clearOnSuccess: true,
			});

			if (!options.json) {
				if (result.publicKey) {
					tui.success('Organization authentication is configured');
					tui.newline();
					console.log(tui.bold('Public Key:'));
					tui.newline();
					console.log(result.publicKey);
				} else {
					tui.info('No public key is configured for this organization');
					tui.newline();
					tui.info(
						`Use '${getCommand('auth org enroll --file ./public-key.pem')}' to set up machine authentication.`
					);
				}
			}

			return { publicKey: result.publicKey };
		} catch (ex) {
			tui.fatal(`Failed to get organization authentication status: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
