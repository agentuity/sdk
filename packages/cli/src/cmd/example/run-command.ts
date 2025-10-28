import { createSubcommand } from '@/types';
import * as tui from '@/tui';

export const runCommandSubcommand = createSubcommand({
	name: 'run-command',
	description: 'Demo of runCommand TUI component',

	async handler() {
		tui.info('Example 1: Running a successful command\n');
		await tui.runCommand({
			command: 'echo "Hello, World!"',
			cmd: ['echo', 'Hello, World!'],
		});

		tui.newline();
		tui.info('Example 2: Command with multiple output lines\n');
		await tui.runCommand({
			command: 'ls -la',
			cmd: ['ls', '-la'],
			cwd: process.cwd(),
		});

		tui.newline();
		tui.info('Example 3: Long running command\n');
		await tui.runCommand({
			command: 'for i in {1..100}; do echo "Line $i"; sleep 0.01; done',
			cmd: ['sh', '-c', 'for i in {1..100}; do echo "Line $i"; sleep 0.01; done'],
		});

		tui.newline();
		tui.info('Example 4: Failing command\n');
		const exitCode = await tui.runCommand({
			command: 'exit 1',
			cmd: ['sh', '-c', 'echo "This will fail"; exit 1'],
		});
		tui.info(`Exit code: ${exitCode}`);

		tui.newline();
		tui.info('Example 5: Tree\n');
		await tui.runCommand({
			command: 'tree',
			cmd: ['tree'],
		});
	},
});
