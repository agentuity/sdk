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
  --version=X.Y.Z  Force a specific version instead of interactive prompt
  --tag=TAG        Override the npm dist-tag (e.g. alpha, next, beta, latest)
  --yes, -y        Skip all confirmation prompts and OTP (use with automation token)
  --dry-run        Run the publish process without actually publishing to npm.
                   Version changes will be automatically reverted after completion.
  --help           Show this help message

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

    Beta:       1.0.0 -> 2.0.0-beta.0 (first beta of next major)
                2.0.0-beta.0 -> 2.0.0-beta.1 (increment beta)

  npm dist-tags:
    - Stable releases (patch/minor/major) are published with tag "latest"
    - Prereleases are published with tag "next"
    - Beta prereleases are published with tag "beta"

  GitHub Release:
    - Creates/updates GitHub release with generated release notes
    - Builds and uploads VS Code extension (.vsix) for manual installation
    - Marks pre-releases appropriately on GitHub

Required Tools:
  gh                   GitHub CLI (https://cli.github.com/)
  amp                  Amp CLI for release notes generation

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
		// Handle named prereleases like beta.0, alpha.3
		const namedMatch = prerelease.match(/^([a-z]+)\.(\d+)$/);
		if (namedMatch) {
			return `${base}-${namedMatch[1]}.${Number(namedMatch[2]) + 1}`;
		}
		return `${base}-${Number(prerelease) + 1}`;
	}
	const nextPatch = bumpPatch(version);
	return `${nextPatch}-0`;
}

function bumpBeta(version: string): string {
	// If already a beta, increment: 2.0.0-beta.0 → 2.0.0-beta.1
	const betaMatch = version.match(/^(.+)-beta\.(\d+)$/);
	if (betaMatch) {
		return `${betaMatch[1]}-beta.${Number(betaMatch[2]) + 1}`;
	}
	// Otherwise, create beta of next major: 1.x.x → 2.0.0-beta.0
	const nextMajor = bumpMajor(version);
	return `${nextMajor}-beta.0`;
}

async function promptReleaseType(
	currentVersion: string
): Promise<'patch' | 'minor' | 'major' | 'prerelease' | 'beta'> {
	console.log(`\nCurrent version: ${currentVersion}`);
	console.log('Options:');
	console.log('  [1] prerelease - Create/increment prerelease version (default)');
	console.log('  [2] patch - Patch release (0.0.x)');
	console.log('  [3] minor - Minor release (0.x.0)');
	console.log('  [4] major - Major release (x.0.0)');
	console.log('  [5] beta - Create/increment beta prerelease (x.0.0-beta.N)');

	while (true) {
		const input = await readLine('Choose release type (1/2/3/4/5) [1]: ');
		if (!input || input === '1') return 'prerelease';
		if (input === '2') return 'patch';
		if (input === '3') return 'minor';
		if (input === '4') return 'major';
		if (input === '5') return 'beta';
		console.log('Invalid choice. Please enter 1, 2, 3, 4, or 5.');
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

	// Update .claude-plugin/marketplace.json
	const marketplacePath = join(rootDir, '.claude-plugin', 'marketplace.json');
	try {
		const marketplace = await readJSON(marketplacePath);
		if (marketplace.metadata) {
			marketplace.metadata.version = version;
		}
		if (marketplace.plugins) {
			for (const plugin of marketplace.plugins) {
				plugin.version = version;
			}
		}
		await writeJSON(marketplacePath, marketplace);
		console.log(`✓ Updated .claude-plugin/marketplace.json to ${version}`);
	} catch {
		console.log(`⊘ Skipped .claude-plugin/marketplace.json (not found)`);
	}

	// Update packages/claude-code/.claude-plugin/plugin.json
	const pluginJsonPath = join(packagesDir, 'claude-code', '.claude-plugin', 'plugin.json');
	try {
		const pluginJson = await readJSON(pluginJsonPath);
		pluginJson.version = version;
		await writeJSON(pluginJsonPath, pluginJson);
		console.log(`✓ Updated packages/claude-code/.claude-plugin/plugin.json to ${version}`);
	} catch {
		console.log(`⊘ Skipped packages/claude-code/.claude-plugin/plugin.json (not found)`);
	}

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
	await $`git checkout -- package.json packages/*/package.json apps/*/package.json .claude-plugin/marketplace.json packages/claude-code/.claude-plugin/plugin.json bun.lock`.cwd(
		rootDir
	);
}

async function validateEnvironment(isDryRun: boolean) {
	console.log('🔍 Validating environment...\n');

	// Always check npm authentication (tokens expire frequently)
	try {
		const user = (await $`npm whoami`.text()).trim();
		console.log(`✓ Logged into npm as: ${user}`);
	} catch {
		console.error('❌ Error: Not logged into npm registry.');
		console.error('   Run: npm login');
		rl.close();
		process.exit(1);
	}

	if (!isDryRun) {
		// Check for gh CLI
		try {
			await $`gh --version`.quiet();
		} catch {
			console.error('❌ Error: gh (GitHub CLI) not found.');
			console.error('   Install from: https://cli.github.com/');
			process.exit(1);
		}

		// Check for opencode CLI
		try {
			await $`opencode --version`.quiet();
		} catch {
			console.error('❌ Error: opencode CLI not found.');
			console.error('   Required for generating release notes.');
			process.exit(1);
		}
	}

	console.log('✓ Environment validation passed\n');
}

async function getPreviousReleaseTag(): Promise<string | null> {
	try {
		const result = await $`git describe --tags --abbrev=0 --match="v*" HEAD^`.text();
		return result.trim();
	} catch {
		// No previous tag found
		return null;
	}
}

// Known contributor mapping: display name → GitHub profile URL
// This is used to correctly attribute commits in release notes
// instead of allowing the LLM to hallucinate profile URLs.
const CONTRIBUTORS: Record<string, string> = {
	'Jeff Haynie': 'https://github.com/jhaynie',
	'Rick Blalock': 'https://github.com/rblalock',
	'Bobby Christopher': 'https://github.com/potofpie',
	'Matt Congrove': 'https://github.com/mcongrove',
	'Robin Diddams': 'https://github.com/robindiddams',
	'Pedro Enrique': 'https://github.com/pec1985',
	'Gabriel Rodrigues Campos': 'https://github.com/Huijiro',
	'Parteek Singh': 'https://github.com/parteeksingh24',
	'Jason Walkow': 'https://github.com/jsw324',
	'Nicholas Mirigliani': 'https://github.com/NobbyBop',
	'Joel Samuel': 'https://github.com/joel13samuel',
	'Dhilan Fye': 'https://github.com/dhilanfye34',
};

async function generateReleaseNotes(
	newVersion: string,
	previousTag: string | null
): Promise<string> {
	console.log('\n📝 Generating release notes with Opencode...\n');

	// Get git log since previous tag
	let gitLog: string;
	if (previousTag) {
		console.log(`   Comparing v${newVersion} against ${previousTag}...`);
		gitLog = await $`git log ${previousTag}..HEAD --pretty=format:"%h - %s (%an)"`.text();
	} else {
		console.log('   No previous release found, using all commits...');
		gitLog = await $`git log --pretty=format:"%h - %s (%an)"`.text();
	}

	// Build the contributor mapping section for the prompt
	const contributorLines = Object.entries(CONTRIBUTORS)
		.map(([name, url]) => `- ${name}: ${url}`)
		.join('\n');

	const prompt = `Please analyze the following git commits and create structured release notes for version ${newVersion}.

Git commits since ${previousTag || 'initial commit'}:
${gitLog}

Generate release notes in Markdown format with the following sections:
- **New Features** - New functionality or major additions
- **Breaking Changes** - Changes that break backwards compatibility
- **Improvements** - Enhancements to existing features
- **Bug Fixes** - Fixed issues
- **Documentation** - Documentation updates
- **Internal** - Internal changes (refactoring, tests, tooling)

General Instructions:
- Do NOT make general statements about "improvements", be very specific about what was changed.
- Do NOT include any information about code changes if they do not affect the user facing changes.
- For commits that are already well-written and descriptive, avoid rewording them. Simply capitalize the first letter, fix any misspellings, and ensure proper English grammar.
- DO NOT read any other commits than the ones listed above (THIS IS IMPORTANT TO AVOID DUPLICATING THINGS IN OUR CHANGELOG)
- If a commit was made and then reverted do not include it in the changelog. If the commits only include a revert but not the original commit, then include the revert in the changelog.

Contributor GitHub Profiles (USE ONLY THESE — do NOT guess or fabricate any GitHub URLs):
${contributorLines}

Formatting Instructions:
- Use bullet points (- item) for each change. Be concise and user-focused. Only include sections that have changes.
- If there are no breaking changes, omit that section entirely.
- When attributing a commit to an author, link their name to their GitHub profile URL using ONLY the mapping above. For example: [Jeff Haynie](https://github.com/jhaynie). If an author is not in the mapping above, use their plain name WITHOUT any URL — do NOT invent a GitHub URL.
- Link to Pull Request URLs if relevant such as: [#12](https://github.com/agentuity/sdk/pull/12) [DESCRIPTION]
- IMPORTANT: ONLY return a bulleted list of changes, do not include any other information. Do not include a preamble like "Based on my analysis..."
`;

	try {
		// Invoke opencode to generate release notes (pipe prompt via stdin)
		const releaseNotes = await $`echo ${prompt} | opencode run`.text();

		return releaseNotes.trim();
	} catch (err) {
		console.error('✗ Failed to generate release notes with OpenCode:', err);
		throw err;
	}
}

async function isVersionPublished(pkgName: string, version: string): Promise<boolean> {
	try {
		const result = await $`npm view ${pkgName}@${version} version`.quiet().text();
		return result.trim() === version;
	} catch {
		// Package or version doesn't exist
		return false;
	}
}

async function buildVSCodeExtension(version: string): Promise<string> {
	console.log('\n🧩 Building VS Code extension...\n');

	const vscodeDir = join(rootDir, 'packages', 'vscode');
	try {
		await $`bun run build`.cwd(vscodeDir);
		await $`bun run package`.cwd(vscodeDir);

		const vsixPath = join(vscodeDir, `agentuity-vscode-${version}.vsix`);
		console.log(`✓ Built VS Code extension: agentuity-vscode-${version}.vsix`);
		return vsixPath;
	} catch (err) {
		console.error('✗ Failed to build VS Code extension:', err);
		throw err;
	}
}

async function createOrUpdateGitHubRelease(
	version: string,
	releaseNotes: string,
	isPrerelease: boolean,
	vsixPath?: string
) {
	const tag = `v${version}`;
	console.log(`\n🏷️  Creating GitHub release ${tag}...\n`);

	// Check if release already exists
	try {
		await $`gh release view ${tag}`.quiet();
		console.log(`   Release ${tag} already exists, deleting and recreating...`);
		await $`gh release delete ${tag} --yes`.cwd(rootDir);
	} catch {
		// Release doesn't exist, continue
	}

	// Create the release
	const args = [
		'release',
		'create',
		tag,
		'--title',
		`Release ${version}`,
		'--notes',
		releaseNotes,
	];
	if (isPrerelease) {
		args.push('--prerelease');
	}

	// First create the release without assets
	try {
		console.log('   Creating release...');
		await $`gh ${args}`.cwd(rootDir);
		console.log(`✓ Created GitHub release ${tag}`);
	} catch (err) {
		console.error(`✗ Failed to create GitHub release:`, err);
		throw err;
	}

	// Upload VS Code extension if provided
	if (vsixPath) {
		const assetName = vsixPath.split('/').pop();
		console.log(`   Uploading ${assetName}...`);
		try {
			await $`gh release upload ${tag} ${vsixPath} --clobber`.cwd(rootDir);
			console.log(`   ✓ Uploaded ${assetName}`);
		} catch (err) {
			console.error(`✗ Failed to upload ${assetName}:`, err);
			throw err;
		}
	}
}

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		showHelp();
	}

	const skipPrompts = process.argv.includes('--yes') || process.argv.includes('-y');
	const isDryRun = process.argv.includes('--dry-run');

	// Parse --version flag (supports both --version=X.Y.Z and --version X.Y.Z)
	let forcedVersion: string | null = null;
	const versionEqArg = process.argv.find((arg) => arg.startsWith('--version='));
	if (versionEqArg) {
		forcedVersion = versionEqArg.split('=')[1];
	} else {
		const versionIndex = process.argv.indexOf('--version');
		if (versionIndex !== -1 && process.argv[versionIndex + 1]) {
			forcedVersion = process.argv[versionIndex + 1];
		}
	}

	console.log(`🚀 Publishing packages to npm${isDryRun ? ' (DRY RUN)' : ''}\n`);

	// Validate environment early
	await validateEnvironment(isDryRun);

	const rootPkg = await readJSON(join(rootDir, 'package.json'));
	const currentVersion = rootPkg.version;

	let newVersion: string;

	if (forcedVersion) {
		// Validate version format (basic semver check)
		if (!/^\d+\.\d+\.\d+(-(\d+|[a-z]+\.\d+))?$/.test(forcedVersion)) {
			console.error(`\n❌ Invalid version format: ${forcedVersion}`);
			console.error('   Expected format: X.Y.Z, X.Y.Z-N, or X.Y.Z-beta.N\n');
			rl.close();
			process.exit(1);
		}
		newVersion = forcedVersion;
		console.log(`\nUsing forced version: ${newVersion}`);
	} else {
		const releaseType = await promptReleaseType(currentVersion);

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
			case 'beta':
				newVersion = bumpBeta(currentVersion);
				break;
		}
	}

	// Parse --tag flag (supports both --tag=TAG and --tag TAG)
	let forcedTag: string | null = null;
	const tagEqArg = process.argv.find((arg) => arg.startsWith('--tag='));
	if (tagEqArg) {
		forcedTag = tagEqArg.split('=')[1];
	} else {
		const tagIndex = process.argv.indexOf('--tag');
		if (tagIndex !== -1 && process.argv[tagIndex + 1]) {
			forcedTag = process.argv[tagIndex + 1];
		}
	}

	const isPreReleaseVersion = isPrerelease(newVersion);
	const distTag =
		forcedTag ??
		(isPreReleaseVersion
			? newVersion.includes('-beta.')
				? 'beta'
				: newVersion.includes('-alpha.')
					? 'alpha'
					: 'next'
			: 'latest');

	const confirmed = skipPrompts || (await confirmVersion(newVersion));
	if (!confirmed) {
		console.log('\n❌ Publish cancelled\n');
		rl.close();
		process.exit(0);
	}

	// Prompt for npm OTP code upfront (skip for dry runs or --yes)
	let otp: string | null = null;
	if (!isDryRun && !skipPrompts) {
		const input = await readLine(
			'\n🔑 Enter npm OTP code (leave empty if using automation token): '
		);
		if (input) otp = input;
	}

	console.log(`\n📦 Setting version to: ${newVersion}`);
	console.log(`📌 npm dist-tag: ${distTag}\n`);

	try {
		await updateVersions(newVersion);

		// Generate release notes (skip in dry-run)
		let releaseNotes = '';
		if (!isDryRun) {
			const previousTag = await getPreviousReleaseTag();
			releaseNotes = await generateReleaseNotes(newVersion, previousTag);
			console.log('\n📋 Generated release notes:\n');
			console.log('─'.repeat(80));
			console.log(releaseNotes);
			console.log('─'.repeat(80));
		}

		console.log('\n🗑️  Deleting bun.lock...');
		await $`rm -f bun.lock`.cwd(rootDir);

		console.log('\n📥 Running bun install...');
		await $`bun install`.cwd(rootDir);

		console.log('\n🧹 Running bun run clean...');
		await $`bun run clean`.cwd(rootDir);

		console.log('\n🔨 Running bun run build...');
		await $`bun run build`.cwd(rootDir);

		// Build VS Code extension
		const vsixPath = await buildVSCodeExtension(newVersion);

		// Create GitHub release before npm publish (skip in dry-run)
		if (!isDryRun) {
			await createOrUpdateGitHubRelease(newVersion, releaseNotes, isPreReleaseVersion, vsixPath);
		}

		const publishable = await getPublishablePackages();
		const names = publishable.map((p) => `${p.dir}/${p.name}`).join(', ');
		console.log(`\n📤 Publishing ${publishable.length} packages in order: ${names}\n`);

		for (const pkg of publishable) {
			const pkgJson = await readJSON(join(pkg.path, 'package.json'));
			const pkgName = pkgJson.name;
			console.log(`\n📦 Publishing ${pkgName}...`);

			// Check if version is already published
			if (await isVersionPublished(pkgName, newVersion)) {
				console.log(`⊘ Skipped ${pkgName}@${newVersion} (already published)`);
				continue;
			}

			const maxRetries = 3;
			let lastErr: unknown;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					// Use npm publish instead of bun publish:
					// 1. --ignore-scripts skips prepublishOnly which would rebuild and
					//    fail resolving workspace deps pinned to the new version
					// 2. bun publish validates all deps exist on the registry, which
					//    fails for private workspace packages like @agentuity/test-utils
					const args = ['publish', '--access', 'public', '--tag', distTag, '--ignore-scripts'];
					if (otp) args.push(`--otp=${otp}`);
					if (isDryRun) args.push('--dry-run');
					await $`npm ${args}`.cwd(pkg.path);
					console.log(`✓ ${isDryRun ? 'Dry run completed for' : 'Published'} ${pkgName}`);
					lastErr = undefined;
					break;
				} catch (err) {
					lastErr = err;
					const shellErr = err as { stderr?: string; stdout?: string };
					const errStr = `${shellErr.stderr || ''} ${shellErr.stdout || ''} ${String(err)}`;
					const isTransient = errStr.includes('404') || errStr.includes('Not Found');
					if (isTransient && attempt < maxRetries) {
						const delay = attempt * 5;
						console.log(
							`   ⚠ Transient error, retrying in ${delay}s (attempt ${attempt}/${maxRetries})...`
						);
						await new Promise((r) => setTimeout(r, delay * 1000));
					} else {
						break;
					}
				}
			}
			if (lastErr) {
				console.error(`✗ Failed to publish ${pkgName}:`, lastErr);
				throw lastErr;
			}
		}

		console.log('\n✨ All packages published successfully!\n');

		if (!isDryRun) {
			await restoreWorkspaceDependencies(newVersion);

			console.log('\n🗑️  Deleting bun.lock...');
			await $`rm -f bun.lock`.cwd(rootDir);

			console.log('\n📥 Running bun install to pick up new versions...');
			await $`bun install`.cwd(rootDir);
		}
	} catch (err) {
		console.error('\n❌ Publish failed:', err);
		console.log('\n🔄 Reverting version changes...');
		await revertVersionChanges();
		console.log('✓ Changes reverted\n');
		throw err;
	} finally {
		if (isDryRun) {
			console.log('\n🔄 Reverting version changes (dry-run)...');
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
