import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';
import { dbCommand } from './db';
import { redisCommand } from './redis';
import { storageCommand } from './storage';
import { sessionCommand } from './session';
import { threadCommand } from './thread';
import { sshSubcommand } from './ssh';
import { scpSubcommand } from './scp';
import { deploymentCommand } from './deployment';
import keyvalueCommand from './keyvalue';
import queueCommand from './queue';
import { agentCommand } from './agent';
import envCommand from './env';
import apikeyCommand from './apikey';
import streamCommand from './stream';
import vectorCommand from './vector';
import sandboxCommand from './sandbox';
import { regionSubcommand } from './region';
import { machineCommand } from './machine';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	tags: ['slow', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud deploy'), description: 'Deploy your agent to the cloud' },
		{ command: getCommand('cloud deployment list'), description: 'List all deployments' },
		{ command: getCommand('cloud region select'), description: 'Set default region' },
	],
	subcommands: [
		apikeyCommand,
		keyvalueCommand,
		queueCommand,
		agentCommand,
		streamCommand,
		vectorCommand,
		sandboxCommand,
		envCommand,
		deploySubcommand,
		dbCommand,
		redisCommand,
		storageCommand,
		sessionCommand,
		threadCommand,
		sshSubcommand,
		scpSubcommand,
		deploymentCommand,
		regionSubcommand,
		machineCommand,
	],
});
