import { z } from 'zod';
import { createSubcommand as createSubcommandHelper } from '../../../types';
import * as tui from '../../../tui';
import { apikeyCreate } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';

const APIKeyCreateResponseSchema = z.object({
	id: z.string().describe('the API key id'),
	value: z.string().describe('the API key value'),
});

export const createSubcommand = createSubcommandHelper({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new API key',
	tags: ['destructive', 'creates-resource', 'slow', 'requires-auth', 'requires-project'],
	examples: [
		getCommand('cloud apikey create --name "My API Key" --expires-at 2025-12-31T23:59:59Z'),
		getCommand('cloud apikey create --name "Production Key" --expires-at 2026-01-01T00:00:00Z --confirm'),
	],
	requires: { auth: true, apiClient: true, project: true },
	idempotent: false,
	schema: {
		options: z.object({
			name: z.string().describe('the name for the API key'),
			'expires-at': z
				.string()
				.describe('the expiration date in ISO 8601 format (e.g., 2025-12-31T23:59:59Z)'),
			confirm: z.boolean().optional().describe('Skip confirmation prompts (required for non-TTY)'),
		}),
		response: APIKeyCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;

		const skipConfirm = opts?.confirm === true;

		// Require --confirm flag when not in a TTY
		if (!process.stdout.isTTY && !skipConfirm) {
			tui.fatal('--confirm is required in non-interactive mode');
		}

		// Confirm creation in interactive mode
		if (!skipConfirm) {
			const confirmed = await tui.confirm(
				`Create API key "${opts.name}" for project ${project.projectId}?`
			);
			if (!confirmed) {
				tui.fatal('Operation cancelled');
			}
		}

		let result: Awaited<ReturnType<typeof apikeyCreate>>;
		try {
			result = await tui.spinner('Creating API key', () => {
				return apikeyCreate(apiClient, {
					name: opts.name,
					expiresAt: opts['expires-at'],
					projectId: project.projectId,
				});
			});
		} catch (error) {
			if (error instanceof Error) {
				tui.fatal(error.message);
			}
			throw error;
		}

		if (!options.json) {
			tui.newline();
			tui.success('API key created successfully!');
			tui.newline();
			tui.warn('Make sure to copy the API key value now. You will not be able to see it again.');
			tui.newline();

			const rows = [
				{
					ID: result.id,
					Name: opts.name,
					Value: result.value,
					'Expires At': opts['expires-at'],
				},
			];

			tui.table(rows);
		}

		return result;
	},
});
