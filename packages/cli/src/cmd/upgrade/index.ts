import { createCommand } from '../../types';
import { getVersion, getCompareUrl, getReleaseUrl, toTag } from '../../version';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';
import { ErrorCode, createError, exitWithError } from '../../errors';
import * as tui from '../../tui';
import { downloadWithProgress } from '../../download';
import { $ } from 'bun';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const UpgradeOptionsSchema = z.object({
	force: z.boolean().optional().describe('Force upgrade even if version is the same'),
});

const UpgradeResponseSchema = z.object({
	upgraded: z.boolean().describe('Whether an upgrade was performed'),
	from: z.string().describe('Version before upgrade'),
	to: z.string().describe('Version after upgrade'),
	message: z.string().describe('Status message'),
});

/**
 * Check if running from a compiled executable (not via bun/bunx)
 * @internal Exported for testing
 */
export function isRunningFromExecutable(): boolean {
	const scriptPath = process.argv[1] || '';

	// Check if running from compiled binary (uses Bun's virtual filesystem)
	// When compiled with `bun build --compile`, the path is in the virtual /$bunfs/root/ directory
	const isCompiledBinary = process.argv[0] === 'bun' && scriptPath.startsWith('/$bunfs/root/');

	if (isCompiledBinary) {
		return true;
	}

	// If running via bun/bunx (from node_modules or .ts files), it's not an executable
	if (Bun.main.includes('/node_modules/') || Bun.main.includes('.ts')) {
		return false;
	}

	// Check if in a bin directory but not in node_modules (globally installed)
	const normalized = Bun.main;
	const isGlobal =
		normalized.includes('/bin/') &&
		!normalized.includes('/node_modules/') &&
		!normalized.includes('/packages/cli/bin');

	return isGlobal;
}

/**
 * Get the OS and architecture for downloading the binary
 * @internal Exported for testing
 */
export function getPlatformInfo(): { os: string; arch: string } {
	const platform = process.platform;
	const arch = process.arch;

	let os: string;
	let archStr: string;

	switch (platform) {
		case 'darwin':
			os = 'darwin';
			break;
		case 'linux':
			os = 'linux';
			break;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

	switch (arch) {
		case 'x64':
			archStr = 'x64';
			break;
		case 'arm64':
			archStr = 'arm64';
			break;
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}

	return { os, arch: archStr };
}

/**
 * Fetch the latest version from the API
 * @internal Exported for testing
 */
export async function fetchLatestVersion(): Promise<string> {
	const response = await fetch('https://agentuity.sh/release/sdk/version', {
		signal: AbortSignal.timeout(10000), // 10 second timeout
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch version: ${response.statusText}`);
	}

	const version = await response.text();
	const trimmedVersion = version.trim();

	// Validate version format
	if (
		!/^v?[0-9]+\.[0-9]+\.[0-9]+/.test(trimmedVersion) ||
		trimmedVersion.includes('message') ||
		trimmedVersion.includes('error') ||
		trimmedVersion.includes('<html>')
	) {
		throw new Error(`Invalid version format received: ${trimmedVersion}`);
	}

	// Ensure version has 'v' prefix
	return trimmedVersion.startsWith('v') ? trimmedVersion : `v${trimmedVersion}`;
}

/**
 * Download the binary for the specified version
 */
async function downloadBinary(
	version: string,
	platform: { os: string; arch: string }
): Promise<string> {
	const { os, arch } = platform;
	const url = `https://agentuity.sh/release/sdk/${version}/${os}/${arch}`;

	const tmpDir = tmpdir();
	const tmpFile = join(tmpDir, `agentuity-${randomUUID()}`);
	const gzFile = `${tmpFile}.gz`;

	const stream = await downloadWithProgress({
		url,
		message: `Downloading version ${version}...`,
	});

	// Write to temp file
	const writer = Bun.file(gzFile).writer();
	for await (const chunk of stream) {
		writer.write(chunk);
	}
	await writer.end();

	// Verify file was downloaded
	if (!(await Bun.file(gzFile).exists())) {
		throw new Error('Download failed - file not created');
	}

	// Decompress using gunzip
	try {
		await $`gunzip ${gzFile}`.quiet();
	} catch (error) {
		if (await Bun.file(gzFile).exists()) {
			await $`rm ${gzFile}`.quiet();
		}
		throw new Error(
			`Decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	// Verify decompressed file exists
	if (!(await Bun.file(tmpFile).exists())) {
		throw new Error('Decompression failed - file not found');
	}

	// Verify it's a valid binary
	const fileType = await $`file ${tmpFile}`.text();
	if (!fileType.match(/(executable|ELF|Mach-O|PE32)/i)) {
		throw new Error('Downloaded file is not a valid executable');
	}

	// Make executable
	await $`chmod 755 ${tmpFile}`.quiet();

	return tmpFile;
}

/**
 * Validate the downloaded binary by running version command
 */
async function validateBinary(binaryPath: string, expectedVersion: string): Promise<void> {
	try {
		const result = await $`${binaryPath} version`.text();
		const actualVersion = result.trim();

		// Normalize versions for comparison (remove 'v' prefix)
		const normalizedExpected = expectedVersion.replace(/^v/, '');
		const normalizedActual = actualVersion.replace(/^v/, '');

		if (normalizedActual !== normalizedExpected) {
			throw new Error(`Version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Binary validation failed: ${error.message}`);
		}
		throw new Error('Binary validation failed');
	}
}

/**
 * Replace the current binary with the new one
 * Uses platform-specific safe replacement strategies
 */
async function replaceBinary(newBinaryPath: string, currentBinaryPath: string): Promise<void> {
	const platform = process.platform;

	if (platform === 'darwin' || platform === 'linux') {
		// Unix: Use atomic move via temp file
		const backupPath = `${currentBinaryPath}.backup`;
		const tempPath = `${currentBinaryPath}.new`;

		try {
			// Copy new binary to temp location next to current binary
			await $`cp ${newBinaryPath} ${tempPath}`.quiet();
			await $`chmod 755 ${tempPath}`.quiet();

			// Backup current binary
			if (await Bun.file(currentBinaryPath).exists()) {
				await $`cp ${currentBinaryPath} ${backupPath}`.quiet();
			}

			// Atomic rename
			await $`mv ${tempPath} ${currentBinaryPath}`.quiet();

			// Clean up backup after successful replacement
			if (await Bun.file(backupPath).exists()) {
				await $`rm ${backupPath}`.quiet();
			}
		} catch (error) {
			// Try to restore backup if replacement failed
			if (await Bun.file(backupPath).exists()) {
				await $`mv ${backupPath} ${currentBinaryPath}`.quiet();
			}
			// Clean up temp file if it exists
			if (await Bun.file(tempPath).exists()) {
				await $`rm ${tempPath}`.quiet();
			}
			throw error;
		}
	} else {
		throw new Error(`Unsupported platform for binary replacement: ${platform}`);
	}
}

export const command = createCommand({
	name: 'upgrade',
	description: 'Upgrade the CLI to the latest version',
	executable: true,
	skipUpgradeCheck: true,
	tags: ['update'],
	examples: [
		{
			command: getCommand('upgrade'),
			description: 'Check for updates and prompt to upgrade',
		},
		{
			command: getCommand('upgrade --force'),
			description: 'Force upgrade even if already on latest version',
		},
	],
	schema: {
		options: UpgradeOptionsSchema,
		response: UpgradeResponseSchema,
	},

	async handler(ctx) {
		const { logger, options } = ctx;
		const { force } = ctx.opts;

		const currentVersion = getVersion();
		// Use process.execPath to get the actual file path (Bun.main is virtual for compiled binaries)
		const currentBinaryPath = process.execPath;

		try {
			// Fetch latest version
			const latestVersion = await tui.spinner({
				message: 'Checking for updates...',
				clearOnSuccess: true,
				callback: async () => await fetchLatestVersion(),
			});

			// Compare versions
			const normalizedCurrent = currentVersion.replace(/^v/, '');
			const normalizedLatest = latestVersion.replace(/^v/, '');

			if (normalizedCurrent === normalizedLatest && !force) {
				const message = `Already on latest version ${currentVersion}`;
				tui.success(message);
				return {
					upgraded: false,
					from: currentVersion,
					to: latestVersion,
					message,
				};
			}

			// Confirm upgrade
			if (!force) {
				tui.info(`Current version: ${tui.muted(currentVersion)}`);
				tui.info(`Latest version:  ${tui.bold(latestVersion)}`);
				tui.newline();
				if (toTag(currentVersion) !== toTag(latestVersion)) {
					tui.warning(
						`What's changed:  ${tui.link(getCompareUrl(currentVersion, latestVersion))}`
					);
				}
				tui.success(`Release notes:   ${tui.link(getReleaseUrl(latestVersion))}`);
				tui.newline();

				const shouldUpgrade = await tui.confirm('Do you want to upgrade?', true);

				if (!shouldUpgrade) {
					const message = 'Upgrade cancelled';
					tui.info(message);
					return {
						upgraded: false,
						from: currentVersion,
						to: latestVersion,
						message,
					};
				}
			}

			// Get platform info
			const platform = getPlatformInfo();

			// Download binary
			const tmpBinaryPath = await tui.spinner({
				type: 'progress',
				message: 'Downloading...',
				callback: async () => await downloadBinary(latestVersion, platform),
			});

			// Validate binary
			await tui.spinner({
				message: 'Validating binary...',
				callback: async () => await validateBinary(tmpBinaryPath, latestVersion),
			});

			// Replace binary
			await tui.spinner({
				message: 'Installing...',
				callback: async () => await replaceBinary(tmpBinaryPath, currentBinaryPath),
			});

			// Clean up temp file
			if (await Bun.file(tmpBinaryPath).exists()) {
				await $`rm ${tmpBinaryPath}`.quiet();
			}

			const message = `Successfully upgraded from ${currentVersion} to ${latestVersion}`;
			tui.success(message);

			return {
				upgraded: true,
				from: currentVersion,
				to: latestVersion,
				message,
			};
		} catch (error) {
			exitWithError(
				createError(ErrorCode.INTERNAL_ERROR, 'Upgrade failed', {
					error: error instanceof Error ? error.message : 'Unknown error',
				}),
				logger,
				options.errorFormat
			);
		}
	},
});
