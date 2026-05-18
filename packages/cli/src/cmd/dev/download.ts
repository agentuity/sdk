import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import * as tar from 'tar';
import { StructuredError } from '@agentuity/core';
import { spinner } from '../../tui.ts';

interface GravityClient {
	filename: string;
	version: string;
}

/**
 * Remove previously downloaded gravity version directories after a
 * newer version has started successfully.
 *
 * Safety guard: only removes sibling directories that contain a
 * gravity binary, leaving any unrelated files/folders untouched.
 */
export function sweepOldGravityVersions(gravityDir: string, currentVersion: string): string[] {
	if (!existsSync(gravityDir)) {
		return [];
	}

	const removed: string[] = [];
	for (const entry of readdirSync(gravityDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === currentVersion) {
			continue;
		}

		const candidateDir = join(gravityDir, entry.name);
		const candidateBinary = join(candidateDir, 'gravity');
		if (!existsSync(candidateBinary)) {
			continue;
		}

		rmSync(candidateDir, { recursive: true, force: true });
		removed.push(candidateDir);
	}

	return removed;
}

const GravityVersionError = StructuredError('GravityVersionError')<{
	status: number;
	statusText: string;
}>();
const GravityDownloadError = StructuredError('GravityDownloadError')<{
	status: number;
	statusText: string;
}>();
const GravityExtractionError = StructuredError('GravityExtractionError')<{
	path: string;
}>();

function getBaseURL(): string {
	return process.env.AGENTUITY_SH_URL || 'https://agentuity.sh';
}

/**
 * Resolve the latest gravity version, download (or re-use) the
 * binary for the host platform, and extract it to
 * `<gravityDir>/<version>/gravity`.
 */
export async function download(gravityDir: string): Promise<GravityClient> {
	const baseURL = getBaseURL();

	// Step 1: Get the latest version from agentuity.sh
	const tag = (await spinner({
		message: 'Checking Agentuity Gravity',
		callback: async () => {
			const resp = await fetch(`${baseURL}/release/gravity/version`, {
				signal: AbortSignal.timeout(10_000),
			});
			if (!resp.ok) {
				throw new GravityVersionError({
					status: resp.status,
					statusText: resp.statusText,
				});
			}
			const text = (await resp.text()).trim();
			return text.startsWith('v') ? text : `v${text}`;
		},
		clearOnSuccess: true,
	})) as string;

	const version = tag.startsWith('v') ? tag.slice(1) : tag;
	const releaseFilename = join(gravityDir, version, 'gravity');

	// Step 2: Check if already downloaded
	if (existsSync(releaseFilename)) {
		return { filename: releaseFilename, version };
	}

	// Step 3: Download the binary from agentuity.sh
	const os = platform();
	let arch: string = process.arch;
	if (arch === 'x64') {
		arch = 'x86_64';
	}

	const tmpFile = join(tmpdir(), `${randomUUID()}.tar.gz`);

	try {
		await spinner({
			message: `Downloading Gravity ${version}`,
			callback: async () => {
				const resp = await fetch(`${baseURL}/release/gravity/${tag}/${os}/${arch}`, {
					signal: AbortSignal.timeout(60_000),
				});
				if (!resp.ok) {
					throw new GravityDownloadError({
						status: resp.status,
						statusText: resp.statusText,
					});
				}
				const buffer = await resp.arrayBuffer();
				writeFileSync(tmpFile, Buffer.from(buffer));
			},
			clearOnSuccess: true,
		});

		// Step 4: Extract the tarball
		await spinner({
			message: 'Extracting release',
			callback: async () => {
				const downloadDir = dirname(releaseFilename);
				if (!existsSync(downloadDir)) {
					mkdirSync(downloadDir, { recursive: true });
				}
				await tar.x({ file: tmpFile, cwd: downloadDir, chmod: true });
			},
			clearOnSuccess: true,
		});
	} finally {
		// Clean up temp file regardless of success or failure
		if (existsSync(tmpFile)) {
			rmSync(tmpFile);
		}
	}

	// Step 5: Verify the binary was extracted
	if (!existsSync(releaseFilename)) {
		throw new GravityExtractionError({ path: releaseFilename });
	}

	return { filename: releaseFilename, version };
}
