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
	const mainPath = Bun.main;

	// Global install: ~/.bun/install/global/node_modules/@agentuity/cli/...
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
