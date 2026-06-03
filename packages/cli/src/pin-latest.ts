/**
 * Pin "latest" Agentuity dependencies to their installed version.
 *
 * v2 scaffolds (and some hand-written projects) pin Agentuity-owned packages
 * with the floating spec `"latest"`. That's a footgun for deploys: the
 * version that actually gets installed at warmup can drift from the version
 * the user built and tested against — and once v3 becomes the `latest`
 * dist-tag, a v2 project pinned to `"latest"` would silently pull v3 and
 * break.
 *
 * On deploy we resolve the concrete version each `"latest"`-pinned
 * `@agentuity/*` / `agentuity` dependency resolved to (from `bun.lock`) and
 * rewrite the user's source `package.json` in place. Scope is limited to
 * Agentuity-owned packages so we never touch the user's other deps.
 *
 * Only `bun.lock` is read: v2 Agentuity projects (the only ones that pin
 * Agentuity deps to `"latest"`) are Bun-only, so there is no other lockfile
 * format to account for.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from './node-compat/fs.ts';
import type { Logger } from './types.ts';
import { parseBunLockFile } from './utils/deps.ts';

const DEP_FIELDS = ['dependencies', 'devDependencies'] as const;

/** True for `@agentuity/<x>` and the bare `agentuity` package. */
function isAgentuityPackage(name: string): boolean {
	return name === 'agentuity' || name.startsWith('@agentuity/');
}

/**
 * Resolve the installed version of `name` from `bun.lock`. Returns null when
 * the lockfile is missing or doesn't resolve the package.
 */
async function resolveInstalledVersion(projectDir: string, name: string): Promise<string | null> {
	const path = join(projectDir, 'bun.lock');
	if (!(await pathExists(path))) return null;
	const parsed = parseBunLockFile(await readFile(path, 'utf-8'));
	const entry = parsed?.packages?.[name];
	if (!Array.isArray(entry) || typeof entry[0] !== 'string') return null;
	// entry[0] is "name@version" (scoped names keep their leading '@').
	const spec = entry[0];
	const at = spec.lastIndexOf('@');
	if (at <= 0) return null;
	return spec.slice(at + 1) || null;
}

/**
 * Rewrite `"latest"`-pinned Agentuity deps in the project's source
 * package.json to the version resolved from the lockfile. Mutates the file in
 * place. Safe no-op when there's no package.json, no `"latest"` Agentuity
 * deps, or no lockfile to resolve from.
 *
 * @returns the list of `{ name, version }` that were pinned (empty if none).
 */
export async function pinLatestAgentuityDeps(
	projectDir: string,
	logger: Logger
): Promise<Array<{ name: string; version: string }>> {
	const pkgPath = join(projectDir, 'package.json');
	if (!(await pathExists(pkgPath))) return [];

	let raw: string;
	try {
		raw = await readFile(pkgPath, 'utf-8');
	} catch (err) {
		logger.debug('pin-latest: failed to read package.json: %s', err);
		return [];
	}

	let pkg: Record<string, unknown>;
	try {
		pkg = JSON.parse(raw) as Record<string, unknown>;
	} catch (err) {
		logger.debug('pin-latest: package.json is not valid JSON, skipping: %s', err);
		return [];
	}

	const pinned: Array<{ name: string; version: string }> = [];

	for (const field of DEP_FIELDS) {
		const deps = pkg[field] as Record<string, string> | undefined;
		if (!deps) continue;
		for (const [name, spec] of Object.entries(deps)) {
			if (spec !== 'latest' || !isAgentuityPackage(name)) continue;
			const version = await resolveInstalledVersion(projectDir, name);
			if (!version) {
				logger.debug(
					'pin-latest: %s is "latest" but no bun.lock entry found; leaving as-is',
					name
				);
				continue;
			}
			deps[name] = version;
			pinned.push({ name, version });
		}
	}

	if (pinned.length === 0) return [];

	// Preserve the file's indentation style (tabs in our scaffolds) and trailing newline.
	const indent = raw.includes('\t') ? '\t' : 2;
	const trailingNewline = raw.endsWith('\n') ? '\n' : '';
	await writeFile(pkgPath, JSON.stringify(pkg, null, indent) + trailingNewline);

	for (const { name, version } of pinned) {
		logger.debug('pin-latest: pinned %s "latest" -> %s', name, version);
	}
	return pinned;
}
