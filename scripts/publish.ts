#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import * as readline from 'node:readline';

const rootDir = join(import.meta.dir, '..');
const packagesDir = join(rootDir, 'packages');
const appsDir = join(rootDir, 'apps');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function readLine(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(prompt, (answer) => {
			resolve(answer.trim());
		});
	});
}

function showHelp() {
	console.log(`
Usage: bun scripts/publish.ts [options]

Options:
  --dry-run    Run the publish process without actually publishing to npm.
               Version changes will be automatically reverted after completion.
  --help       Show this help message

Description:
  Interactive script to publish packages to npm. Supports patch, minor, major,
  and prerelease versions with automatic version bumping.

  Release types (prerelease is default):
    Prerelease: 1.0.0 -> 1.0.1-0 (first prerelease of next patch)
                1.0.1-0 -> 1.0.1-1 (increment prerelease)
                
    Patch:      1.0.0 -> 1.0.1 (bug fixes)
                1.0.1-0 -> 1.0.1 (promote prerelease to stable)
                
    Minor:      1.0.0 -> 1.1.0 (new features, backwards compatible)
                1.0.1-0 -> 1.1.0 (promote prerelease and bump minor)
                
    Major:      1.0.0 -> 2.0.0 (breaking changes)
                1.0.1-0 -> 2.0.0 (promote prerelease and bump major)

  npm dist-tags:
    - Stable releases (patch/minor/major) are published with tag "latest"
    - Prereleases are published with tag "next"

Examples:
  bun scripts/publish.ts                 # Publish to npm (interactive)
  bun scripts/publish.ts --dry-run       # Test without publishing
`);
	rl.close();
	process.exit(0);
}

async function readJSON(path: string) {
	const content = await readFile(path, 'utf-8');
	return JSON.parse(content);
}

async function writeJSON(path: string, data: unknown) {
	await writeFile(path, JSON.stringify(data, null, '\t') + '\n');
}

function isPrerelease(version: string): boolean {
	return version.includes('-');
}

function bumpPatch(version: string): string {
	if (isPrerelease(version)) {
		return version.split('-')[0];
	}
	const parts = version.split('.');
	parts[2] = String(Number(parts[2].split('-')[0]) + 1);
	return parts.join('.');
}

function bumpMinor(version: string): string {
	const base = isPrerelease(version) ? version.split('-')[0] : version;
	const parts = base.split('.');
	parts[1] = String(Number(parts[1]) + 1);
	parts[2] = '0';
	return parts.join('.');
}

function bumpMajor(version: string): string {
	const base = isPrerelease(version) ? version.split('-')[0] : version;
	const parts = base.split('.');
	parts[0] = String(Number(parts[0]) + 1);
	parts[1] = '0';
	parts[2] = '0';
	return parts.join('.');
}

function bumpPrerelease(version: string): string {
	if (isPrerelease(version)) {
		const [base, prerelease] = version.split('-');
		return `${base}-${Number(prerelease) + 1}`;
	}
	const nextPatch = bumpPatch(version);
	return `${nextPatch}-0`;
}

async function promptReleaseType(
	currentVersion: string
): Promise<'patch' | 'minor' | 'major' | 'prerelease'> {
	console.log(`\nCurrent version: ${currentVersion}`);
	console.log('Options:');
	console.log('  [1] prerelease - Create/increment prerelease version (default)');
	console.log('  [2] patch - Patch release (0.0.x)');
	console.log('  [3] minor - Minor release (0.x.0)');
	console.log('  [4] major - Major release (x.0.0)');

	while (true) {
		const input = await readLine('Choose release type (1/2/3/4) [1]: ');
		if (!input || input === '1') return 'prerelease';
		if (input === '2') return 'patch';
		if (input === '3') return 'minor';
		if (input === '4') return 'major';
		console.log('Invalid choice. Please enter 1, 2, 3, or 4.');
	}
}

async function confirmVersion(newVersion: string): Promise<boolean> {
	console.log(`\nNew version will be: ${newVersion}`);

	while (true) {
		const input = (await readLine('Continue? (Y/n): ')).toLowerCase();
		if (!input || input === 'y' || input === 'yes') return true;
		if (input === 'n' || input === 'no') return false;
		console.log('Please enter Y or n.');
	}
}

async function updateVersions(version: string) {
	const rootPkgPath = join(rootDir, 'package.json');
	const rootPkg = await readJSON(rootPkgPath);
	rootPkg.version = version;
	await writeJSON(rootPkgPath, rootPkg);
	console.log(`✓ Updated root package.json to ${version}`);

	// Update packages/*
	const packages = await readdir(packagesDir);
	for (const pkg of packages) {
		const pkgJsonPath = join(packagesDir, pkg, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			pkgJson.version = version;

			// Update workspace:* dependencies to explicit version
			if (pkgJson.dependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.dependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.dependencies[dep] = version;
					}
				}
			}
			if (pkgJson.devDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.devDependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.devDependencies[dep] = version;
					}
				}
			}
			if (pkgJson.peerDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.peerDependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.peerDependencies[dep] = version;
					}
				}
			}

			await writeJSON(pkgJsonPath, pkgJson);
			console.log(`✓ Updated packages/${pkg} to ${version}`);
		} catch {
			console.log(`⊘ Skipped packages/${pkg} (no package.json)`);
		}
	}

	// Update apps/*
	const apps = await readdir(appsDir);
	for (const app of apps) {
		const pkgJsonPath = join(appsDir, app, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			pkgJson.version = version;

			// Update workspace:* dependencies to explicit version
			if (pkgJson.dependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.dependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.dependencies[dep] = version;
					}
				}
			}
			if (pkgJson.devDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.devDependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.devDependencies[dep] = version;
					}
				}
			}
			if (pkgJson.peerDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.peerDependencies)) {
					if (depVersion === 'workspace:*') {
						pkgJson.peerDependencies[dep] = version;
					}
				}
			}

			await writeJSON(pkgJsonPath, pkgJson);
			console.log(`✓ Updated apps/${app} to ${version}`);
		} catch {
			console.log(`⊘ Skipped apps/${app} (no package.json)`);
		}
	}
}

async function restoreWorkspaceDependencies(version: string) {
	console.log('\n🔄 Restoring workspace:* dependencies...');

	// Restore packages/*
	const packages = await readdir(packagesDir);
	for (const pkg of packages) {
		const pkgJsonPath = join(packagesDir, pkg, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			let changed = false;

			if (pkgJson.dependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.dependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.dependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}
			if (pkgJson.devDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.devDependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.devDependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}
			if (pkgJson.peerDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.peerDependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.peerDependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}

			if (changed) {
				await writeJSON(pkgJsonPath, pkgJson);
				console.log(`✓ Restored workspace:* in packages/${pkg}`);
			}
		} catch {
			// Skip
		}
	}

	// Restore apps/*
	const apps = await readdir(appsDir);
	for (const app of apps) {
		const pkgJsonPath = join(appsDir, app, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			let changed = false;

			if (pkgJson.dependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.dependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.dependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}
			if (pkgJson.devDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.devDependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.devDependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}
			if (pkgJson.peerDependencies) {
				for (const [dep, depVersion] of Object.entries(pkgJson.peerDependencies)) {
					if (depVersion === version && dep.startsWith('@agentuity/')) {
						pkgJson.peerDependencies[dep] = 'workspace:*';
						changed = true;
					}
				}
			}

			if (changed) {
				await writeJSON(pkgJsonPath, pkgJson);
				console.log(`✓ Restored workspace:* in apps/${app}`);
			}
		} catch {
			// Skip
		}
	}
}

async function getPublishablePackages(): Promise<
	Array<{ name: string; dir: string; path: string }>
> {
	const publishable: Array<{ name: string; dir: string; path: string }> = [];

	// Check packages/*
	const packages = await readdir(packagesDir);
	for (const pkg of packages) {
		const pkgJsonPath = join(packagesDir, pkg, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			if (!pkgJson.private) {
				publishable.push({ name: pkg, dir: 'packages', path: join(packagesDir, pkg) });
			}
		} catch {
			// Skip if no package.json
		}
	}

	// Check apps/*
	const apps = await readdir(appsDir);
	for (const app of apps) {
		const pkgJsonPath = join(appsDir, app, 'package.json');
		try {
			const pkgJson = await readJSON(pkgJsonPath);
			if (!pkgJson.private) {
				publishable.push({ name: app, dir: 'apps', path: join(appsDir, app) });
			}
		} catch {
			// Skip if no package.json
		}
	}

	// Sort by dependency order: core first, then bundler, then others, create-agentuity last
	return publishable.sort((a, b) => {
		if (a.name === 'core') return -1;
		if (b.name === 'core') return 1;
		if (a.name === 'create-agentuity') return 1;
		if (b.name === 'create-agentuity') return -1;
		if (a.name === 'cli') return 1;
		if (b.name === 'cli') return -1;
		return a.name.localeCompare(b.name);
	});
}

async function revertVersionChanges() {
	await $`git checkout -- package.json packages/*/package.json apps/*/package.json bun.lock`.cwd(
		rootDir
	);
}

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		showHelp();
	}

	const isDryRun = process.argv.includes('--dry-run');
	console.log(`🚀 Publishing packages to npm${isDryRun ? ' (DRY RUN)' : ''}\n`);

	const rootPkg = await readJSON(join(rootDir, 'package.json'));
	const currentVersion = rootPkg.version;

	const releaseType = await promptReleaseType(currentVersion);

	let newVersion: string;
	switch (releaseType) {
		case 'prerelease':
			newVersion = bumpPrerelease(currentVersion);
			break;
		case 'patch':
			newVersion = bumpPatch(currentVersion);
			break;
		case 'minor':
			newVersion = bumpMinor(currentVersion);
			break;
		case 'major':
			newVersion = bumpMajor(currentVersion);
			break;
	}

	const isPreReleaseVersion = isPrerelease(newVersion);
	const distTag = isPreReleaseVersion ? 'next' : 'latest';

	const confirmed = await confirmVersion(newVersion);
	if (!confirmed) {
		console.log('\n❌ Publish cancelled\n');
		rl.close();
		process.exit(0);
	}

	console.log(`\n📦 Setting version to: ${newVersion}`);
	console.log(`📌 npm dist-tag: ${distTag}\n`);

	try {
		await updateVersions(newVersion);

		console.log('\n📥 Running bun install...');
		await $`bun install`.cwd(rootDir);

		console.log('\n🧹 Running bun run clean...');
		await $`bun run clean`.cwd(rootDir);

		console.log('\n🔨 Running bun run build...');
		await $`bun run build`.cwd(rootDir);

		const publishable = await getPublishablePackages();
		const names = publishable.map((p) => `${p.dir}/${p.name}`).join(', ');
		console.log(`\n📤 Publishing ${publishable.length} packages in order: ${names}\n`);

		for (const pkg of publishable) {
			const pkgJson = await readJSON(join(pkg.path, 'package.json'));
			const pkgName = pkgJson.name;
			console.log(`\n📦 Publishing ${pkgName}...`);
			try {
				const args = ['publish', '--access', 'public', '--tag', distTag];
				if (isDryRun) args.push('--dry-run');
				await $`bun ${args}`.cwd(pkg.path);
				console.log(`✓ ${isDryRun ? 'Dry run completed for' : 'Published'} ${pkgName}`);
			} catch (err) {
				console.error(`✗ Failed to publish ${pkgName}:`, err);
				throw err;
			}
		}

		console.log('\n✨ All packages published successfully!\n');

		if (!isDryRun) {
			await restoreWorkspaceDependencies(newVersion);
		}
	} finally {
		if (isDryRun) {
			console.log('\n🔄 Reverting version changes...');
			await revertVersionChanges();
			console.log('✓ Changes reverted\n');
		}
		rl.close();
	}
}

main().catch((err) => {
	console.error('Error:', err);
	rl.close();
	process.exit(1);
});
