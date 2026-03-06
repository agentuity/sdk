import { z } from 'zod';
import { createSubcommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import * as tui from '../../../tui';

const RegionSchema = z.object({
	region: z.string().describe('Region code'),
	description: z.string().describe('Human-readable region description'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List available cloud regions',
	aliases: ['ls'],
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, regions: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud region list'), description: 'List all available regions' },
		{
			command: getCommand('cloud region ls'),
			description: 'List all available regions (short alias)',
		},
		{
			command: getCommand('--json cloud region list'),
			description: 'List regions in JSON format',
		},
	],
	schema: {
		response: z.array(RegionSchema),
	},

	async handler(ctx) {
		const { regions, options } = ctx;

		const result = regions.map((r) => ({
			region: r.region,
			description: r.description,
		}));

		if (!options.json) {
			tui.info(`Regions (${regions.length})`);

			const tableData = regions.map((r) => ({
				Code: r.region,
				Description: r.description,
			}));

			tui.table(tableData, [
				{ name: 'Code', alignment: 'left' },
				{ name: 'Description', alignment: 'left' },
			]);
		}

		return result;
	},
});
