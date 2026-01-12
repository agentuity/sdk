import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { runtimeList } from '@agentuity/server';

const RuntimeInfoSchema = z.object({
	id: z.string().describe('Runtime ID'),
	name: z.string().describe('Runtime name'),
	description: z.string().optional().describe('Runtime description'),
});

const RuntimeListResponseSchema = z.object({
	runtimes: z.array(RuntimeInfoSchema).describe('List of runtimes'),
	total: z.number().describe('Total number of runtimes'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List available sandbox runtimes',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox runtime list'),
			description: 'List all available runtimes',
		},
	],
	schema: {
		options: z.object({
			limit: z.number().optional().describe('Maximum number of results'),
			offset: z.number().optional().describe('Offset for pagination'),
		}),
		response: RuntimeListResponseSchema,
	},

	async handler(ctx) {
		const { opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const result = await runtimeList(client, {
			orgId,
			limit: opts.limit,
			offset: opts.offset,
		});

		if (!options.json) {
			if (result.runtimes.length === 0) {
				tui.info('No runtimes available');
			} else {
				const tableData = result.runtimes.map((runtime) => {
					return {
						ID: runtime.id,
						Name: runtime.name,
						Description: runtime.description ?? '-',
					};
				});
				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Name', alignment: 'left' },
					{ name: 'Description', alignment: 'left' },
				]);

				tui.info(`Total: ${result.total} ${tui.plural(result.total, 'runtime', 'runtimes')}`);
			}
		}

		return result;
	},
});

export default listSubcommand;
