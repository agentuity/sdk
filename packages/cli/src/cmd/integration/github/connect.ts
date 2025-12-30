import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { startGithubIntegration, pollForGithubIntegration } from '../api';

export const connectSubcommand = createSubcommand({
	name: 'connect',
	description: 'Connect your GitHub account to enable automatic deployments',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	idempotent: false,
	requires: { auth: true, apiClient: true, orgId: true },
	examples: [
		{
			command: getCommand('integration github connect'),
			description: 'Connect GitHub to your organization',
		},
	],

	async handler(ctx) {
		const { logger, apiClient } = ctx;

		try {
			const startResult = await tui.spinner({
				message: 'Getting GitHub authorization URL...',
				clearOnSuccess: true,
				callback: () => startGithubIntegration(apiClient),
			});

			if (!startResult) {
				return;
			}

			const { url } = startResult;

			const copied = await tui.copyToClipboard(url);

			tui.newline();
			if (copied) {
				console.log('GitHub authorization URL copied to clipboard! Open it in your browser:');
			} else {
				console.log('Open this URL in your browser to authorize GitHub access:');
			}
			tui.newline();
			console.log(`  ${tui.link(url)}`);
			tui.newline();
			console.log(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
			tui.newline();

			const result = await tui.spinner({
				type: 'countdown',
				message: 'Waiting for GitHub authorization',
				timeoutMs: 600000, // 10 minutes
				clearOnSuccess: true,
				onEnterPress: () => {
					const platform = process.platform;
					if (platform === 'win32') {
						Bun.spawn(['cmd', '/c', 'start', '', url], {
							stdout: 'ignore',
							stderr: 'ignore',
						});
					} else {
						const command = platform === 'darwin' ? 'open' : 'xdg-open';
						Bun.spawn([command, url], { stdout: 'ignore', stderr: 'ignore' });
					}
				},
				callback: async () => {
					return await pollForGithubIntegration(apiClient);
				},
			});

			tui.newline();
			if (result.connected) {
				tui.success('GitHub integration connected successfully!');
				tui.newline();
				console.log(
					'You can now link repositories to your projects for automatic deployments.'
				);
			}
		} catch (error) {
			logger.trace(error);
			logger.fatal('GitHub integration failed: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
