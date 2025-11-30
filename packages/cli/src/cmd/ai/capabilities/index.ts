import type { CommandDefinition } from '../../../types';
import { createCommand } from '../../../types';
import { showSubcommand } from './show';
import { getCommand } from '../../../command-prefix';

export const capabilitiesCommand: CommandDefinition = createCommand({
	name: 'capabilities',
	description: 'Show CLI capabilities and available tasks',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('ai capabilities show'), description: 'Show CLI capabilities' },
	],
	subcommands: [showSubcommand],
});

export default capabilitiesCommand;
