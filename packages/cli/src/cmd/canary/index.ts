import { createCommand } from '../../types';
import { getPlatformInfo } from '../upgrade';
import { downloadWithProgress } from '../../download';
import { z } from 'zod';
import { $ } from 'bun';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdir, rm, mkdir, stat } from 'node:fs/promises';
import * as tui from '../../tui';

const CANARY_CACHE_DIR = join(homedir(), '.agentuity', 'canary');
const CANARY_BASE_URL = 'https://agentuity-sdk-objects.t3.storage.dev/binary';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CanaryArgsSchema = z.object({
	args: z
		.array(z.string())
		.describe('Version/URL followed by commands to run (e.g., 0.1.6-abc1234 deploy --force)'),
});

const CanaryResponseSchema = z.object({
	executed: z.boolean().describe('Whether the canary was executed'),
	version: z.string().describe('The canary version'),
	message: z.string().describe('Status message'),
});

function isUrl(str: string): boolean {
	return str.startsWith('http://') || str.startsWith('https://');
}

function getBinaryFilename(platform: { os: string; arch: string }): string {
	return `agentuity-${platform.os}-${platform.arch}.gz`;
}

function getCachePath(version: string): string {
	return join(CANARY_CACHE_DIR, version, 'agentuity');
}

async function cleanupOldCanaries(): Promise<void> {
	try {
		await mkdir(CANARY_CACHE_DIR, { recursive: true });
		const entries = await readdir(CANARY_CACHE_DIR);
		const now = Date.now();

		for (const entry of entries) {
			const entryPath = join(CANARY_CACHE_DIR, entry);
			try {
				const stats = await stat(entryPath);
				if (now - stats.mtimeMs > CACHE_MAX_AGE_MS) {
					await rm(entryPath, { recursive: true, force: true });
				}
			} catch {
				// Ignore errors for individual entries
			}
		}
	} catch {
		// Ignore cleanup errors
	}
}

async function downloadCanary(url: string, destPath: string): Promise<void> {
	const destDir = join(destPath, '..');
	await mkdir(destDir, { recursive: true });

	const gzPath = `${destPath}.gz`;

	const stream = await downloadWithProgress({
		url,
		message: 'Downloading canary...',
	});

	const writer = Bun.file(gzPath).writer();
	for await (const chunk of stream) {
		writer.write(chunk);
	}
	await writer.end();

	if (!(await Bun.file(gzPath).exists())) {
		throw new Error('Download failed - file not created');
	}

	try {
		await $`gunzip ${gzPath}`.quiet();
	} catch (error) {
		if (await Bun.file(gzPath).exists()) {
			await $`rm ${gzPath}`.quiet();
		}
		throw new Error(
			`Decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	if (!(await Bun.file(destPath).exists())) {
		throw new Error('Decompression failed - file not found');
	}

	await $`chmod 755 ${destPath}`.quiet();
}

export const command = createCommand({
	name: 'canary',
	description: 'Run a canary version of the CLI',
	hidden: true,
	skipUpgradeCheck: true,
	schema: {
		args: CanaryArgsSchema,
		response: CanaryResponseSchema,
	},

	async handler(ctx) {
		const { args } = ctx;

		if (args.args.length === 0) {
			tui.error('Usage: agentuity canary <version|url> [commands...]');
			tui.newline();
			tui.info('Examples:');
			tui.info('  agentuity canary 0.1.6-abc1234');
			tui.info('  agentuity canary 0.1.6-abc1234 deploy --log-level trace');
			tui.info(
				'  agentuity canary https://agentuity-sdk-objects.t3.storage.dev/binary/0.1.6-abc1234/agentuity-darwin-arm64.gz'
			);
			return {
				executed: false,
				version: '',
				message: 'No target specified',
			};
		}

		const [target, ...forwardArgs] = args.args;

		// Clean up old canaries in background
		cleanupOldCanaries().catch(() => {});

		const platform = getPlatformInfo();
		let version: string;
		let downloadUrl: string;
		let cachePath: string;

		if (isUrl(target)) {
			// Extract version from URL
			const match = target.match(/\/binary\/([^/]+)\//);
			version = match ? match[1] : 'custom';
			downloadUrl = target;
			cachePath = getCachePath(version);
		} else {
			// Treat as version string
			version = target;
			const filename = getBinaryFilename(platform);
			downloadUrl = `${CANARY_BASE_URL}/${version}/${filename}`;
			cachePath = getCachePath(version);
		}

		// Check cache
		if (await Bun.file(cachePath).exists()) {
			tui.info(`Using cached canary ${version}`);
		} else {
			tui.info(`Downloading canary ${version}...`);
			try {
				await downloadCanary(downloadUrl, cachePath);
				tui.success(`Downloaded canary ${version}`);
			} catch (error) {
				tui.error(`Failed to download canary: ${error instanceof Error ? error.message : 'Unknown error'}`);
				return {
					executed: false,
					version,
					message: `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`,
				};
			}
		}

		// Update access time
		try {
			await $`touch -a -m ${cachePath}`.quiet();
		} catch {
			// Ignore touch errors
		}

		tui.newline();
		tui.info(`Running canary ${version}...`);
		tui.newline();

		// Execute the canary binary with forwarded args
		const proc = Bun.spawn([cachePath, ...forwardArgs], {
			stdin: 'inherit',
			stdout: 'inherit',
			stderr: 'inherit',
		});

		const exitCode = await proc.exited;
		process.exit(exitCode);
	},
});
