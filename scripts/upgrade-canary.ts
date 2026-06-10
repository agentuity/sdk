#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { $ } from 'bun';

const CANARY_BASE_URL = 'https://agentuity-sdk-objects.t3.storageapi.dev/npm';

interface Manifest {
	version: string;
	packages: string[];
}

interface UpgradeOptions {
	projectDir: string;
	version: string;
	dryRun: boolean;
	skipInstall: boolean;
}

function showHelp() {
	console.log(`
Usage: bun scripts/upgrade-canary.ts [options] [project-dir]

Options:
  --version <canary-version>  Canary version from the SDK PR bot comment (e.g. 2.0.26-2956070). Required.
  --dry-run                   Print changes without writing files or installing
  --skip-install              Update package.json only; do not run bun install
  --help                      Show this help message

Examples:
  bun scripts/upgrade-canary.ts --version 2.0.26-2956070 ../basic-agent

The version string is in the SDK PR canary bot comment: **version:** \`2.0.26-2956070\`
`);
}

function parseArgs(argv: string[]) {
	let projectDir = process.cwd();
	let version = '';
	let dryRun = false;
	let skipInstall = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			showHelp();
			process.exit(0);
		}
		switch (arg) {
			case '--version':
				version = argv[++i] ?? '';
				break;
			case '--dry-run':
				dryRun = true;
				break;
			case '--skip-install':
				skipInstall = true;
				break;
			default:
				if (!arg.startsWith('-')) {
					projectDir = resolve(arg);
				}
				break;
		}
	}

	return { projectDir, version, dryRun, skipInstall };
}

function tarballToPackageName(tarball: string, version: string): string {
	const prefix = 'agentuity-';
	const suffix = `-${version}.tgz`;
	if (!tarball.startsWith(prefix) || !tarball.endsWith(suffix)) {
		throw new Error(`Unexpected tarball name: ${tarball}`);
	}
	return `@agentuity/${tarball.slice(prefix.length, -suffix.length)}`;
}

function buildCanaryMap(version: string, packages: string[]) {
	const baseUrl = `${CANARY_BASE_URL}/${version}`;
	const map = new Map<string, string>();
	for (const tarball of packages) {
		const name = tarballToPackageName(tarball, version);
		map.set(name, `${baseUrl}/${tarball}`);
	}
	return map;
}

async function fetchManifest(version: string): Promise<Manifest> {
	const url = `${CANARY_BASE_URL}/${version}/manifest.json`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch canary manifest (${response.status}): ${url}`);
	}
	return (await response.json()) as Manifest;
}

function collectAgentuityPackageNames(pkgJson: Record<string, unknown>) {
	const names = new Set<string>();
	for (const field of [
		'dependencies',
		'devDependencies',
		'peerDependencies',
		'optionalDependencies',
	]) {
		const section = pkgJson[field];
		if (!section || typeof section !== 'object') {
			continue;
		}
		for (const name of Object.keys(section as Record<string, string>)) {
			if (name.startsWith('@agentuity/')) {
				names.add(name);
			}
		}
	}
	return names;
}

async function upgradeProject(options: UpgradeOptions) {
	const pkgJsonPath = join(options.projectDir, 'package.json');
	const raw = await readFile(pkgJsonPath, 'utf-8');
	const pkgJson = JSON.parse(raw) as Record<string, any>;

	const manifest = await fetchManifest(options.version);
	const canaryMap = buildCanaryMap(manifest.version, manifest.packages);
	const directNames = collectAgentuityPackageNames(pkgJson);

	console.log(`\n📦 Upgrading ${options.projectDir} to canary ${manifest.version}\n`);

	let directUpdated = 0;
	for (const field of ['dependencies', 'devDependencies']) {
		if (!pkgJson[field]) {
			continue;
		}
		for (const name of Object.keys(pkgJson[field])) {
			if (!name.startsWith('@agentuity/')) {
				continue;
			}
			const url = canaryMap.get(name);
			if (!url) {
				throw new Error(`Canary manifest missing package ${name}`);
			}
			pkgJson[field][name] = url;
			directUpdated++;
			console.log(`  ✓ ${field}.${name}`);
		}
	}

	const overrides: Record<string, string> = {};
	for (const [name, url] of canaryMap.entries()) {
		overrides[name] = url;
	}
	pkgJson.overrides = overrides;
	console.log(`  ✓ overrides (${Object.keys(overrides).length} @agentuity packages)`);

	if (options.dryRun) {
		console.log('\n[dry-run] package.json would be updated; skipping write/install');
		return;
	}

	await writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
	console.log(`\n✓ Updated package.json (${directUpdated} direct deps)`);

	if (options.skipInstall) {
		return;
	}

	console.log('\n📥 Running bun install...\n');
	await $`bun install`.cwd(options.projectDir);

	const lockRaw = await readFile(join(options.projectDir, 'bun.lock'), 'utf-8');
	for (const name of directNames) {
		if (!lockRaw.includes(name) || !lockRaw.includes(manifest.version)) {
			console.warn(`  ⚠ verify ${name} in bun.lock`);
		}
	}
	console.log('\n✓ bun install complete');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const version = args.version.trim();
	if (!version) {
		showHelp();
		process.exit(1);
	}

	await upgradeProject({
		projectDir: args.projectDir,
		version,
		dryRun: args.dryRun,
		skipInstall: args.skipInstall,
	});
}

main().catch((error) => {
	console.error(`[upgrade-canary] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
