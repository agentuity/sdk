import { $ } from 'bun';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { getVersion } from '../version';
import type { Logger } from '../types';

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

interface UpgradeResult {
	upgraded: string[];
	skipped: string[];
	failed: string[];
}

/**
 * Checks if a version specifier should be upgraded
 * @param specifier - The version specifier from package.json (e.g., "latest", "^1.0.0", "1.2.3")
 * @returns true if the package should be upgraded
 */
export function shouldUpgradeVersion(specifier: string): boolean {
	// Always upgrade "latest" and "*"
	if (specifier === 'latest' || specifier === '*') {
		return true;
	}

	// Skip pinned versions (exact semver like "1.2.3")
	if (/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(specifier)) {
		return false;
	}

	// Upgrade ranges (^1.0.0, ~1.0.0, >=1.0.0, etc.)
	// Check if the specifier is a range pattern
	if (/^[~^>=<]/.test(specifier)) {
		return true;
	}

	// Default to not upgrading if we can't determine
	return false;
}

/**
 * Check and upgrade @agentuity/* dependencies to match CLI version
 * @param projectDir - Root directory of the user's project
 * @param logger - Logger instance
 * @returns Result of the upgrade operation
 */
export async function checkAndUpgradeDependencies(
	projectDir: string,
	logger: Logger
): Promise<UpgradeResult> {
	const result: UpgradeResult = {
		upgraded: [],
		skipped: [],
		failed: [],
	};

	// Skip in CI/non-interactive environments
	if (!process.stdin.isTTY) {
		logger.debug('Skipping dependency check in non-interactive environment');
		return result;
	}

	const packageJsonPath = join(projectDir, 'package.json');
	const cliVersion = getVersion();

	logger.debug('CLI version: %s', cliVersion);

	// Read package.json
	let packageJson: PackageJson;
	try {
		packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	} catch (error) {
		logger.debug('Failed to read package.json: %s', error);
		return result;
	}

	// Collect all @agentuity/* packages and their original specifiers
	const allDeps = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
	};

	const agentuitPackages = Object.entries(allDeps)
		.filter(([name]) => name.startsWith('@agentuity/'))
		.map(([name, specifier]) => ({ name, specifier }));

	if (agentuitPackages.length === 0) {
		logger.debug('No @agentuity/* packages found in package.json');
		return result;
	}

	// Check which packages need upgrading
	const packagesToUpgrade = agentuitPackages.filter(({ specifier }) =>
		shouldUpgradeVersion(specifier)
	);

	if (packagesToUpgrade.length === 0) {
		logger.debug('All @agentuity/* packages are pinned, skipping upgrade');
		for (const pkg of agentuitPackages) {
			result.skipped.push(pkg.name);
		}
		return result;
	}

	// Check if CLI version is different from installed packages
	let needsUpgrade = false;
	for (const { name } of packagesToUpgrade) {
		try {
			const installedPackageJson = JSON.parse(
				readFileSync(join(projectDir, 'node_modules', name, 'package.json'), 'utf-8')
			);
			const installedVersion: string = installedPackageJson.version;
			if (installedVersion !== cliVersion) {
				logger.debug(
					'%s: installed=%s, cli=%s (needs upgrade)',
					name,
					installedVersion,
					cliVersion
				);
				needsUpgrade = true;
			} else {
				logger.debug('%s: already at correct version %s', name, installedVersion);
			}
		} catch {
			// Package not installed or can't read version - needs upgrade
			logger.debug('%s: not installed or unreadable, needs upgrade', name);
			needsUpgrade = true;
		}
	}

	if (!needsUpgrade) {
		logger.debug('All @agentuity/* packages are already at CLI version');
		for (const pkg of packagesToUpgrade) {
			result.skipped.push(pkg.name);
		}
		return result;
	}

	// Upgrade packages
	logger.debug('Upgrading %d @agentuity/* package(s) to %s', packagesToUpgrade.length, cliVersion);

	for (const { name } of packagesToUpgrade) {
		try {
			logger.debug('Installing %s@%s', name, cliVersion);
			const installResult = await $`bun add ${name}@${cliVersion}`.cwd(projectDir).quiet().nothrow();

			if (installResult.exitCode !== 0) {
				logger.error(
					'Failed to install %s@%s: %s',
					name,
					cliVersion,
					installResult.stderr.toString()
				);
				result.failed.push(name);
			} else {
				logger.debug('Successfully installed %s@%s', name, cliVersion);
				result.upgraded.push(name);
			}
		} catch (_error) {
			logger.error('Error installing %s: %s', name, _error);
			result.failed.push(name);
		}
	}

	// Restore original version specifiers in package.json
	// (bun add replaces them with specific versions)
	if (result.upgraded.length > 0) {
		try {
			const updatedPackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
			let modified = false;

			for (const { name, specifier } of packagesToUpgrade) {
				// Only restore if we successfully upgraded
				if (!result.upgraded.includes(name)) {
					continue;
				}

				// Check both dependencies and devDependencies
				if (updatedPackageJson.dependencies?.[name]) {
					updatedPackageJson.dependencies[name] = specifier;
					modified = true;
					logger.debug('Restored %s to "%s" in dependencies', name, specifier);
				}
				if (updatedPackageJson.devDependencies?.[name]) {
					updatedPackageJson.devDependencies[name] = specifier;
					modified = true;
					logger.debug('Restored %s to "%s" in devDependencies', name, specifier);
				}
			}

			if (modified) {
				writeFileSync(packageJsonPath, JSON.stringify(updatedPackageJson, null, 2) + '\n');
				logger.debug('Restored original version specifiers in package.json');
			}
		} catch (_error) {
			logger.warn('Failed to restore version specifiers in package.json: %s', _error);
		}
	}

	return result;
}
