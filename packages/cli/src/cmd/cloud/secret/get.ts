import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { maskSecret } from '../../../env-util';
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
		getCommand('secret get DATABASE_URL'),
		getCommand('secret get STRIPE_SECRET_KEY --no-mask'),
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
		const { args, opts, apiClient, project } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching secrets', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		// Look for the key in secrets
		const value = projectData.secrets?.[args.key];

		if (value === undefined) {
			tui.fatal(`Secret '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		if (process.stdout.isTTY) {
			// Display the value, masked by default
			if (opts?.mask) {
				tui.success(`${args.key}=${maskSecret(value)}`);
			} else {
				tui.success(`${args.key}=${value}`);
			}
		} else {
			// Display the value, masked by default
			if (opts?.mask) {
				console.log(`${args.key}=${maskSecret(value)}`);
			} else {
				console.log(`${args.key}=${value}`);
			}
		}

		return {
			key: args.key,
			value,
		};
	},
});
