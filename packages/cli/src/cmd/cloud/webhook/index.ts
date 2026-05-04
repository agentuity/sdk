import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { createSubcommand } from './create.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { destinationsSubcommand } from './destinations.ts';
import { receiptsSubcommand } from './receipts.ts';
import { deliveriesSubcommand } from './deliveries.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'webhook',
	aliases: ['webhooks'],
	description: 'Manage webhooks for receiving external HTTP callbacks',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('cloud webhook list'),
			description: 'List all webhooks',
		},
		{
			command: getCommand('cloud webhook create --name my-webhook'),
			description: 'Create a webhook',
		},
		{
			command: getCommand('cloud webhook get wh_abc123'),
			description: 'Get webhook details',
		},
		{
			command: getCommand('cloud webhook destinations list wh_abc123'),
			description: 'List webhook destinations',
		},
	],
	subcommands: [
		listSubcommand,
		createSubcommand,
		getSubcommand,
		deleteSubcommand,
		destinationsSubcommand,
		receiptsSubcommand,
		deliveriesSubcommand,
	],
	requires: { auth: true },
});

export default command;
