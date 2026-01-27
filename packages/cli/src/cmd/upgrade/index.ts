import { createCommand } from '../../types';
import { getVersion, getCompareUrl, getReleaseUrl, toTag } from '../../version';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';
import { ErrorCode, createError, exitWithError } from '../../errors';
import * as tui from '../../tui';
import { $ } from 'bun';
import { getInstallationType, type InstallationType } from '../../utils/installation-type';

const UpgradeOptionsSchema = z.object({
	force: z.boolean().optional().describe('Force upgrade even if version is the same'),
});

const UpgradeResponseSchema = z.object({
	upgraded: z.boolean().describe('Whether an upgrade was performed'),
	from: z.string().describe('Version before upgrade'),
	to: z.string().describe('Version after upgrade'),
	message: z.string().describe('Status message'),
});

/**
 * Get the installation type - re-exported for backward compatibility
 * @deprecated Use getInstallationType() from '../../utils/installation-type' instead
 */
export { getInstallationType, type InstallationType };

/**
 * Check if running from a global installation
 * This replaces the old isRunningFromExecutable() function
 */
export function isGlobalInstall(): boolean {
	return getInstallationType() === 'global';
}

/**
 * Fetch the latest version from the API
 * @internal Exported for testing
 */
export async function fetchLatestVersion(): Promise<string> {
	const currentVersion = getVersion();
	const response = await fetch('https://agentuity.sh/release/sdk/version', {
		signal: AbortSignal.timeout(10_000), // 10 second timeout
		headers: {
			'User-Agent': `Agentuity CLI/${currentVersion}`,
		},
	});
	if (!response.ok) {
		const body = await response.text();
		if (response.status === 426) {
			tui.fatal(body, ErrorCode.UPGRADE_REQUIRED);
		}
		throw new Error(`Failed to fetch version: ${body}`);
	}

	const version = await response.text();
	const trimmedVersion = version.trim();

	// Validate version format
	if (
		!/^v?[0-9]+\.[0-9]+\.[0-9]+/.test(trimmedVersion) ||
		trimmedVersion.includes('message') ||
		trimmedVersion.includes('error') ||
		trimmedVersion.includes('<html>')
	) {
		throw new Error(`Invalid version format received: ${trimmedVersion}`);
	}

	// Ensure version has 'v' prefix
	return trimmedVersion.startsWith('v') ? trimmedVersion : `v${trimmedVersion}`;
}

/**
 * Upgrade the CLI using bun global install
 */
async function performBunUpgrade(version: string): Promise<void> {
	// Remove 'v' prefix for npm version
	const npmVersion = version.replace(/^v/, '');

	// Use bun to install the specific version globally
	const result = await $`bun add -g @agentuity/cli@${npmVersion}`.quiet().nothrow();

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString();
		throw new Error(`Failed to install @agentuity/cli@${npmVersion}: ${stderr}`);
	}
}

/**
 * Verify the upgrade was successful by checking the installed version
 */
async function verifyUpgrade(expectedVersion: string): Promise<void> {
	// Run agentuity version to check the installed version
	const result = await $`agentuity version`.quiet().nothrow();

	if (result.exitCode !== 0) {
		throw new Error('Failed to verify upgrade - could not run agentuity version');
	}

	const installedVersion = result.stdout.toString().trim();
	const normalizedExpected = expectedVersion.replace(/^v/, '');
	const normalizedInstalled = installedVersion.replace(/^v/, '');

	if (normalizedInstalled !== normalizedExpected) {
		throw new Error(
			`Version mismatch after upgrade: expected ${normalizedExpected}, got ${normalizedInstalled}`
		);
	}
}

export const command = createCommand({
	name: 'upgrade',
	description: 'Upgrade the CLI to the latest version',
	hidden: false, // Always visible, but handler checks installation type
	skipUpgradeCheck: true,
	tags: ['update'],
	examples: [
		{
			command: getCommand('upgrade'),
			description: 'Check for updates and prompt to upgrade',
		},
		{
			command: getCommand('upgrade --force'),
			description: 'Force upgrade even if already on latest version',
		},
	],
	schema: {
		options: UpgradeOptionsSchema,
		response: UpgradeResponseSchema,
	},

	async handler(ctx) {
		const { logger, options } = ctx;
		const { force } = ctx.opts;

		const installationType = getInstallationType();
		const currentVersion = getVersion();

		// Check if we can upgrade based on installation type
		if (installationType === 'source') {
			tui.error('Upgrade is not available when running from source.');
			tui.warning('You are running the CLI from source code (development mode).');
			tui.info('Use git to update the source code instead.');
			return {
				upgraded: false,
				from: currentVersion,
				to: currentVersion,
				message: 'Cannot upgrade: running from source',
			};
		}

		if (installationType === 'local') {
			tui.error('Upgrade is not available for local project installations.');
			tui.warning('The CLI is installed as a project dependency.');
			tui.newline();
			console.log('To upgrade, update your package.json or run:');
			console.log(`  ${tui.muted('bun add @agentuity/cli@latest')}`);
			return {
				upgraded: false,
				from: currentVersion,
				to: currentVersion,
				message: 'Cannot upgrade: local project installation',
			};
		}

		try {
			// Fetch latest version
			const latestVersion = await tui.spinner({
				message: 'Checking for updates...',
				clearOnSuccess: true,
				callback: async () => await fetchLatestVersion(),
			});

			// Compare versions
			const normalizedCurrent = currentVersion.replace(/^v/, '');
			const normalizedLatest = latestVersion.replace(/^v/, '');

			if (normalizedCurrent === normalizedLatest && !force) {
				const message = `Already on latest version ${currentVersion}`;
				tui.success(message);
				return {
					upgraded: false,
					from: currentVersion,
					to: latestVersion,
					message,
				};
			}

			// Show version info
			if (!force) {
				tui.info(`Current version: ${tui.muted(normalizedCurrent)}`);
				tui.info(`Latest version:  ${tui.bold(normalizedLatest)}`);
				tui.newline();
				if (toTag(currentVersion) !== toTag(latestVersion)) {
					tui.warning(
						`What's changed:  ${tui.link(getCompareUrl(currentVersion, latestVersion))}`
					);
				}
				tui.success(`Release notes:   ${tui.link(getReleaseUrl(latestVersion))}`);
				tui.newline();
			}

			// Confirm upgrade
			if (!force) {
				const shouldUpgrade = await tui.confirm('Do you want to upgrade?', true);

				if (!shouldUpgrade) {
					const message = 'Upgrade cancelled';
					tui.info(message);
					return {
						upgraded: false,
						from: currentVersion,
						to: latestVersion,
						message,
					};
				}
			}

			// Perform the upgrade using bun
			await tui.spinner({
				message: `Installing @agentuity/cli@${normalizedLatest}...`,
				callback: async () => await performBunUpgrade(latestVersion),
			});

			// Verify the upgrade
			await tui.spinner({
				message: 'Verifying installation...',
				callback: async () => await verifyUpgrade(latestVersion),
			});

			const message =
				normalizedCurrent === normalizedLatest
					? `Successfully reinstalled ${normalizedLatest}`
					: `Successfully upgraded from ${normalizedCurrent} to ${normalizedLatest}`;
			tui.success(message);

			// Hint about PATH if needed
			tui.newline();
			tui.info(
				`${tui.muted('If the new version is not detected, restart your terminal or run:')} source ~/.bashrc`
			);

			return {
				upgraded: true,
				from: currentVersion,
				to: latestVersion,
				message,
			};
		} catch (error) {
			const errorDetails: Record<string, unknown> = {
				error: error instanceof Error ? error.message : 'Unknown error',
				installationType,
			};

			exitWithError(
				createError(ErrorCode.INTERNAL_ERROR, 'Upgrade failed', errorDetails),
				logger,
				options.errorFormat
			);
		}
	},
});
