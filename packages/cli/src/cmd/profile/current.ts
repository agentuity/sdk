import { z } from 'zod';
import { createSubcommand } from '../../types';
import { getCommand } from '../../command-prefix';

export const currentCommand = createSubcommand({
	name: 'current',
	description: 'Show the name of the currently active profile',
	tags: ['read-only', 'fast'],
	idempotent: true,
	aliases: [],
	examples: [
		{ command: getCommand('profile current'), description: 'Show current profile' },
		{ command: getCommand('profile current --json'), description: 'Show output in JSON format' },
	],
	schema: {
		response: z.string().describe('The name of the current profile'),
	},

	async handler(ctx) {
		const { options } = ctx;
		const profileName = ctx.config?.name || 'production';

		if (!options.json) {
			console.log(profileName);
		}

		return profileName;
	},
});

export default currentCommand;
