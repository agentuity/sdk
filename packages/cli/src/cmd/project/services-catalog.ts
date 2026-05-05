/**
 * Service augment catalog.
 *
 * Loads service manifests from `templates/services/<id>/manifest.json` at
 * module init time and exposes the catalog as a typed, ordered array.
 *
 * Adding a new service is purely additive: drop a directory under
 * `templates/services/` with a manifest, files, and snippets — no edits
 * to this file or to existing services.
 *
 * Service order is fixed by `manifest.order` (lower runs first when
 * snippets are concatenated at a marker). It is independent of how the
 * user picks services in the multi-select.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { currentDir } from '../../node-compat/runtime-info.ts';

/** Frameworks a service may target. */
export type FrameworkId =
	| 'nextjs'
	| 'remix'
	| 'vite-react'
	| 'nuxt'
	| 'sveltekit'
	| 'astro'
	| 'hono';

/** Single env var contribution. */
export interface ServiceEnvVar {
	name: string;
	placeholder: string;
	comment?: string;
}

/** A service augment's declarative manifest. */
export interface ServiceAugment {
	id: string;
	label: string;
	hint: string;
	description: string;
	/** Lower numbers run first. Determines snippet concatenation order. */
	order: number;
	/** Other service ids this one requires. */
	requires?: string[];
	/** Packages added to dependencies. */
	packages: string[];
	/** Packages added to devDependencies. */
	devPackages?: string[];
	/** Scripts merged into package.json. */
	scripts?: Record<string, string>;
	/** Env vars to append to .env.example. */
	envVars?: ServiceEnvVar[];
	/** Frameworks this service supports. */
	frameworks: FrameworkId[];
}

/**
 * Default `templates/services` directory relative to this module.
 * Mirrors the layout strategy in `frameworks.ts`: src and dist trees
 * have parallel structure, so the same path resolves under both.
 */
function defaultServicesDir(): string {
	return join(currentDir(import.meta), 'templates', 'services');
}

let cached: ServiceAugment[] | null = null;

/**
 * Returns the service catalog, ordered ascending by `order`.
 *
 * The catalog is built lazily and cached. Manifests are parsed on
 * first access and validated against required fields; any invalid
 * manifest aborts catalog construction with a thrown error rather
 * than silently dropping the service — service definitions are
 * shipped, not user input, so a bad manifest is a build bug.
 */
export function getServiceCatalog(): ServiceAugment[] {
	if (cached) return cached;
	cached = loadCatalog(defaultServicesDir());
	return cached;
}

/**
 * Load and validate a service catalog from an arbitrary services
 * directory. Used by tests with a synthetic templates tree.
 */
export function loadCatalog(servicesDir: string): ServiceAugment[] {
	const entries: ServiceAugment[] = [];
	let dirEntries: string[];
	try {
		dirEntries = readdirSync(servicesDir);
	} catch {
		return [];
	}

	for (const id of dirEntries) {
		const manifestPath = join(servicesDir, id, 'manifest.json');
		let stat;
		try {
			stat = statSync(manifestPath);
		} catch {
			continue; // Not a service directory — skip.
		}
		if (!stat.isFile()) continue;

		const raw = readFileSync(manifestPath, 'utf8');
		const parsed = JSON.parse(raw) as ServiceAugment;

		validateManifest(id, parsed);
		entries.push(parsed);
	}

	entries.sort((a, b) => a.order - b.order);

	// Validate that all `requires` references resolve.
	const ids = new Set(entries.map((e) => e.id));
	for (const e of entries) {
		for (const dep of e.requires ?? []) {
			if (!ids.has(dep)) {
				throw new Error(
					`Service '${e.id}' requires '${dep}' but no such service exists in the catalog`
				);
			}
		}
	}

	return entries;
}

/** Reset the cached catalog. Tests use this to switch between fixtures. */
export function _resetCatalogCache(): void {
	cached = null;
}

/** Look up a service by id. Returns undefined if not in the catalog. */
export function getService(id: string): ServiceAugment | undefined {
	return getServiceCatalog().find((s) => s.id === id);
}

/**
 * Resolve a selection of service ids into the full ordered list of
 * services to apply, including transitively-required services.
 *
 * Throws if any id is unknown.
 *
 * If `catalog` is omitted, the default (bundled) catalog is used.
 */
export function resolveSelection(
	selectedIds: string[],
	catalog: ServiceAugment[] = getServiceCatalog()
): ServiceAugment[] {
	const byId = new Map(catalog.map((s) => [s.id, s]));
	const seen = new Set<string>();
	const result: ServiceAugment[] = [];

	function add(id: string): void {
		if (seen.has(id)) return;
		const service = byId.get(id);
		if (!service) {
			throw new Error(`Unknown service: ${id}`);
		}
		seen.add(id);
		for (const dep of service.requires ?? []) add(dep);
		result.push(service);
	}

	for (const id of selectedIds) add(id);

	// Re-sort by catalog order so snippets concatenate deterministically
	// regardless of input order.
	result.sort((a, b) => a.order - b.order);
	return result;
}

/**
 * Manifests are author-controlled and shipped with the CLI, so any
 * invalid one is a programming error. We surface the first such error
 * loudly rather than silently degrading.
 */
function validateManifest(id: string, m: ServiceAugment): void {
	if (m.id !== id) {
		throw new Error(`Service manifest in '${id}/' has mismatched id '${m.id}'`);
	}
	if (typeof m.order !== 'number') {
		throw new Error(`Service '${id}': order must be a number`);
	}
	if (!Array.isArray(m.packages)) {
		throw new Error(`Service '${id}': packages must be an array`);
	}
	if (!Array.isArray(m.frameworks) || m.frameworks.length === 0) {
		throw new Error(`Service '${id}': frameworks must be a non-empty array`);
	}
}
