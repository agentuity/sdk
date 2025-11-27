import { createCommand } from '../../types';
import { deploySubcommand } from './deploy';
import { resourceSubcommand } from './resource';
import { sessionCommand } from './session';
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

export const command = createCommand({
	name: 'cloud',
	description: 'Cloud related commands',
	tags: ['slow', 'requires-auth'],
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
		resourceSubcommand,
		sessionCommand,
		sshSubcommand,
		scpSubcommand,
		deploymentCommand,
	],
});
