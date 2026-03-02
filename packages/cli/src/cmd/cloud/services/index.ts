import { createCommand } from '../../../types';
import { statsSubcommand } from './stats';

const servicesCommand = createCommand({
	name: 'services',
	description: 'Service usage statistics',
	tags: ['read-only', 'requires-auth'],
	subcommands: [statsSubcommand],
});

export default servicesCommand;
