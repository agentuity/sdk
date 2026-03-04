import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { createSubcommand } from './create';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { publishSubcommand } from './publish';
import { messagesSubcommand } from './messages';
import { receiveSubcommand } from './receive';
import { ackSubcommand } from './ack';
import { nackSubcommand } from './nack';
import { dlqSubcommand } from './dlq';
import { destinationsSubcommand } from './destinations';
import { sourcesSubcommand } from './sources';
import { consumersSubcommand } from './consumers';
import { pauseSubcommand } from './pause';
import { resumeSubcommand } from './resume';
import { statsSubcommand } from './stats';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'queue',
	aliases: ['queues'],
	description: 'Manage managed message queues',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('cloud queue list'),
			description: 'List all queues',
		},
		{
			command: getCommand('cloud queue create worker --name my-tasks'),
			description: 'Create a worker queue',
		},
		{
			command: getCommand('cloud queue publish my-queue \'{"task":"process"}\''),
			description: 'Publish a message',
		},
		{
			command: getCommand('cloud queue receive my-queue'),
			description: 'Receive a message from a worker queue',
		},
		{
			command: getCommand('cloud queue stats'),
			description: 'View analytics for all queues',
		},
	],
	subcommands: [
		listSubcommand,
		createSubcommand,
		getSubcommand,
		deleteSubcommand,
		publishSubcommand,
		messagesSubcommand,
		receiveSubcommand,
		ackSubcommand,
		nackSubcommand,
		dlqSubcommand,
		destinationsSubcommand,
		sourcesSubcommand,
		consumersSubcommand,
		pauseSubcommand,
		resumeSubcommand,
		statsSubcommand,
	],
	requires: { auth: true },
});

export default command;
