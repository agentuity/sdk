import type { CommandDefinition } from '../../types';
import { createCommand } from '../../types';
import { showSubcommand } from './show';

export const capabilitiesCommand: CommandDefinition = createCommand({
	name: 'capabilities',
	description: 'Show CLI capabilities and available tasks',
	tags: ['read-only', 'fast'],
	subcommands: [showSubcommand],
});

export default capabilitiesCommand;
