import { createCommand } from '../../types';
import { getCommand } from '../../command-prefix';
import { getProgram } from '../../program-ref';

export const command = createCommand({
	name: 'help',
	description: 'Display help information',
	hidden: true,
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('help'), description: 'Run help command' },
		{ command: getCommand('--help'), description: 'Show help information' },
	],
	idempotent: true,

	async handler() {
		// Get the root program and display its help
		// This avoids spawning a subprocess which doesn't work reliably
		// with Bun compiled binaries
		const program = getProgram();
		if (program) {
			program.outputHelp();
		}
		process.exit(0);
	},
});
