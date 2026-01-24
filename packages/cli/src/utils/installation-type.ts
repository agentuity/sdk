/**
 * Detects how the CLI was installed and is being run
 */

export type InstallationType = 'global' | 'local' | 'source';

/**
 * Determines the installation type based on how the CLI is being executed
 *
 * @returns 'global' - Installed globally via `bun add -g @agentuity/cli`
 * @returns 'local' - Running from project's node_modules (bunx or direct)
 * @returns 'source' - Running from source code (development)
 */
export function getInstallationType(): InstallationType {
	// Normalize paths to POSIX separators for cross-platform compatibility
	const mainPath = Bun.main.replace(/\\/g, '/');
	// Bun.argv[1] contains the original invocation path (before symlink resolution)
	const invokedPath = (Bun.argv[1] ?? '').replace(/\\/g, '/');

	// Get bun's global bin directory from BUN_INSTALL or default to ~/.bun/bin
	const bunInstall = (process.env.BUN_INSTALL ?? `${process.env.HOME ?? process.env.USERPROFILE}/.bun`).replace(
		/\\/g,
		'/'
	);
	const globalBinDir = `${bunInstall}/bin/`;

	// Global install: invoked from bun's global bin directory (e.g., ~/.bun/bin/agentuity)
	// This handles symlinks created by `bun add -g @agentuity/cli`
	if (invokedPath.startsWith(globalBinDir)) {
		return 'global';
	}

	// Also check the resolved path for explicit global install locations
	if (mainPath.includes('/.bun/install/global/')) {
		return 'global';
	}

	// Local project install: ./node_modules/@agentuity/cli/...
	if (mainPath.includes('/node_modules/@agentuity/cli/')) {
		return 'local';
	}

	// Source/development: packages/cli/bin/cli.ts or similar
	return 'source';
}

/**
 * Check if running from a global installation
 */
export function isGlobalInstall(): boolean {
	return getInstallationType() === 'global';
}

/**
 * Check if running from a local project installation
 */
export function isLocalInstall(): boolean {
	return getInstallationType() === 'local';
}

/**
 * Check if running from source (development mode)
 */
export function isSourceInstall(): boolean {
	return getInstallationType() === 'source';
}
