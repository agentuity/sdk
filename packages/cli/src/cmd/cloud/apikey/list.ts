import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { apikeyList } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all API keys',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud apikey list'), description: 'List items' },
		{ command: getCommand('cloud apikey ls'), description: 'List items' },
	],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
			projectId: z.string().optional().describe('filter by project id'),
		}),
	},

	async handler(ctx) {
		const { opts, apiClient, options } = ctx;

		const apiKeys = await tui.spinner('Fetching API keys', () => {
			return apikeyList(apiClient, {
				orgId: opts?.orgId,
				projectId: opts?.projectId,
			});
		});

		if (!options.json) {
			if (apiKeys.length === 0) {
				tui.info('No API keys found');
			} else {
				if (process.stdout.isTTY) {
					tui.newline();
					tui.success(`API Keys (${apiKeys.length}):`);
					tui.newline();
				}

				const rows = apiKeys.map((key) => ({
					ID: key.id,
					Name: key.name,
					Type: key.type,
					Project: key.project?.name ?? '-',
					'Last Used': key.lastUsedAt || 'Never',
					'Expires At': key.expiresAt ?? 'Never',
					'Created At': key.createdAt,
				}));

				tui.table(rows);
			}
		}

		return apiKeys;
	},
});
