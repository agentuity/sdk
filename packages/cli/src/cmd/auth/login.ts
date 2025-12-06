import { createSubcommand } from '../../types';
import { getAppBaseURL } from '../../api';
import { saveAuth } from '../../config';
import { generateLoginCode, pollForLoginCompletion } from './api';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

export const loginCommand = createSubcommand({
	name: 'login',
	description: 'Login to the Agentuity Platform using a browser-based authentication flow',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	toplevel: true,
	idempotent: false,
	requires: { apiClient: true },
	examples: [
		{ command: getCommand('auth login'), description: 'Login to account' },
		{ command: getCommand('login'), description: 'Login to account' },
	],
	async handler(ctx) {
		const { logger, config, apiClient } = ctx;

		const appUrl = getAppBaseURL(config);

		try {
			const code = await tui.spinner({
				message: 'Generating login code...',
				clearOnSuccess: true,
				callback: () => {
					return generateLoginCode(apiClient);
				},
			});

			if (!code) {
				return;
			}

			const authURL = `${appUrl}/auth/cli?code=${code}`;

			const copied = await tui.copyToClipboard(authURL);

			tui.newline();
			console.log(`Your login code: ${tui.bold(code)}`);
			tui.newline();
			if (copied) {
				console.log('Login URL copied to clipboard! Open it in your browser:');
			} else {
				console.log('Open this URL in your browser to approve the login:');
			}
			tui.newline();
			console.log(`  ${tui.link(authURL)}`);
			tui.newline();
			console.log(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
			tui.newline();

			const result = await tui.spinner({
				type: 'countdown',
				message: 'Waiting for approval',
				timeoutMs: 300000, // 5 minutes
				clearOnSuccess: true,
				onEnterPress: () => {
					// Open URL in default browser
					const platform = process.platform;
					if (platform === 'win32') {
						// Windows: use cmd.exe to invoke start (it's a shell builtin, not an executable)
						// Empty string is required as the window title argument
						Bun.spawn(['cmd', '/c', 'start', '', authURL], {
							stdout: 'ignore',
							stderr: 'ignore',
						});
					} else {
						const command = platform === 'darwin' ? 'open' : 'xdg-open';
						Bun.spawn([command, authURL], { stdout: 'ignore', stderr: 'ignore' });
					}
				},
				callback: async () => {
					return await pollForLoginCompletion(apiClient, code);
				},
			});

			await saveAuth({
				apiKey: result.apiKey,
				userId: result.userId,
				expires: result.expires,
			});

			tui.newline();
			tui.success('Welcome to Agentuity! You are now logged in');
		} catch (error) {
			logger.trace(error);
			logger.fatal('Login failed: %s', error, ErrorCode.AUTH_FAILED);
		}
	},
});
