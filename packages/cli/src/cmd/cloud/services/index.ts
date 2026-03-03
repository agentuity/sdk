import { createCommand } from '../../../types.ts';
import { statsSubcommand } from './stats.ts';

const servicesCommand = createCommand({
	name: 'services',
	description: 'Service usage statistics',
	tags: ['read-only', 'requires-auth'],
	subcommands: [statsSubcommand],
});

export default servicesCommand;
