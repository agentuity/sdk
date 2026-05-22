import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { createSubcommand } from './create.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { publishSubcommand } from './publish.ts';
import { messagesSubcommand } from './messages.ts';
import { receiveSubcommand } from './receive.ts';
import { ackSubcommand } from './ack.ts';
import { nackSubcommand } from './nack.ts';
import { dlqSubcommand } from './dlq.ts';
import { destinationsSubcommand } from './destinations.ts';
import { sourcesSubcommand } from './sources.ts';
import { consumersSubcommand } from './consumers.ts';
import { pauseSubcommand } from './pause.ts';
import { resumeSubcommand } from './resume.ts';
import { statsSubcommand } from './stats.ts';
import { getCommand } from '../../../command-prefix.ts';

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
