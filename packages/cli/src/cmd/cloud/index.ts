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
import webhookCommand from './webhook';
import { agentCommand } from './agent';
import envCommand from './env';
import apikeyCommand from './apikey';
import oidcCommand from './oidc';
import streamCommand from './stream';
import vectorCommand from './vector';
import { emailCommand } from './email';
import taskCommand from './task';
import sandboxCommand from './sandbox';
import scheduleCommand from './schedule';
import workflowCommand from './workflow';
import servicesCommand from './services';
import { regionSubcommand } from './region';
import { machineCommand } from './machine';
import { monitorSubcommand } from './monitor';
import { evalCommand } from './eval';
import { evalRunCommand } from './eval-run';
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
		oidcCommand,
		keyvalueCommand,
		queueCommand,
		webhookCommand,
		taskCommand,
		agentCommand,
		streamCommand,
		emailCommand,
		vectorCommand,
		sandboxCommand,
		scheduleCommand,
		workflowCommand,
		envCommand,
		evalCommand,
		evalRunCommand,
		deploySubcommand,
		dbCommand,
		redisCommand,
		storageCommand,
		servicesCommand,
		sessionCommand,
		threadCommand,
		sshSubcommand,
		scpSubcommand,
		monitorSubcommand,
		deploymentCommand,
		regionSubcommand,
		machineCommand,
	],
});
