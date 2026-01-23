import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { machineDelete, machineGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getGlobalCatalystAPIClient } from '../../../config';
import enquirer from 'enquirer';

const MachineDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the deletion succeeded'),
	machineId: z.string().describe('The deleted machine ID'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete an organization managed machine',
	tags: ['mutating', 'destructive', 'slow', 'requires-auth'],
	examples: [
		{
			command: `${getCommand('cloud machine delete')} mach_abc123xyz`,
			description: 'Delete a machine (with confirmation)',
		},
		{
			command: `${getCommand('cloud machine delete')} mach_abc123xyz --confirm`,
			description: 'Delete a machine without confirmation',
		},
	],
	aliases: ['rm', 'remove'],
	requires: { auth: true, org: true },
	idempotent: false,
	schema: {
		args: z.object({
			machine_id: z.string().describe('Machine ID'),
		}),
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: MachineDeleteResponseSchema,
	},
	async handler(ctx) {
		const { args, opts, options, logger, auth, config, orgId } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name, orgId);

		try {
			const machine = await machineGet(catalystClient, args.machine_id);

			if (!opts.confirm) {
				if (process.stdin.isTTY) {
					tui.newline();
					tui.warn(`You are about to delete machine ${tui.bold(machine.id)}`);
					if (machine.orgName) {
						tui.info(`Organization: ${machine.orgName}`);
					}
					tui.newline();

					const response = await enquirer.prompt<{ confirm: boolean }>({
						type: 'confirm',
						name: 'confirm',
						message: 'Are you sure you want to delete this machine?',
						initial: false,
					});

					if (!response.confirm) {
						tui.info('Deletion cancelled.');
						return { success: false, machineId: args.machine_id };
					}
				} else {
					tui.error('Non-interactive sessions require --confirm flag to delete a machine.');
					return { success: false, machineId: args.machine_id };
				}
			}

			await tui.spinner({
				type: 'simple',
				message: 'Deleting machine...',
				callback: () => machineDelete(catalystClient, args.machine_id),
				clearOnSuccess: true,
			});

			if (!options.json) {
				tui.success(`Machine ${args.machine_id} deleted successfully.`);
			}

			return { success: true, machineId: args.machine_id };
		} catch (ex) {
			tui.fatal(`Failed to delete machine: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
