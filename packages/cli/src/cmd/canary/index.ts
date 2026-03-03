import { createCommand } from '../../types.ts';
import { z } from 'zod';
import { $ } from 'bun';
import { tmpdir } from 'node:os';
import * as tui from '../../tui.ts';

const CANARY_BASE_URL = 'https://agentuity-sdk-objects.t3.storageapi.dev/npm';

const CanaryArgsSchema = z.object({
	args: z
		.array(z.string())
		.describe('Version followed by commands to run (e.g., 0.1.6-abc1234 deploy --force)'),
});

const CanaryResponseSchema = z.object({
	executed: z.boolean().describe('Whether the canary was executed'),
	version: z.string().describe('The canary version'),
	message: z.string().describe('Status message'),
});

function isHttpsUrl(str: string): boolean {
	return str.startsWith('https://');
}

function isHttpUrl(str: string): boolean {
	return str.startsWith('http://') && !str.startsWith('https://');
}

export const command = createCommand({
	name: 'canary',
	description: 'Run a canary version of the CLI',
	hidden: true,
	skipUpgradeCheck: true,
	passThroughArgs: true,
	schema: {
		args: CanaryArgsSchema,
		response: CanaryResponseSchema,
	},

	async handler(ctx) {
		const { args, logger } = ctx;

		// Get raw args from process.argv to capture ALL args after 'canary <version>'
		const argv = process.argv;
		const canaryIndex = argv.indexOf('canary');

		if (args.args.length === 0) {
			tui.error('Usage: agentuity canary <version> [commands...]');
			tui.newline();
			tui.info('Examples:');
			tui.info('  agentuity canary 0.1.6-abc1234');
			tui.info('  agentuity canary 0.1.6-abc1234 deploy --log-level trace');
			return {
				executed: false,
				version: '',
				message: 'No target specified',
			};
		}

		// Get target from parsed args, but get forward args from raw argv
		const target = args.args[0];
		if (!target) {
			tui.error('Usage: agentuity canary <version> [commands...]');
			return {
				executed: false,
				version: '',
				message: 'No target specified',
			};
		}
		const targetIndex = canaryIndex >= 0 ? argv.indexOf(target, canaryIndex) : -1;
		const forwardArgs = targetIndex >= 0 ? argv.slice(targetIndex + 1) : args.args.slice(1);

		// Reject HTTP URLs for security
		if (isHttpUrl(target)) {
			tui.error('HTTP URLs are not allowed. Please use HTTPS.');
			return {
				executed: false,
				version: '',
				message: 'HTTP URLs are not allowed for security reasons',
			};
		}

		let version: string;
		let tarballUrl: string;

		if (isHttpsUrl(target)) {
			// Direct URL to tarball
			tarballUrl = target;
			// Extract version from URL if possible
			const match = target.match(/agentuity-cli-(\d+\.\d+\.\d+-[a-f0-9]+)\.tgz/);
			version = match?.[1] ?? 'custom';
		} else {
			// Version string - construct URL
			version = target;
			tarballUrl = `${CANARY_BASE_URL}/${version}/agentuity-cli-${version}.tgz`;
		}

		tui.info(`Installing canary CLI version ${version}...`);
		logger.debug('Tarball URL: %s', tarballUrl);

		try {
			// Install the canary version globally using the tarball URL
			// Run from tmpdir to avoid interference from any local package.json/node_modules
			const installResult = await $`bun add -g ${tarballUrl}`.cwd(tmpdir()).quiet().nothrow();

			if (installResult.exitCode !== 0) {
				const stderr = installResult.stderr.toString();
				tui.error(`Failed to install canary version: ${stderr}`);
				return {
					executed: false,
					version,
					message: `Installation failed: ${stderr}`,
				};
			}

			tui.success(`Installed canary version ${version}`);

			// If no additional args, just report success
			if (forwardArgs.length === 0) {
				tui.info('Run commands with: agentuity <command>');
				return {
					executed: true,
					version,
					message: `Canary version ${version} installed. Use 'agentuity <command>' to run commands.`,
				};
			}

			// Execute the command with the newly installed canary
			tui.info(`Running: agentuity ${forwardArgs.join(' ')}`);
			tui.newline();

			const result = await $`agentuity ${forwardArgs}`.nothrow();

			return {
				executed: true,
				version,
				message: result.exitCode === 0 ? 'Command executed successfully' : 'Command failed',
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			tui.error(`Failed to run canary: ${message}`);
			return {
				executed: false,
				version,
				message,
			};
		}
	},
});
