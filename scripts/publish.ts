#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const rootDir = join(import.meta.dir, '..');
const packagesDir = join(rootDir, 'packages');
const appsDir = join(rootDir, 'apps');

async function readJSON(path: string) {
	const content = await readFile(path, 'utf-8');
	return JSON.parse(content);
}

async function writeJSON(path: string, data: unknown) {
	await writeFile(path, JSON.stringify(data, null, '\t') + '\n');
}

function bumpPatch(version: string): string {
	const parts = version.split('.');
	parts[2] = String(Number(parts[2]) + 1);
	return parts.join('.');
}

async function promptVersion(defaultVersion: string): Promise<string> {
	console.log(`\nCurrent version: ${defaultVersion.replace(/\+1$/, '')}`);
	console.log(`Default (patch bump): ${defaultVersion}`);
	process.stdout.write('Enter version (or press Enter for default): ');

	for await (const line of console) {
		const input = line.trim();
		return input || defaultVersion;
	}
	return defaultVersion;
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
			await writeJSON(pkgJsonPath, pkgJson);
			console.log(`✓ Updated apps/${app} to ${version}`);
		} catch {
			console.log(`⊘ Skipped apps/${app} (no package.json)`);
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
		if (a.name === 'bundler') return -1;
		if (b.name === 'bundler') return 1;
		if (a.name === 'create-agentuity') return 1;
		if (b.name === 'create-agentuity') return -1;
		if (a.name === 'cli') return 1;
		if (b.name === 'cli') return -1;
		return a.name.localeCompare(b.name);
	});
}

async function main() {
	const isDryRun = process.argv.includes('--dry-run');
	console.log(`🚀 Publishing packages to npm${isDryRun ? ' (DRY RUN)' : ''}\n`);

	const rootPkg = await readJSON(join(rootDir, 'package.json'));
	const currentVersion = rootPkg.version;
	const defaultVersion = bumpPatch(currentVersion);

	const newVersion = await promptVersion(defaultVersion);
	console.log(`\n📦 Setting version to: ${newVersion}\n`);

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
			const args = ['publish', '--access', 'public'];
			if (isDryRun) args.push('--dry-run');
			await $`bun ${args}`.cwd(pkg.path);
			console.log(`✓ ${isDryRun ? 'Dry run completed for' : 'Published'} ${pkgName}`);
		} catch (err) {
			console.error(`✗ Failed to publish ${pkgName}:`, err);
			process.exit(1);
		}
	}

	console.log('\n✨ All packages published successfully!\n');
}

main().catch((err) => {
	console.error('Error:', err);
	process.exit(1);
});
