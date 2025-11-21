import { createCommand } from '../../types';
import capabilitiesCommand from './capabilities';
import promptCommand from './prompt';
import schemaCommand from './schema';

export const command = createCommand({
	name: 'ai',
	description: 'AI coding agent related commands',
	tags: ['fast'],
	subcommands: [capabilitiesCommand, promptCommand, schemaCommand],
});
