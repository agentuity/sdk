import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { getAPIBaseURL, getAppBaseURL, UpgradeRequiredError } from '@/api';
import { saveAuth } from '@/config';
import { generateLoginOTP, pollForLoginCompletion } from './api';
import * as tui from '@/tui';

export const loginCommand: SubcommandDefinition = {
	name: 'login',
	description: 'Login to the Agentuity Platform',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('login')
			.description('Login to the Agentuity Platform using a browser-based authentication flow')
			.action(async () => {
				const { logger, config } = ctx;
				const apiUrl = getAPIBaseURL(config);
				const appUrl = getAppBaseURL(config);

				try {
					console.log('Generating login OTP...');

					const otp = await generateLoginOTP(apiUrl, config);

					const authURL = `${appUrl}/auth/cli`;

					// Copy OTP to clipboard
					const copied = await tui.copyToClipboard(otp);

					tui.newline();
					if (copied) {
						console.log(`Code copied to clipboard: ${tui.bold(otp)}`);
					} else {
						console.log('Copy the following code:');
						tui.newline();
						console.log(`  ${tui.bold(otp)}`);
					}
					tui.newline();
					console.log('Then open the URL in your browser and paste the code:');
					tui.newline();
					console.log(`  ${tui.link(authURL)}`);
					tui.newline();
					console.log(tui.muted('This code will expire in 60 seconds'));
					tui.newline();

					if (process.platform === 'darwin') {
						await tui.waitForAnyKey('Press Enter to open the URL...');
						try {
							Bun.spawn(['open', authURL], {
								stdio: ['ignore', 'ignore', 'ignore'],
							});
						} catch {
							// Ignore browser open errors
						}
					}

					console.log('Waiting for login to complete...');

					const result = await pollForLoginCompletion(apiUrl, otp, config);

					await saveAuth({
						apiKey: result.apiKey,
						userId: result.userId,
						expires: result.expires,
					});

					tui.newline();
					tui.success('Welcome to Agentuity! You are now logged in');
				} catch (error) {
					if (error instanceof UpgradeRequiredError) {
						const bannerBody = `${error.message}\n\nVisit: ${tui.link('https://agentuity.dev/CLI/installation')}`;
						tui.banner('CLI Upgrade Required', bannerBody);
						process.exit(1);
					} else if (error instanceof Error) {
						logger.fatal(`Login failed: ${error.message}`);
					} else {
						logger.fatal('Login failed');
					}
				}
			});
	},
};

export default loginCommand;
