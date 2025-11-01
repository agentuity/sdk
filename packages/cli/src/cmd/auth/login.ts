import { createSubcommand } from '../../types';
import { UpgradeRequiredError } from '@agentuity/server';
import { getAppBaseURL } from '../../api';
import { saveAuth } from '../../config';
import { generateLoginOTP, pollForLoginCompletion } from './api';
import * as tui from '../../tui';

export const loginCommand = createSubcommand({
	name: 'login',
	description: 'Login to the Agentuity Platform using a browser-based authentication flow',
	toplevel: true,
	requires: { apiClient: true },

	async handler(ctx) {
		const { logger, config, apiClient } = ctx;
		const appUrl = getAppBaseURL(config);

		try {
			const otp = await tui.spinner('Generating login one time code...', () => {
				return generateLoginOTP(apiClient);
			});

			if (!otp) {
				return;
			}

			const authURL = `${appUrl}/auth/cli`;

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

			console.log('Waiting for login to complete...');

			const result = await pollForLoginCompletion(apiClient, otp);

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
	},
});
