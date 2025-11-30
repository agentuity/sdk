import { createCommand } from '../../types';
import { getCommand } from '../../command-prefix';

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
		// Spawn the CLI with no arguments to show help
		let spawnArgs: string[];

		if (process.env.AGENTUITY_CLI_VERSION) {
			// Compiled binary: spawn only the binary executable with no additional args
			spawnArgs = [process.argv[0]];
		} else {
			// Script mode: spawn runtime and script, omitting the 'help' argument
			spawnArgs = [process.argv[0], ...(process.argv.length > 1 ? [process.argv[1]] : [])];
		}

		const proc = Bun.spawn(spawnArgs, {
			stdio: ['inherit', 'inherit', 'inherit'],
			env: process.env,
		});

		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			throw new Error(`Help command exited with code ${exitCode}`);
		}

		return undefined;
	},
});
