import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { createSubcommand } from './create';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { destinationsSubcommand } from './destinations';
import { receiptsSubcommand } from './receipts';
import { deliveriesSubcommand } from './deliveries';
import { getCommand } from '../../../command-prefix';

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
