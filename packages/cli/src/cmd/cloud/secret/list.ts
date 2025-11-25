import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { maskSecret } from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const SecretListResponseSchema = z.record(z.string(), z.string().describe('Secret value'));

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all secrets',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	examples: [getCommand('secret list'), getCommand('secret list --no-mask')],
	requires: { auth: true, project: true, apiClient: true },
	idempotent: true,
	schema: {
		options: z.object({
			mask: z
				.boolean()
				.default(!!process.stdout.isTTY)
				.describe('mask the values in output (default: true in TTY for secrets)'),
		}),
		response: SecretListResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching secrets', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		const secrets = projectData.secrets || {};

		// Skip TUI output in JSON mode
		if (!options.json) {
			if (Object.keys(secrets).length === 0) {
				tui.info('No secrets found');
			} else {
				// Display the secrets
				if (process.stdout.isTTY) {
					tui.newline();
					tui.success(`Secrets (${Object.keys(secrets).length}):`);
					tui.newline();
				}

				const sortedKeys = Object.keys(secrets).sort();
				// For secrets, masking is enabled by default in TTY (can be disabled with --no-mask)
				const shouldMask = opts?.mask !== false;
				for (const key of sortedKeys) {
					const value = secrets[key];
					const displayValue = shouldMask ? maskSecret(value) : value;
					if (process.stdout.isTTY) {
						console.log(`${tui.bold(key)}=${displayValue}`);
					} else {
						console.log(`${key}=${displayValue}`);
					}
				}
			}
		}

		return secrets;
	},
});
