import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { apikeyGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const APIKeyDetailSchema = z.object({
	id: z.string().describe('the API key id'),
	name: z.string().describe('the API key name'),
	orgId: z.string().describe('the organization id'),
	type: z.string().describe('the API key type'),
	expiresAt: z.string().nullable().describe('the expiration date'),
	createdAt: z.string().describe('the creation date'),
	project: z
		.object({
			id: z.string().describe('the project id'),
			name: z.string().describe('the project name'),
		})
		.nullable()
		.optional()
		.describe('the associated project'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a specific API key by id',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [getCommand('cloud apikey get <id>')],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		args: z.object({
			id: z.string().describe('the API key id'),
		}),
		response: APIKeyDetailSchema,
	},

	async handler(ctx) {
		const { args, apiClient, options } = ctx;

		let apiKey: Awaited<ReturnType<typeof apikeyGet>>;
		try {
			apiKey = await tui.spinner('Fetching API key', () => {
				return apikeyGet(apiClient, args.id);
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes('not found')) {
				tui.fatal(`API key '${args.id}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			throw error;
		}

		if (!options.json) {
			if (process.stdout.isTTY) {
				tui.newline();
				tui.success('API Key Details:');
				tui.newline();
			}

			const rows = [
				{
					ID: apiKey.id,
					Name: apiKey.name,
					Type: apiKey.type,
					'Organization ID': apiKey.orgId,
					Project: apiKey.project?.name ?? '-',
					'Project ID': apiKey.project?.id ?? '-',
					'Expires At': apiKey.expiresAt ?? 'Never',
					'Created At': apiKey.createdAt,
				},
			];

			tui.table(rows);
		}

		return apiKey;
	},
});
