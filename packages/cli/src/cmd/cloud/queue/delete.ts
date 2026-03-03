import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createQueueAPIClient, getQueueApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { deleteQueue } from '@agentuity/server';
import { ErrorCode } from '../../../errors.ts';

const DeleteResponseSchema = z.object({
	success: z.boolean(),
	name: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a queue by name',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue delete my-queue --confirm'),
			description: 'Delete a queue (requires confirmation)',
		},
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			confirm: z.boolean().default(false).describe('Skip confirmation prompt'),
		}),
		response: DeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.confirm) {
			tui.fatal('Use --confirm to confirm queue deletion', ErrorCode.INVALID_ARGUMENT);
		}

		const client = await createQueueAPIClient(ctx);
		await deleteQueue(client, args.name, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Deleted queue: ${args.name}`);
		}

		return {
			success: true,
			name: args.name,
		};
	},
});

export default deleteSubcommand;
