import { z } from 'zod';
import { createSubcommand as createSubcommandHelper } from '../../../types';
import * as tui from '../../../tui';
import { apikeyCreate } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { parseExpiresAt } from '../../../utils/date';

const APIKeyCreateResponseSchema = z.object({
	id: z.string().describe('the API key id'),
	value: z.string().describe('the API key value'),
});

export const createSubcommand = createSubcommandHelper({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new API key',
	tags: ['destructive', 'creates-resource', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud apikey create --name "My API Key" --expires-at 1y'),
			description: 'Create API key with 1 year expiration',
		},
		{
			command: getCommand('cloud apikey create --name "Short-lived Key" --expires-at 30d'),
			description: 'Create API key with 30 day expiration',
		},
		{
			command: getCommand(
				'cloud apikey create --name "Production Key" --expires-at 2026-01-01T00:00:00Z --confirm'
			),
			description: 'Create API key with specific date and skip confirmation',
		},
	],
	requires: { auth: true, apiClient: true, org: true },
	optional: { project: true },
	idempotent: false,
	schema: {
		options: z.object({
			name: z.string().describe('the name for the API key'),
			'expires-at': z
				.string()
				.describe(
					'expiration date as ISO 8601 (2025-12-31T23:59:59Z) or duration (1h, 2d, 30d, 1y)'
				),
			confirm: z
				.boolean()
				.optional()
				.describe('Skip confirmation prompts (required for non-TTY)'),
		}),
		response: APIKeyCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, orgId, options } = ctx;

		const skipConfirm = opts?.confirm === true;

		const projectId = project?.projectId ?? null;

		// Parse expires-at (duration or ISO date)
		let expiresAt: string;
		try {
			expiresAt = parseExpiresAt(opts['expires-at']);
		} catch (error) {
			if (error instanceof Error) {
				tui.fatal(error.message);
			}
			throw error;
		}

		// Require --confirm flag when not in a TTY
		if (!process.stdout.isTTY && !skipConfirm) {
			tui.fatal('--confirm is required in non-interactive mode');
		}

		// Confirm creation in interactive mode
		if (!skipConfirm) {
			const scope = projectId ? `project ${projectId}` : `organization ${orgId}`;
			const confirmed = await tui.confirm(`Create API key "${opts.name}" for ${scope}?`);
			if (!confirmed) {
				tui.fatal('Operation cancelled');
			}
		}

		const result = await tui.spinner('Creating API key', () => {
			return apikeyCreate(apiClient, {
				name: opts.name,
				expiresAt: expiresAt,
				projectId: projectId,
				orgId: orgId,
			});
		});

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
					'Expires At': expiresAt,
				},
			];

			tui.table(rows);
		}

		return result;
	},
});
