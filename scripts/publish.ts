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

  GitHub Release:
    - Creates/updates GitHub release with generated release notes
    - Builds and uploads CLI executables for multiple platforms
    - Marks pre-releases appropriately on GitHub

Required Environment Variables:
  GITHUB_TOKEN         GitHub personal access token for release creation
  QUILL_SIGN_P12       Path to P12 certificate file
  QUILL_SIGN_PASSWORD  Password for P12 certificate
  QUILL_NOTARY_KEY     Apple notary API key
  QUILL_NOTARY_KEY_ID  Apple notary key ID
  QUILL_NOTARY_ISSUER  Apple notary issuer ID

Required Tools:
  gh                   GitHub CLI (https://cli.github.com/)
  amp                  Amp CLI for release notes generation
  quill                quill signing and notarization tool (https://github.com/anchore/quill)

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

async function validateEnvironment(isDryRun: boolean) {
	console.log('🔍 Validating environment...\n');

	if (!isDryRun) {
		// Check for GITHUB_TOKEN
		if (!process.env.GITHUB_TOKEN) {
			console.error('❌ Error: GITHUB_TOKEN environment variable not set.');
			console.error('   Required for creating GitHub releases.');
			console.error('   Get a token at: https://github.com/settings/tokens');
			process.exit(1);
		}

		// Check for gh CLI
		try {
			await $`gh --version`.quiet();
		} catch {
			console.error('❌ Error: gh (GitHub CLI) not found.');
			console.error('   Install from: https://cli.github.com/');
			process.exit(1);
		}

		// Check for amp CLI
		try {
			await $`amp --version`.quiet();
		} catch {
			console.error('❌ Error: amp CLI not found.');
			console.error('   Required for generating release notes.');
			process.exit(1);
		}

		// Check for quill CLI
		try {
			await $`quill --version`.quiet();
		} catch {
			console.error('❌ Error: quill not found.');
			console.error('   Install from: https://github.com/anchore/quill');
			process.exit(1);
		}

		// Validate quill environment variables
		const requiredEnvVars = [
			'QUILL_SIGN_P12',
			'QUILL_SIGN_PASSWORD',
			'QUILL_NOTARY_KEY',
			'QUILL_NOTARY_KEY_ID',
			'QUILL_NOTARY_ISSUER',
		];

		const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

		if (missingVars.length > 0) {
			console.error('❌ Error: Required environment variables not set:');
			for (const varName of missingVars) {
				console.error(`   - ${varName}`);
			}
			console.error('\n   These are required for quill signing and notarization.');
			console.error('   See: https://github.com/anchore/quill#configuration');
			process.exit(1);
		}

		if (process.platform !== 'darwin') {
			console.error('❌ Error: macOS code signing required but not running on macOS.');
			console.error('   Must run publish on macOS for signing and notarization.');
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

async function generateReleaseNotes(
	newVersion: string,
	previousTag: string | null
): Promise<string> {
	console.log('\n📝 Generating release notes with Amp...\n');

	// Get git log since previous tag
	let gitLog: string;
	if (previousTag) {
		console.log(`   Comparing v${newVersion} against ${previousTag}...`);
		gitLog = await $`git log ${previousTag}..HEAD --pretty=format:"%h - %s (%an)"`.text();
	} else {
		console.log('   No previous release found, using all commits...');
		gitLog = await $`git log --pretty=format:"%h - %s (%an)"`.text();
	}

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

Formatting Instructions:
- Use bullet points (- item) for each change. Be concise and user-focused. Only include sections that have changes.
- If there are no breaking changes, omit that section entirely.
- Link to the author name and author github url if available.
- Link to Pull Request URLs if relevant such as: [#12](https://github.com/agentuity/sdk/pull/12) [DESCRIPTION]
- IMPORTANT: ONLY return a bulleted list of changes, do not include any other information. Do not include a preamble like "Based on my analysis..."
`;

	try {
		// Invoke amp to generate release notes (pipe prompt via stdin)
		const releaseNotes = await $`echo ${prompt} | amp`.text();

		return releaseNotes.trim();
	} catch (err) {
		console.error('✗ Failed to generate release notes with Amp:', err);
		throw err;
	}
}

async function buildExecutables(version: string, skipSign: boolean) {
	console.log('\n🔨 Building CLI executables...\n');

	const cliDir = join(rootDir, 'packages', 'cli');
	try {
		const args = ['scripts/build-executables.ts', `--version=${version}`];
		if (skipSign) {
			args.push('--skip-sign');
		}
		await $`bun ${args}`.cwd(cliDir);
	} catch (err) {
		console.error('✗ Failed to build executables:', err);
		throw err;
	}
}

async function createOrUpdateGitHubRelease(
	version: string,
	releaseNotes: string,
	isPrerelease: boolean
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

	// Add executable assets (only .gz compressed files)
	const binDir = join(rootDir, 'packages', 'cli', 'dist', 'bin');
	const executables = await readdir(binDir);
	for (const exe of executables) {
		if (exe.endsWith('.gz')) {
			args.push(join(binDir, exe));
		}
	}

	try {
		await $`gh ${args}`.cwd(rootDir);
		console.log(`✓ Created GitHub release ${tag}`);
	} catch (err) {
		console.error(`✗ Failed to create GitHub release:`, err);
		throw err;
	}
}

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		showHelp();
	}

	const isDryRun = process.argv.includes('--dry-run');
	console.log(`🚀 Publishing packages to npm${isDryRun ? ' (DRY RUN)' : ''}\n`);

	// Validate environment early
	await validateEnvironment(isDryRun);

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

		console.log('\n📥 Running bun install...');
		await $`bun install`.cwd(rootDir);

		console.log('\n🧹 Running bun run clean...');
		await $`bun run clean`.cwd(rootDir);

		console.log('\n🔨 Running bun run build...');
		await $`bun run build`.cwd(rootDir);

		// Build executables (skip signing in dry-run)
		await buildExecutables(newVersion, isDryRun);

		// Create GitHub release before npm publish (skip in dry-run)
		if (!isDryRun) {
			await createOrUpdateGitHubRelease(newVersion, releaseNotes, isPreReleaseVersion);
		}

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
