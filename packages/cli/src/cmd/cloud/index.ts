import { createCommand } from '../../types.ts';
import { deploySubcommand } from './deploy.ts';
import { dbCommand } from './db/index.ts';
import { redisCommand } from './redis/index.ts';
import { storageCommand } from './storage/index.ts';
import { sessionCommand } from './session/index.ts';
import { threadCommand } from './thread/index.ts';
import { sshSubcommand } from './ssh.ts';
import { scpSubcommand } from './scp/index.ts';
import { deploymentCommand } from './deployment/index.ts';
import keyvalueCommand from './keyvalue/index.ts';
import queueCommand from './queue/index.ts';
import webhookCommand from './webhook/index.ts';
import { agentCommand } from './agent/index.ts';
import envCommand from './env/index.ts';
import apikeyCommand from './apikey/index.ts';
import streamCommand from './stream/index.ts';
import vectorCommand from './vector/index.ts';
import { emailCommand } from './email/index.ts';
import taskCommand from './task/index.ts';
import sandboxCommand from './sandbox/index.ts';
import scheduleCommand from './schedule/index.ts';
import servicesCommand from './services/index.ts';
import { regionSubcommand } from './region/index.ts';
import { machineCommand } from './machine/index.ts';
import { evalCommand } from './eval/index.ts';
import { evalRunCommand } from './eval-run/index.ts';
import { getCommand } from '../../command-prefix.ts';

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
		webhookCommand,
		taskCommand,
		agentCommand,
		streamCommand,
		emailCommand,
		vectorCommand,
		sandboxCommand,
		scheduleCommand,
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
		deploymentCommand,
		regionSubcommand,
		machineCommand,
	],
});
