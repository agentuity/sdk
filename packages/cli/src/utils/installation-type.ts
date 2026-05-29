/**
 * Detects how the CLI was installed and is being run
 */

import fs from 'node:fs';
import os from 'node:os';

export type InstallationType = 'global' | 'local' | 'source';

/**
 * Resolve a path to its real path (following symlinks) and normalize to POSIX separators.
 * Returns the original path if resolution fails.
 */
function resolveRealPath(path: string): string {
	if (!path) return '';
	try {
		// fs.realpathSync resolves symlinks (e.g., /tmp -> /private/tmp on macOS)
		return fs.realpathSync(path).replace(/\\/g, '/');
	} catch {
		// If the path doesn't exist or can't be resolved, return normalized original
		return path.replace(/\\/g, '/');
	}
}

/**
 * Pure classification of installation type from already-resolved paths.
 * Exported for testing — `getInstallationType()` gathers the runtime paths and delegates here.
 *
 * @param mainPath - The resolved entry path (Bun.main), POSIX-normalized.
 * @param home - The resolved home directory, POSIX-normalized (may be '').
 * @param bunInstall - The resolved bun install dir (~/.bun or $BUN_INSTALL), POSIX-normalized (may be '').
 */
export function classifyInstallationType(
	mainPath: string,
	home: string,
	bunInstall: string
): InstallationType {
	// GLOBAL DETECTION: Check if running from bun's global install location
	// When installed via `bun add -g`, the CLI lives at ~/.bun/node_modules/@agentuity/cli/
	// or ~/.bun/install/global/node_modules/@agentuity/cli/
	if (bunInstall) {
		// Check for ~/.bun/node_modules/@agentuity/cli/ (common bun global layout)
		if (mainPath.startsWith(`${bunInstall}/node_modules/@agentuity/cli/`)) {
			return 'global';
		}
		// Check for ~/.bun/install/global/node_modules/@agentuity/cli/ (alternative layout)
		if (mainPath.startsWith(`${bunInstall}/install/global/`)) {
			return 'global';
		}
	}

	// GLOBAL DETECTION: Check for legacy ~/.agentuity/ installation
	// The install.sh script may install to ~/.agentuity/node_modules/@agentuity/cli/
	// or create a shim at ~/.agentuity/bin/agentuity
	if (home) {
		const agentuityDir = resolveRealPath(`${home}/.agentuity`);
		if (mainPath.startsWith(`${agentuityDir}/`)) {
			return 'global';
		}
	}

	// LOCAL DETECTION (must run before the bun-global fallback below):
	// A project/workspace install lives in bun's isolated store at
	// `<project>/node_modules/.bun/<pkg>/node_modules/@agentuity/cli/`. That path contains
	// both `/.bun/` and `/node_modules/@agentuity/cli/`, so the loose fallback below would
	// otherwise misclassify it as `global` and prompt the user to upgrade a project
	// dependency they can't change with `agentuity upgrade` — re-prompting on every run.
	// The `/node_modules/.bun/` segment is unique to project stores; real bun-global installs
	// live at `~/.bun/...` with no `node_modules/` ancestor before `.bun`.
	if (mainPath.includes('/node_modules/.bun/')) {
		return 'local';
	}

	// GLOBAL DETECTION: Fallback check for any path containing /.bun/ before node_modules
	// This catches edge cases where BUN_INSTALL might not match the actual path
	if (mainPath.includes('/.bun/') && mainPath.includes('/node_modules/@agentuity/cli/')) {
		return 'global';
	}

	// LOCAL DETECTION: Running from a project's node_modules
	// This is when someone runs `bunx agentuity` or has it as a project dependency
	// At this point, we've ruled out global installs, so any node_modules path is local
	if (mainPath.includes('/node_modules/@agentuity/cli/')) {
		return 'local';
	}

	// SOURCE DETECTION: Running from source code (development)
	// This is when running directly from the monorepo: packages/cli/bin/cli.ts
	return 'source';
}

/**
 * Determines the installation type based on how the CLI is being executed
 *
 * @returns 'global' - Installed globally via `bun add -g @agentuity/cli`
 * @returns 'local' - Running from project's node_modules (bunx or direct)
 * @returns 'source' - Running from source code (development)
 */
export function getInstallationType(): InstallationType {
	// Bun.main already returns the resolved real path, just normalize separators
	const mainPath = Bun.main.replace(/\\/g, '/');

	// Get home directory reliably and resolve symlinks
	// On macOS, os.homedir() returns /Users/xxx which is already real
	const home = resolveRealPath(os.homedir() ?? process.env.HOME ?? process.env.USERPROFILE ?? '');

	// Get bun install directory from BUN_INSTALL or default to ~/.bun
	// Resolve symlinks to handle cases like BUN_INSTALL=/tmp/... on macOS where /tmp -> /private/tmp
	const bunInstallRaw = process.env.BUN_INSTALL ?? (home ? `${home}/.bun` : '');
	const bunInstall = resolveRealPath(bunInstallRaw);

	return classifyInstallationType(mainPath, home, bunInstall);
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
