import { z } from 'zod';
import { openInBrowser } from '../../system/browser.ts';
import { createSubcommand } from '../../types.ts';
import { getAPIBaseURL, getAppBaseURL, APIClient } from '../../api.ts';
import { saveAuth } from '../../config.ts';
import { generateLoginCode, pollForLoginCompletion } from './api.ts';
import { whoami } from '@agentuity/server';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';

export const loginCommand = createSubcommand({
	name: 'login',
	description: 'Login to the Agentuity Platform using a browser-based authentication flow',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	toplevel: true,
	idempotent: false,
	requires: { apiClient: true },
	examples: [
		{ command: getCommand('auth login'), description: 'Login to account' },
		{
			command: getCommand(
				'auth login --api-key $AGENTUITY_API_KEY --user-id $AGENTUITY_USER_ID'
			),
			description: 'Store API key credentials without a browser',
		},
		{ command: getCommand('login'), description: 'Login to account' },
	],
	schema: {
		options: z.object({
			setupToken: z.string().optional().describe('Use a one-time use setup token'),
			apiKey: z
				.string()
				.optional()
				.describe('Store an API key without opening a browser (also AGENTUITY_API_KEY)'),
			userId: z
				.string()
				.optional()
				.describe('User ID to store with the API key (also AGENTUITY_USER_ID)'),
		}),
		response: z.object({
			success: z.boolean(),
			verified: z.boolean().optional(),
			userId: z.string().optional(),
		}),
	},
	async handler(ctx) {
		const { logger, config, apiClient, options } = ctx;
		const opts = ctx.opts ?? {};

		const apiKey =
			opts.apiKey ?? process.env.AGENTUITY_API_KEY ?? process.env.AGENTUITY_CLI_API_KEY;
		const userId = opts.userId ?? process.env.AGENTUITY_USER_ID;
		if (apiKey) {
			await saveAuth({
				apiKey,
				userId: userId ?? '',
				expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
			});
			const verifyClient = new APIClient(getAPIBaseURL(config), logger, apiKey, config);
			try {
				await whoami(verifyClient);
				if (!options.json) {
					tui.success('Stored API key and verified access');
				}
				return {
					success: true,
					verified: true,
					userId: userId ?? '',
				};
			} catch (error) {
				logger.trace(error);
				if (!options.json) {
					tui.warning('Stored API key, but verification failed');
				}
				return {
					success: true,
					verified: false,
					userId,
				};
			}
		}

		if (opts.setupToken) {
			const url = getAPIBaseURL(config);
			try {
				const res = await fetch(
					`${url}/cli/auth/setup-token/${encodeURIComponent(opts.setupToken)}`,
					{
						signal: AbortSignal.timeout(5000),
					}
				);
				if (res.ok) {
					const result = (await res.json()) as {
						success: boolean;
						message: string;
						data?: { apiKey: string; expiresAt: number; userId: string };
					};
					if (result.success && result.data) {
						await saveAuth({
							apiKey: result.data.apiKey,
							userId: result.data.userId,
							expires: new Date(result.data.expiresAt),
						});
						if (!options.json) {
							tui.success('Welcome to Agentuity! You are now logged in');
						}
						return { success: true };
					}
				} else {
					throw new Error(await res.text());
				}
			} catch (ex) {
				if (options.json) {
					return {
						success: false,
					};
				}
				tui.error(`error validating the setup token: ${ex}`);
			}
		}

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
				return { success: false };
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
					openInBrowser(authURL);
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

			if (!options.json) {
				tui.newline();
				tui.success('Welcome to Agentuity! You are now logged in');
			}

			return { success: true };
		} catch (error) {
			logger.trace(error);
			logger.fatal('Login failed: %s', error, ErrorCode.AUTH_FAILED);
		}

		return { success: false };
	},
});
