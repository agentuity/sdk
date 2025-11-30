import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const SecretGetResponseSchema = z.object({
	key: z.string().describe('Secret key name'),
	value: z.string().describe('Secret value'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a secret value',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	examples: [
		{ command: getCommand('secret get DATABASE_URL'), description: 'Get item details' },
		{
			command: getCommand('secret get STRIPE_SECRET_KEY --no-mask'),
			description: 'Use no mask option',
		},
	],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().describe('the secret key'),
		}),
		options: z.object({
			mask: z
				.boolean()
				.default(!!process.stdout.isTTY)
				.describe('mask the value in output (default: true in TTY, false otherwise)'),
		}),
		response: SecretGetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, apiClient, project, options } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching secrets', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		// Look for the key in secrets
		const value = projectData.secrets?.[args.key];

		if (value === undefined) {
			tui.fatal(`Secret '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		if (!options.json) {
			if (process.stdout.isTTY) {
				// Display the value, masked by default
				if (opts?.mask) {
					tui.success(`${args.key}=${tui.maskSecret(value)}`);
				} else {
					tui.success(`${args.key}=${value}`);
				}
			} else {
				// Display the value, masked by default
				if (opts?.mask) {
					console.log(`${args.key}=${tui.maskSecret(value)}`);
				} else {
					console.log(`${args.key}=${value}`);
				}
			}
		}

		return {
			key: args.key,
			value,
		};
	},
});
