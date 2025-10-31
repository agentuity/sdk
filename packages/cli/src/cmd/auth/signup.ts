import { createSubcommand } from '../../types';
import { getAPIBaseURL, getAppBaseURL, UpgradeRequiredError } from '@agentuity/server';
import { saveAuth } from '../../config';
import { generateSignupOTP, pollForSignupCompletion } from './api';
import * as tui from '../../tui';

export const signupCommand = createSubcommand({
	name: 'signup',
	description: 'Create a new Agentuity Cloud Platform account',
	toplevel: true,

	async handler(ctx) {
		const { logger, config } = ctx;
		const apiUrl = getAPIBaseURL(config?.overrides);
		const appUrl = getAppBaseURL(config?.overrides);

		try {
			const otp = generateSignupOTP();

			const signupURL = `${appUrl}/sign-up?code=${otp}`;

			const bannerBody = `Please open the URL in your browser:\n\n${tui.link(signupURL)}\n\n${tui.muted('Once you have completed the signup process, you will be given a one-time password to complete the signup process.')}`;

			tui.banner('Signup for Agentuity', bannerBody);
			tui.newline();

			await tui.spinner('Waiting for signup to complete...', async () => {
				const result = await pollForSignupCompletion(apiUrl, otp, config);

				await saveAuth({
					apiKey: result.apiKey,
					userId: result.userId,
					expires: result.expires,
				});
			});

			tui.newline();
			tui.success('Welcome to Agentuity! You are now logged in');
		} catch (error) {
			if (error instanceof UpgradeRequiredError) {
				const bannerBody = `${error.message}\n\nVisit: ${tui.link('https://agentuity.dev/CLI/installation')}`;
				tui.banner('CLI Upgrade Required', bannerBody);
				process.exit(1);
			} else if (error instanceof Error) {
				logger.fatal(`Signup failed: ${error.message}`);
			} else {
				logger.fatal('Signup failed');
			}
		}
	},
});
