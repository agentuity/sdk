import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';
import { dbCommand } from './db';
import { storageCommand } from './storage';
import { sessionCommand } from './session';
import { threadCommand } from './thread';
import { sshSubcommand } from './ssh';
import { scpSubcommand } from './scp';
import { deploymentCommand } from './deployment';
import keyvalueCommand from './keyvalue';
import { agentCommand } from './agent';
import objectstoreCommand from './objectstore';
import envCommand from './env';
import secretCommand from './secret';
import apikeyCommand from './apikey';
import streamCommand from './stream';
import vectorCommand from './vector';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud deploy'), description: 'Deploy your agent to the cloud' },
		{ command: getCommand('cloud deployment list'), description: 'List all deployments' },
	],
	subcommands: [
		apikeyCommand,
		keyvalueCommand,
		agentCommand,
		objectstoreCommand,
		streamCommand,
		vectorCommand,
		envCommand,
		secretCommand,
		deploySubcommand,
		dbCommand,
		storageCommand,
		sessionCommand,
		threadCommand,
		sshSubcommand,
		scpSubcommand,
		deploymentCommand,
	],
});
