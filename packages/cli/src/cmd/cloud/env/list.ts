import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';

const EnvItemSchema = z.object({
	value: z.string().describe('Variable value'),
	secret: z.boolean().describe('Whether this is a secret'),
});

const EnvListResponseSchema = z.record(z.string(), EnvItemSchema);

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all environment variables and secrets',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	examples: [
		{ command: getCommand('env list'), description: 'List all variables' },
		{ command: getCommand('env list --no-mask'), description: 'Show unmasked values' },
		{ command: getCommand('env list --secrets'), description: 'List only secrets' },
		{ command: getCommand('env list --env-only'), description: 'List only env vars' },
	],
	requires: { auth: true, project: true, apiClient: true },
	idempotent: true,
	schema: {
		options: z.object({
			mask: z
				.boolean()
				.default(true)
				.describe('mask secret values in output (use --no-mask to show values)'),
			secrets: z.boolean().default(false).describe('list only secrets'),
			'env-only': z.boolean().default(false).describe('list only environment variables'),
		}),
		response: EnvListResponseSchema,
	},
	webUrl: (ctx) => `/projects/${encodeURIComponent(ctx.project.projectId)}/settings`,

	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;

		// Fetch project with unmasked values
		const projectData = await tui.spinner('Fetching variables', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		const env = projectData.env || {};
		const secrets = projectData.secrets || {};

		// Build combined result with type info
		const result: Record<string, { value: string; secret: boolean }> = {};

		// Filter based on options
		const showEnv = !opts?.secrets;
		const showSecrets = !opts?.['env-only'];

		if (showEnv) {
			for (const [key, value] of Object.entries(env)) {
				result[key] = { value, secret: false };
			}
		}

		if (showSecrets) {
			for (const [key, value] of Object.entries(secrets)) {
				result[key] = { value, secret: true };
			}
		}

		// Skip TUI output in JSON mode
		if (!options.json) {
			if (Object.keys(result).length === 0) {
				tui.info('No variables found');
			} else {
				if (process.stdout.isTTY) {
					tui.newline();

					const envCount = showEnv ? Object.keys(env).length : 0;
					const secretCount = showSecrets ? Object.keys(secrets).length : 0;
					const parts: string[] = [];
					if (envCount > 0) parts.push(`${envCount} env`);
					if (secretCount > 0)
						parts.push(`${secretCount} secret${secretCount !== 1 ? 's' : ''}`);

					tui.info(`Variables (${parts.join(', ')}):`);
					tui.newline();
				}

				const sortedKeys = Object.keys(result).sort();
				const shouldMask = opts?.mask !== false;

				for (const key of sortedKeys) {
					const { value, secret } = result[key];
					const displayValue = shouldMask && secret ? tui.maskSecret(value) : value;
					const typeIndicator = secret ? ' [secret]' : '';

					if (process.stdout.isTTY) {
						console.log(`${tui.bold(key)}=${displayValue}${tui.muted(typeIndicator)}`);
					} else {
						console.log(`${key}=${displayValue}${typeIndicator}`);
					}
				}
			}
		}

		return result;
	},
});
