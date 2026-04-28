import type { CommandDefinition } from '../../../types.ts';
import { createCommand } from '../../../types.ts';
import { showSubcommand } from './show.ts';
import { getCommand } from '../../../command-prefix.ts';

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
