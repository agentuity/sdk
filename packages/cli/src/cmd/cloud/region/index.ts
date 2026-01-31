import { z } from 'zod';
import { createSubcommand, createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { saveRegion, clearRegion } from '../../../config';
import * as tui from '../../../tui';

const selectCommand = createSubcommand({
	name: 'select',
	description: 'Set the default cloud region for all commands',
	tags: ['fast', 'requires-auth'],
	requires: { auth: true, regions: true },
	examples: [
		{ command: getCommand('cloud region select'), description: 'Select default region' },
		{
			command: getCommand('cloud region select usc'),
			description: 'Set specific region as default',
		},
	],
	schema: {
		args: z.object({
			region: z.string().optional().describe('Region code to set as default'),
		}),
		response: z.object({
			region: z.string().describe('The selected region code'),
			description: z.string().describe('The region description'),
		}),
	},

	async handler(ctx) {
		const { regions, args, options } = ctx;

		let selectedRegion = args.region;

		if (selectedRegion) {
			const region = regions.find((r) => r.region === selectedRegion);
			if (!region) {
				const available = regions.map((r) => r.region).join(', ');
				tui.fatal(`Region '${selectedRegion}' not found. Available regions: ${available}`);
			}
		} else {
			if (!process.stdin.isTTY) {
				tui.fatal(
					'Region code required in non-interactive mode. Usage: ' +
						getCommand('cloud region select <region>')
				);
			}

		if (regions.length === 1 && regions[0]) {
			selectedRegion = regions[0].region;
		} else {
				const response = await tui.createPrompt().select<string>({
					message: 'Select a default region',
					options: regions.map((r) => ({
						value: r.region,
						label: `${r.description} ${tui.muted(`(${r.region})`)}`,
					})),
				});
				selectedRegion = response;
			}
		}

		await saveRegion(selectedRegion);

		const selectedRegionInfo = regions.find((r) => r.region === selectedRegion)!;

		if (!options.json) {
			tui.success(
				`Default region set to ${tui.bold(selectedRegionInfo.description)} (${selectedRegion})`
			);
		}

		return { region: selectedRegion, description: selectedRegionInfo.description };
	},
});

const unselectCommand = createSubcommand({
	name: 'unselect',
	description: 'Clear the default region preference',
	tags: ['fast'],
	examples: [
		{ command: getCommand('cloud region unselect'), description: 'Clear default region' },
	],
	schema: {
		response: z.object({
			cleared: z.boolean().describe('Whether the preference was cleared'),
		}),
	},

	async handler(ctx) {
		const { options, config } = ctx;

		const hadRegion = !!config?.preferences?.region;

		if (hadRegion && process.stdin.isTTY) {
			const confirmed = await tui.confirm('Clear default region preference?', true);
			if (!confirmed) {
				if (!options.json) {
					tui.info('Cancelled');
				}
				return { cleared: false };
			}
		}

		await clearRegion();

		if (!options.json) {
			if (hadRegion) {
				tui.success('Default region cleared');
			} else {
				tui.info('No default region was set');
			}
		}

		return { cleared: hadRegion };
	},
});

const currentCommand = createSubcommand({
	name: 'current',
	description: 'Show the current default region',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('cloud region current'), description: 'Show default region' },
		{
			command: getCommand('cloud region current --json'),
			description: 'Show output in JSON format',
		},
	],
	schema: {
		response: z.string().nullable().describe('The current region code or null if not set'),
	},

	async handler(ctx) {
		const { options, config } = ctx;
		const region = config?.preferences?.region || null;

		if (!options.json) {
			if (region) {
				console.log(region);
			}
		}

		return region;
	},
});

export const regionSubcommand = createCommand({
	name: 'region',
	description: 'Manage default cloud region preference',
	tags: ['fast'],
	examples: [
		{ command: getCommand('cloud region select'), description: 'Set default region' },
		{ command: getCommand('cloud region current'), description: 'Show current default' },
	],
	subcommands: [selectCommand, unselectCommand, currentCommand],
});
