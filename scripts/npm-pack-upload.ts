#!/usr/bin/env bun

import { appendFile, readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const rootDir = join(import.meta.dir, '..');
const packagesDir = join(rootDir, 'packages');
const distDir = join(rootDir, 'dist', 'packs');

interface PackageInfo {
	name: string;
	dir: string;
	path: string;
	tarball?: string;
}

async function readJSON(path: string) {
	const content = await readFile(path, 'utf-8');
	return JSON.parse(content);
}

async function writeJSON(path: string, data: unknown) {
	await writeFile(path, JSON.stringify(data, null, '\t') + '\n');
}

async function getShortSha(): Promise<string> {
	const result = await $`git rev-parse --short=7 HEAD`.text();
	return result.trim();
}

async function getBaseVersion(): Promise<string> {
	const rootPkg = await readJSON(join(rootDir, 'package.json'));
	return rootPkg.version;
}

async function getPackages(): Promise<PackageInfo[]> {
	const packages: PackageInfo[] = [];
	const dirs = await readdir(packagesDir);

	for (const dir of dirs) {
		const pkgPath = join(packagesDir, dir);
		const pkgJsonPath = join(pkgPath, 'package.json');

		try {
			const pkgJson = await readJSON(pkgJsonPath);

			if (pkgJson.private === true) {
				console.log(`  ⊘ Skipping private package: ${dir}`);
				continue;
			}

			if (dir === 'vscode') {
				console.log(`  ⊘ Skipping vscode extension: ${dir}`);
				continue;
			}

			packages.push({
				name: pkgJson.name,
				dir,
				path: pkgPath,
			});
		} catch {
			console.log(`  ⊘ Skipping ${dir} (no package.json)`);
		}
	}

	return packages;
}

async function updatePackageVersions(version: string, packages: PackageInfo[]) {
	console.log(`\n📦 Updating package versions to ${version}...\n`);

	const rootPkgPath = join(rootDir, 'package.json');
	const rootPkg = await readJSON(rootPkgPath);
	rootPkg.version = version;
	await writeJSON(rootPkgPath, rootPkg);
	console.log(`  ✓ Updated root package.json`);

	for (const pkg of packages) {
		const pkgJsonPath = join(pkg.path, 'package.json');
		const pkgJson = await readJSON(pkgJsonPath);

		pkgJson.version = version;

		for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
			if (pkgJson[depType]) {
				for (const [dep, depVersion] of Object.entries(pkgJson[depType])) {
					if (depVersion === 'workspace:*') {
						pkgJson[depType][dep] = version;
					}
				}
			}
		}

		await writeJSON(pkgJsonPath, pkgJson);
		console.log(`  ✓ Updated ${pkg.name}`);
	}
}

async function packPackages(packages: PackageInfo[]): Promise<PackageInfo[]> {
	console.log(`\n📦 Packing packages...\n`);

	await mkdir(distDir, { recursive: true });

	try {
		const files = await readdir(distDir);
		for (const file of files) {
			if (file.endsWith('.tgz') || file === 'manifest.json') {
				await rm(join(distDir, file));
			}
		}
	} catch {
		// Directory might not exist
	}

	const packed: PackageInfo[] = [];

	for (const pkg of packages) {
		console.log(`  Packing ${pkg.name}...`);
		const result = await $`npm pack --pack-destination ${distDir}`.cwd(pkg.path).text();
		const tarball = result.trim().split('\n').pop()!;
		packed.push({ ...pkg, tarball });
		console.log(`  ✓ ${pkg.name} → ${tarball}`);
	}

	return packed;
}

async function createManifest(version: string, packages: PackageInfo[]) {
	const manifest = {
		version,
		packages: packages.map((p) => p.tarball),
	};

	await writeJSON(join(distDir, 'manifest.json'), manifest);
	console.log(`\n✓ Created manifest.json`);
}

async function uploadToS3(version: string, dryRun: boolean) {
	const s3Path = `s3://agentuity-sdk-objects/npm/${version}`;

	const expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	const expires = expiresDate.toISOString();

	console.log(`\n☁️  Uploading to ${s3Path}...\n`);
	console.log(`   Objects will expire: ${expires}\n`);

	if (dryRun) {
		console.log('  [DRY RUN] Would upload:');
		const files = await readdir(distDir);
		for (const file of files) {
			console.log(`    ${file} → ${s3Path}/${file}`);
		}
		return;
	}

	const files = await readdir(distDir);
	for (const file of files) {
		const filePath = join(distDir, file);
		console.log(`  Uploading ${file}...`);
		await $`aws s3 cp ${filePath} ${s3Path}/${file} --expires ${expires} --acl public-read`;
		console.log(`  ✓ Uploaded ${file}`);
	}
}

function printTable(version: string, packages: PackageInfo[]) {
	const baseUrl = `https://agentuity-sdk-objects.t3.storage.dev/npm/${version}`;

	console.log('\n📋 Package Summary:\n');
	console.log('| Package | Version | URL |');
	console.log('| --- | --- | --- |');
	for (const pkg of packages) {
		const url = `${baseUrl}/${pkg.tarball}`;
		console.log(`| \`${pkg.name}\` | \`${version}\` | ${url} |`);
	}
	console.log('');
}

async function writeGitHubOutput(key: string, value: string) {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (outputFile) {
		if (value.includes('\n')) {
			const delimiter = `EOF_${Date.now()}`;
			await appendFile(outputFile, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
		} else {
			await appendFile(outputFile, `${key}=${value}\n`);
		}
	}
}

async function revertChanges() {
	console.log('\n🔄 Reverting version changes...');
	await $`git checkout -- .`.cwd(rootDir);
	console.log('✓ Changes reverted\n');
}

function showHelp() {
	console.log(`
Usage: bun scripts/npm-pack-upload.ts [options]

Options:
  --dry-run       Skip actual S3 upload (default for local testing)
  --upload        Actually upload to S3 (requires AWS credentials)
  --no-revert     Don't revert package.json changes after running
  --no-build      Skip the build step (use if already built)
  --help          Show this help message

Environment:
  CI              When set, automatically uses --upload and --no-revert
  GITHUB_OUTPUT   When set, writes outputs for GitHub Actions

Description:
  Packs SDK packages and uploads to S3 for canary testing.

  This script:
  1. Gets the current git SHA and base version
  2. Creates a prerelease version (e.g., 0.1.6-2d701b1)
  3. Updates all package.json files with the new version
  4. Builds packages (unless --no-build)
  5. Runs npm pack for each publishable package
  6. Uploads to S3 with 7-day expiration
  7. Reverts package.json changes (unless --no-revert or CI)

  In CI mode (GITHUB_OUTPUT set), outputs:
  - prerelease_version: The version string
  - packages_json: JSON array of {name, tarball} objects

Examples:
  bun scripts/npm-pack-upload.ts              # Test locally (dry run)
  bun scripts/npm-pack-upload.ts --upload     # Actually upload to S3
  bun scripts/npm-pack-upload.ts --no-revert  # Keep version changes
`);
	process.exit(0);
}

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		showHelp();
	}

	const isCI = !!process.env.CI;
	const dryRun = isCI ? false : !process.argv.includes('--upload');
	const noRevert = isCI ? true : process.argv.includes('--no-revert');
	const noBuild = process.argv.includes('--no-build');

	console.log('🚀 NPM Pack & Upload Workflow\n');
	console.log(`   Mode: ${dryRun ? 'DRY RUN (use --upload to actually upload)' : 'LIVE UPLOAD'}`);
	console.log(`   Revert: ${noRevert ? 'NO (keeping changes)' : 'YES (will revert after)'}`);
	console.log(`   Build: ${noBuild ? 'SKIP' : 'YES'}`);
	console.log(`   CI: ${isCI ? 'YES' : 'NO'}\n`);

	try {
		const shortSha = await getShortSha();
		const baseVersion = await getBaseVersion();
		const prereleaseVersion = `${baseVersion}-${shortSha}`;

		console.log(`📌 Version Info:`);
		console.log(`   Base version: ${baseVersion}`);
		console.log(`   Short SHA: ${shortSha}`);
		console.log(`   Prerelease version: ${prereleaseVersion}`);

		console.log('\n🔍 Discovering packages...');
		const packages = await getPackages();
		console.log(`\n   Found ${packages.length} publishable packages`);

		await updatePackageVersions(prereleaseVersion, packages);

		if (!noBuild) {
			console.log('\n🔨 Building packages...');
			await $`bun run build`.cwd(rootDir);
			console.log('✓ Build complete');
		}

		const packed = await packPackages(packages);

		await createManifest(prereleaseVersion, packed);

		await uploadToS3(prereleaseVersion, dryRun);

		printTable(prereleaseVersion, packed);

		// Write GitHub Actions outputs
		await writeGitHubOutput('prerelease_version', prereleaseVersion);
		await writeGitHubOutput(
			'packages_json',
			JSON.stringify(packed.map((p) => ({ name: p.name, tarball: p.tarball })))
		);

		console.log('✅ Workflow completed successfully!\n');

		if (!noRevert) {
			await revertChanges();
		}
	} catch (err) {
		console.error('\n❌ Workflow failed:', err);
		if (!noRevert) {
			await revertChanges();
		}
		process.exit(1);
	}
}

main();
