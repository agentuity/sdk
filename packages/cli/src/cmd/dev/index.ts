import { createCommand } from '@/types';
import { z } from 'zod';
import { resolve } from 'node:path';
import { bundle } from '../bundle/bundler';
import { existsSync } from 'node:fs';
import * as tui from '@/tui';

export const command = createCommand({
	name: 'dev',
	description: 'Build and run the development server',
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Root directory of the project'),
		}),
	},

	async handler(ctx) {
		const { opts } = ctx;
		const rootDir = resolve(opts.dir || process.cwd());
		const agentuityDir = resolve(rootDir, '.agentuity');
		const appPath = resolve(agentuityDir, 'app.js');

		try {
			await tui.spinner('Building project...', async () => {
				await bundle({
					rootDir,
					dev: true,
				});
			});

			tui.success('Build complete');

			if (!existsSync(appPath)) {
				tui.error(`App file not found: ${appPath}`);
				process.exit(1);
			}

			tui.newline();
			tui.info('Starting development server...');
			tui.newline();

			// Use shell to run in a process group for proper cleanup
			// The 'exec' ensures the shell is replaced by the actual process
			const devServer = Bun.spawn(['sh', '-c', `exec bun run "${appPath}"`], {
				cwd: rootDir,
				stdout: 'inherit',
				stderr: 'inherit',
				stdin: 'inherit',
			});

			// Handle signals to ensure entire process tree is killed
			const cleanup = () => {
				if (devServer.pid) {
					try {
						// Kill the process group (negative PID kills entire group)
						process.kill(-devServer.pid, 'SIGTERM');
					} catch {
						// Fallback: kill the direct process
						try {
							devServer.kill();
						} catch {
							// Ignore if already dead
						}
					}
				}
				process.exit(0);
			};

			process.on('SIGINT', cleanup);
			process.on('SIGTERM', cleanup);

			const exitCode = await devServer.exited;
			process.exit(exitCode);
		} catch (error) {
			if (error instanceof Error) {
				tui.error(`Dev server failed: ${error.message}`);
			} else {
				tui.error('Dev server failed');
			}
			process.exit(1);
		}
	},
});
