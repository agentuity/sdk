import type { Config, Logger, CommandDefinition } from './types';
import { isRunningFromExecutable, fetchLatestVersion } from './cmd/upgrade';
import { getVersion, getCompareUrl, getReleaseUrl, toTag } from './version';
import * as tui from './tui';
import { saveConfig } from './config';
import { $ } from 'bun';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Check if we should skip the version check based on environment and config
 */
function shouldSkipCheck(
	config: Config | null,
	options: {
		json?: boolean;
		quiet?: boolean;
		validate?: boolean;
		dryRun?: boolean;
		skipVersionCheck?: boolean;
	},
	commandDef: CommandDefinition | undefined,
	args: string[]
): boolean {
	// Skip if running via bun/bunx (not installed executable)
	if (!isRunningFromExecutable()) {
		return true;
	}

	// Skip if no TTY (CI, redirected output, etc.)
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return true;
	}

	// Skip if any of these flags are set
	if (options.json || options.quiet || options.validate || options.dryRun) {
		return true;
	}

	// Skip if explicitly disabled via flag
	if (options.skipVersionCheck) {
		return true;
	}

	// Skip if explicitly disabled via environment variable
	if (process.env.AGENTUITY_SKIP_VERSION_CHECK === '1') {
		return true;
	}

	// Skip if explicitly disabled via config
	if (config?.overrides?.skip_version_check) {
		return true;
	}

	// Skip if development version (0.0.x or 'dev')
	const currentVersion = getVersion();
	if (currentVersion.startsWith('0.0.') || currentVersion === 'dev') {
		return true;
	}

	// Skip if command explicitly opts out of upgrade check
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (commandDef && (commandDef as any).skipUpgradeCheck === true) {
		return true;
	}

	// Skip for help commands
	const helpFlags = ['--help', '-h', 'help'];
	if (args.some((arg) => helpFlags.includes(arg))) {
		return true;
	}

	return false;
}

/**
 * Check if enough time has passed since last check (at least 1 hour)
 */
function shouldCheckNow(config: Config | null): boolean {
	const lastCheck = config?.preferences?.last_update_check;
	if (!lastCheck) {
		return true;
	}

	const now = Date.now();
	const elapsed = now - lastCheck;
	return elapsed >= ONE_HOUR_MS;
}

/**
 * Prompt user to upgrade to a new version
 * Returns true if user wants to upgrade, false otherwise
 */
async function promptUpgrade(currentVersion: string, latestVersion: string): Promise<boolean> {
	// Strip 'v' prefix for display
	const displayCurrent = currentVersion.replace(/^v/, '');
	const displayLatest = latestVersion.replace(/^v/, '');

	tui.newline();
	tui.info(`${tui.bold('A new version of the CLI is available!')}`);
	tui.info(`Current version: ${tui.muted(displayCurrent)}`);
	tui.info(`Latest version:  ${tui.bold(displayLatest)}`);
	tui.newline();
	if (toTag(currentVersion) !== toTag(latestVersion)) {
		tui.warning(`What's changed:  ${tui.link(getCompareUrl(currentVersion, latestVersion))}`);
	}
	tui.success(`Release notes:   ${tui.link(getReleaseUrl(latestVersion))}`);
	tui.newline();

	return await tui.confirm('Would you like to upgrade now?', true);
}

/**
 * Update the last check timestamp in config
 */
async function updateCheckTimestamp(config: Config | null, logger: Logger): Promise<void> {
	if (!config) {
		return;
	}

	const updatedConfig: Config = {
		...config,
		preferences: {
			...config.preferences,
			last_update_check: Date.now(),
		},
	};

	try {
		await saveConfig(updatedConfig);
	} catch (error) {
		// Non-fatal - log but continue
		logger.debug('Failed to save config after version check: %s', error);
	}
}

/**
 * Perform the upgrade and re-run the command
 */
async function performUpgrade(logger: Logger): Promise<void> {
	try {
		// Run upgrade command with --force since user already confirmed via prompt
		// Use process.execPath to get the actual binary path (not Bun.main which is virtual)
		logger.info('Starting upgrade...');
		await $`${process.execPath} upgrade --force`.quiet();

		// If we got here, the upgrade succeeded
		// Re-run the original command with the new binary
		const args = process.argv.slice(2);
		const newBinaryPath = process.execPath;

		logger.info('Upgrade successful! Restarting with new version...');
		console.log('');

		// Spawn new process with same arguments
		const proc = Bun.spawn([newBinaryPath, ...args], {
			stdin: 'inherit',
			stdout: 'inherit',
			stderr: 'inherit',
		});

		// Wait for the new process to complete
		await proc.exited;

		// Exit with the same exit code as the new process
		process.exit(proc.exitCode ?? 0);
	} catch (error) {
		// Upgrade failed - log and continue with original command
		logger.error('Upgrade failed: %s', error instanceof Error ? error.message : 'Unknown error');
		tui.warning('Continuing with current version...');
		tui.info('');
	}
}

/**
 * Check for updates and optionally prompt to upgrade
 * Should be called early in the CLI initialization, before commands execute
 */
export async function checkForUpdates(
	config: Config | null,
	logger: Logger,
	options: {
		json?: boolean;
		quiet?: boolean;
		validate?: boolean;
		dryRun?: boolean;
		skipVersionCheck?: boolean;
	},
	commandDef: CommandDefinition | undefined,
	args: string[]
): Promise<void> {
	// Determine if we should skip the check
	if (shouldSkipCheck(config, options, commandDef, args)) {
		logger.trace('Skipping version check (disabled or not applicable)');
		return;
	}

	// Check if enough time has passed
	if (!shouldCheckNow(config)) {
		logger.trace('Skipping version check (checked recently)');
		return;
	}

	// Perform the actual version check
	logger.trace('Checking for updates...');

	try {
		const currentVersion = getVersion();
		const latestVersion = await fetchLatestVersion();

		// Update the timestamp since we successfully checked
		await updateCheckTimestamp(config, logger);

		// Compare versions
		const normalizedCurrent = currentVersion.replace(/^v/, '');
		const normalizedLatest = latestVersion.replace(/^v/, '');

		if (normalizedCurrent === normalizedLatest) {
			logger.trace('Already on latest version: %s', currentVersion);
			return;
		}

		// New version available - prompt user
		const shouldUpgrade = await promptUpgrade(currentVersion, latestVersion);

		if (!shouldUpgrade) {
			// User declined - just continue
			tui.info('You can upgrade later by running: agentuity upgrade');
			tui.newline();
			return;
		}

		// User wants to upgrade - perform it
		await performUpgrade(logger);
	} catch (error) {
		// Non-fatal - if we can't fetch the latest version (network error, timeout, etc.),
		// just log at debug level and continue without interrupting the user's command
		logger.debug(
			'Version check failed: %s',
			error instanceof Error ? error.message : 'Unknown error'
		);
	}
}
