#!/usr/bin/env bun

import { $, file } from 'bun';
import { join } from 'node:path';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const rootDir = join(import.meta.dir, '..');
const binDir = join(rootDir, 'dist', 'bin');
const entryPoint = join(rootDir, 'bin', 'cli.ts');
const entitlementsPath = join(import.meta.dir, 'entitlements.plist');

interface Platform {
	target: string;
	output: string;
	needsSign: boolean;
}

const PLATFORMS: Platform[] = [
	{ target: 'bun-linux-arm64', output: 'agentuity-linux-arm64', needsSign: false },
	{ target: 'bun-linux-x64', output: 'agentuity-linux-x64', needsSign: false },
	{ target: 'bun-darwin-arm64', output: 'agentuity-darwin-arm64', needsSign: true },
	{ target: 'bun-darwin-x64', output: 'agentuity-darwin-x64', needsSign: true },
];

function parseArgs() {
	const platforms: string[] = [];
	let skipSign = false;
	let version: string | null = null;

	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith('--platform=')) {
			platforms.push(arg.slice('--platform='.length));
		} else if (arg === '--skip-sign') {
			skipSign = true;
		} else if (arg.startsWith('--version=')) {
			version = arg.slice('--version='.length);
		} else if (arg === '--help' || arg === '-h') {
			console.log(`
Usage: bun scripts/build-executables.ts [options]

Options:
  --platform=<name>    Build for specific platform (can specify multiple times)
                       Available: linux-arm64, linux-x64, darwin-arm64, darwin-x64
  --version=<version>  Set version for AGENTUITY_CLI_VERSION define (defaults to package.json)
  --skip-sign          Skip code signing (for testing only - DO NOT USE FOR RELEASES)
  --help, -h           Show this help message

Examples:
  bun scripts/build-executables.ts                          # Build all platforms
  bun scripts/build-executables.ts --platform=linux-arm64   # Build single platform
  bun scripts/build-executables.ts --skip-sign              # Build without signing (testing)

Required Tools:
  quill                quill signing and notarization tool (https://github.com/anchore/quill)

Environment Variables (required for signing and notarization):
  QUILL_SIGN_P12       Path to P12 certificate file
  QUILL_SIGN_PASSWORD  Password for P12 certificate
  QUILL_NOTARY_KEY     Apple notary API key
  QUILL_NOTARY_KEY_ID  Apple notary key ID
  QUILL_NOTARY_ISSUER  Apple notary issuer ID

Note: Linux binaries are glibc-based. Alpine Linux users need gcompat installed.
`);
			process.exit(0);
		}
	}

	return { platforms, skipSign, version };
}

async function validateEnvironment(needsSigning: boolean, skipSign: boolean) {
	if (needsSigning && !skipSign) {
		// Check if quill is installed
		try {
			await $`which quill`.quiet();
		} catch {
			console.error('❌ Error: quill not found.');
			console.error('   Install from: https://github.com/anchore/quill');
			process.exit(1);
		}

		// Validate required environment variables
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
			console.error('   Either run on macOS or use --skip-sign for testing.');
			process.exit(1);
		}
	}
}

async function cleanBinDir() {
	console.log('🧹 Cleaning bin directory...');
	try {
		await rm(binDir, { recursive: true, force: true });
	} catch {
		// Directory might not exist
	}
	await mkdir(binDir, { recursive: true });
}

async function buildExecutable(platform: Platform, version: string) {
	const outputPath = join(binDir, platform.output);
	console.log(`\n📦 Building ${platform.output} (version ${version})...`);

	try {
		await $`bun build ${entryPoint} --compile --production --minify --sourcemap --compile-autoload-tsconfig --compile-autoload-package-json --target=${platform.target} --outfile=${outputPath} --define AGENTUITY_CLI_VERSION='"${version}"'`.cwd(
			rootDir
		);
		console.log(`✓ Built ${platform.output}`);
		return outputPath;
	} catch (err) {
		console.error(`✗ Failed to build ${platform.output}:`, err);
		throw err;
	}
}

async function signAndNotarizeExecutable(executablePath: string, name: string) {
	console.log(`🔐 Signing and notarizing ${name}...`);

	try {
		// Use quill to sign and notarize with JIT entitlements for Bun
		await $`quill sign-and-notarize ${executablePath} --entitlements ${entitlementsPath}`;

		console.log(`✓ Signed and notarized ${name}`);
	} catch (err) {
		console.error(`✗ Failed to sign and notarize ${name}:`, err);
		throw err;
	}
}

async function compressExecutable(executablePath: string, name: string) {
	console.log(`📦 Compressing ${name}...`);

	const gzPath = `${executablePath}.gz`;

	try {
		const source = createReadStream(executablePath);
		const destination = createWriteStream(gzPath);
		const gzip = createGzip({ level: 9 }); // Maximum compression

		await pipeline(source, gzip, destination);

		const originalSize = (await file(executablePath).stat()).size;
		const compressedSize = (await file(gzPath).stat()).size;
		const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);

		console.log(`✓ Compressed ${name} (${savings}% smaller)`);
		return gzPath;
	} catch (err) {
		console.error(`✗ Failed to compress ${name}:`, err);
		throw err;
	}
}

async function main() {
	const { platforms: requestedPlatforms, skipSign, version: cliVersion } = parseArgs();

	// Get version from CLI arg or package.json
	let version = cliVersion;
	if (!version) {
		const pkgJsonPath = join(rootDir, 'package.json');
		const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
		version = pkgJson.version;
	}

	console.log(`📋 Version: ${version}`);

	// Filter platforms if specific ones requested
	let platformsToBuild = PLATFORMS;

	if (requestedPlatforms.length > 0) {
		platformsToBuild = platformsToBuild.filter((p) => {
			const shortName = p.output.replace('agentuity-', '');
			return requestedPlatforms.includes(shortName);
		});

		if (platformsToBuild.length === 0) {
			console.error('❌ Error: No valid platforms specified.');
			console.error('   Available: linux-arm64, linux-x64, darwin-arm64, darwin-x64');
			process.exit(1);
		}
	}

	// Check if any platform needs signing
	const needsSigning = platformsToBuild.some((p) => p.needsSign);

	if (skipSign && needsSigning) {
		console.log('⚠️  WARNING: --skip-sign is enabled. DO NOT USE FOR PRODUCTION RELEASES.');
	}

	await validateEnvironment(needsSigning, skipSign);
	await cleanBinDir();

	console.log(`\n🚀 Building ${platformsToBuild.length} executable(s)...\n`);

	const builtExecutables: { path: string; platform: Platform }[] = [];

	for (const platform of platformsToBuild) {
		const execPath = await buildExecutable(platform, version!);
		builtExecutables.push({ path: execPath, platform });
	}

	// Sign and notarize macOS executables
	if (!skipSign) {
		const macExecutables = builtExecutables.filter((e) => e.platform.needsSign);
		if (macExecutables.length > 0) {
			console.log('\n🔐 Signing and notarizing macOS executables...\n');
			for (const { path, platform } of macExecutables) {
				await signAndNotarizeExecutable(path, platform.output);
			}
		}
	}

	// Compress all executables
	console.log('\n📦 Compressing executables...\n');
	const compressedFiles: { path: string; platform: Platform }[] = [];
	for (const { path, platform } of builtExecutables) {
		const compressedPath = await compressExecutable(path, platform.output);
		compressedFiles.push({ path: compressedPath, platform });
	}

	console.log('\n✨ Build complete!\n');
	console.log('Built executables:');
	for (const { path, platform } of compressedFiles) {
		const fileInfo = await file(path).stat();
		const sizeMB = (fileInfo.size / 1024 / 1024).toFixed(2);
		console.log(`  ${platform.output}.gz (${sizeMB} MB)`);
	}
	console.log(`\nOutput directory: ${binDir}`);
}

main().catch((err) => {
	console.error('Error:', err);
	process.exit(1);
});
