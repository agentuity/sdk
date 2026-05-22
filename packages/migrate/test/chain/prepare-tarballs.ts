/**
 * Helper: ensure SDK packages are built and packed as tarballs.
 *
 * This is a thin wrapper around scripts/prepare-sdk-for-testing.sh that
 * skips rebuilding when tarballs already exist (for fast local iteration).
 *
 * Output: returns a map of @agentuity/* package name → absolute tarball path.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const TARBALL_DIR = join(REPO_ROOT, 'dist', 'packages');
const PREPARE_SCRIPT = join(REPO_ROOT, 'scripts', 'prepare-sdk-for-testing.sh');

export interface TarballSet {
	/** Map of pkg-name → absolute tarball path */
	map: Record<string, string>;
	/** Absolute tarball directory */
	dir: string;
}

/**
 * Build and pack the SDK if needed, then return the tarball map.
 *
 * @param force - If true, rebuild even if tarballs already exist.
 */
export async function prepareTarballs(force = false): Promise<TarballSet> {
	const alreadyPrepared = existsSync(TARBALL_DIR) && hasTarballs(TARBALL_DIR);

	if (!alreadyPrepared || force) {
		console.log('[prepare-tarballs] Building and packing SDK…');
		const exit = Bun.spawnSync(['bash', PREPARE_SCRIPT], {
			cwd: REPO_ROOT,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		if (exit.exitCode !== 0) {
			throw new Error(`prepare-sdk-for-testing.sh exited with code ${exit.exitCode}`);
		}
	} else {
		console.log(`[prepare-tarballs] Reusing existing tarballs at ${TARBALL_DIR}`);
	}

	return { map: buildTarballMap(TARBALL_DIR), dir: TARBALL_DIR };
}

function hasTarballs(dir: string): boolean {
	try {
		return readdirSync(dir).some((f) => f.endsWith('.tgz'));
	} catch {
		return false;
	}
}

/**
 * Build a map of package name → tarball path.
 * Tarball names look like: agentuity-cli-3.0.0-alpha.6.tgz → @agentuity/cli
 */
function buildTarballMap(dir: string): Record<string, string> {
	const entries = readdirSync(dir).filter((f) => f.endsWith('.tgz'));
	const map: Record<string, string> = {};

	for (const file of entries) {
		const abs = join(dir, file);
		// agentuity-cli-3.0.0-alpha.6.tgz → cli
		// create-agentuity-3.0.0-alpha.6.tgz → create-agentuity
		const stripped = file.replace(/\.tgz$/, '');
		const match = stripped.match(/^(agentuity-(.+)|create-agentuity.*)-(\d+\.\d+\.\d+.*)$/);
		if (!match) continue;

		if (stripped.startsWith('create-agentuity')) {
			map['create-agentuity'] = abs;
		} else {
			// agentuity-<name>-<ver> — but <name> may contain dashes (e.g. coder-tui)
			// So match up to the first dash-number pattern.
			const m2 = stripped.match(/^agentuity-(.+)-(\d+\.\d+\.\d+.*)$/);
			if (m2) {
				const name = m2[1]!;
				map[`@agentuity/${name}`] = abs;
			}
		}
	}

	return map;
}
