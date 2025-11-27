import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { apikeyDelete } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const APIKeyDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	id: z.string().describe('API key id that was deleted'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'rm'],
	description: 'Delete an API key (soft delete)',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	examples: [
		getCommand('cloud apikey delete <id>'),
		getCommand('cloud apikey del <id>'),
		getCommand('cloud apikey rm <id>'),
	],
	requires: { auth: true, apiClient: true },
	schema: {
		args: z.object({
			id: z.string().describe('the API key id to delete'),
		}),
		response: APIKeyDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, options } = ctx;

		let rowsAffected: Awaited<ReturnType<typeof apikeyDelete>>;
		try {
			rowsAffected = await tui.spinner('Deleting API key', () => {
				return apikeyDelete(apiClient, args.id);
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes('not found')) {
				tui.fatal(
					`API key '${args.id}' not found or is not a custom key`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}
			throw error;
		}

		if (rowsAffected === 0) {
			tui.fatal(
				`API key '${args.id}' not found or is not a custom key`,
				ErrorCode.RESOURCE_NOT_FOUND
			);
		}

		if (!options.json) {
			tui.success(`API key '${args.id}' deleted successfully`);
		}

		return {
			success: true,
			id: args.id,
		};
	},
});
