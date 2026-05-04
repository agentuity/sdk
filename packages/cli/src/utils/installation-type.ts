/**
 * Detects how the CLI was installed and is being run
 */

import fs from 'node:fs';
import os from 'node:os';
import { entryScriptPath } from '../node-compat/runtime-info.ts';

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
 * Determines the installation type based on how the CLI is being executed
 *
 * @returns 'global' - Installed globally via `bun add -g @agentuity/cli`
 * @returns 'local' - Running from project's node_modules (bunx or direct)
 * @returns 'source' - Running from source code (development)
 */
export function getInstallationType(): InstallationType {
	// Resolve the entry script path to its real path (following symlinks)
	// and normalize separators. Bun's `Bun.main` already returns the
	// resolved real path; under Node we use `process.argv[1]` and call
	// `realpathSync` ourselves to match.
	const mainPath = resolveRealPath(entryScriptPath());

	// Get home directory reliably and resolve symlinks
	// On macOS, os.homedir() returns /Users/xxx which is already real
	const home = resolveRealPath(os.homedir() ?? process.env.HOME ?? process.env.USERPROFILE ?? '');

	// Get bun install directory from BUN_INSTALL or default to ~/.bun
	// Resolve symlinks to handle cases like BUN_INSTALL=/tmp/... on macOS where /tmp -> /private/tmp
	const bunInstallRaw = process.env.BUN_INSTALL ?? (home ? `${home}/.bun` : '');
	const bunInstall = resolveRealPath(bunInstallRaw);

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
	// This is when running directly from the monorepo:
	// packages/cli/src/main.ts
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
