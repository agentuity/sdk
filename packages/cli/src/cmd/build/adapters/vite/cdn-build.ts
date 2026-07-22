/**
 * Vite SPA CDN build preparation.
 *
 * For Agentuity cloud deploys, hashed client assets are uploaded to
 * `https://cdn.agentuity.com/<deploymentId>/…`. Static HTML/JS emitted with
 * the default Vite `base: '/'` keeps requesting `/assets/…` from the app
 * origin, so the browser never uses the CDN.
 *
 * During deploy (when a real deployment id is available) we force Vite's
 * `base` to the absolute CDN origin so `index.html` and the JS module graph
 * reference CDN URLs. Local builds, pack-only, and builds without a
 * deployment id are left unchanged.
 *
 * Preference order for applying base:
 *   1. Append `vite build --base=<cdn>/` when the build command invokes vite
 *   2. Otherwise temporarily patch `vite.config.*` (reverted after build)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../../../../node-compat/fs.ts';

const VITE_CONFIG_NAMES = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
] as const;

/** Sentinel used by pack-only mode — never treat as a real cloud deployment. */
export const PACK_ONLY_DEPLOYMENT_ID = 'pack-only';

export interface ViteCdnBuildPreparation {
	cleanup: () => Promise<void>;
	logs: string[];
	/** Absolute CDN base ending with `/`, or undefined when CDN wiring is skipped. */
	cdnBase?: string;
}

export async function findViteConfigPath(projectDir: string): Promise<string | null> {
	for (const name of VITE_CONFIG_NAMES) {
		const path = join(projectDir, name);
		if (await pathExists(path)) return name;
	}
	return null;
}

/**
 * Resolve the absolute Vite `base` for CDN asset URLs (trailing slash).
 * Returns undefined when the build should keep default origin-relative paths.
 */
export function resolveViteCdnBase(options: {
	deploymentId?: string;
	env?: NodeJS.ProcessEnv;
}): string | undefined {
	const env = options.env ?? process.env;
	const explicit = env.AGENTUITY_CDN_ORIGIN?.trim().replace(/\/+$/, '');
	if (explicit) return `${explicit}/`;

	const id = (options.deploymentId ?? env.AGENTUITY_CLOUD_DEPLOYMENT_ID)?.trim();
	if (!id || id === PACK_ONLY_DEPLOYMENT_ID) return undefined;

	return `https://cdn.agentuity.com/${id}/`;
}

/**
 * Append `--base=<cdnBase>` to the shell segment that invokes vite.
 * Leaves other compound-command segments (before/after `&&` / `||` / `;`) unchanged.
 * No-op when vite is not on the command line or that segment already has `--base`.
 */
export function injectViteBaseFlag(buildCommand: string, cdnBase: string): string {
	const trimmed = buildCommand.trim();
	if (!trimmed) return buildCommand;
	if (!/\bvite\b/.test(trimmed)) return buildCommand;

	// Split on shell separators while retaining them in the result.
	const parts = trimmed.split(/(\s*(?:&&|\|\||;)\s*)/);
	let changed = false;
	const out = parts.map((part) => {
		// Separator tokens (&&, ||, ;)
		if (/^\s*(?:&&|\|\||;)\s*$/.test(part)) return part;
		if (!/\bvite\b/.test(part)) return part;
		if (/(?:^|\s)--base(?:=|\s|$)/.test(part)) return part;
		changed = true;
		return `${part.trimEnd()} --base=${cdnBase}`;
	});

	return changed ? out.join('') : buildCommand;
}

/**
 * Patch vite.config source to set `base` to an absolute CDN URL.
 * Leaves custom non-root bases alone (app already chose a path prefix).
 */
export function patchViteConfigCdnBase(
	source: string,
	cdnBase: string
): { content: string; changed: boolean } {
	const quoted = JSON.stringify(cdnBase);

	// base: '/' → CDN
	if (/\bbase\s*:\s*['"]\/['"]/.test(source)) {
		return {
			content: source.replace(/\bbase\s*:\s*['"]\/['"]/, `base: ${quoted}`),
			changed: true,
		};
	}

	// base: '' or base: "" → CDN (TanStack-style empty base)
	if (/\bbase\s*:\s*['"]{2}/.test(source)) {
		return {
			content: source.replace(/\bbase\s*:\s*['"]{2}/, `base: ${quoted}`),
			changed: true,
		};
	}

	// Any other explicit base (e.g. '/app/' or already CDN) — do not override.
	if (/\bbase\s*:/.test(source)) {
		return { content: source, changed: false };
	}

	const defineConfigMatch = source.match(/(export\s+default\s+defineConfig\s*\(\s*\{)/);
	if (!defineConfigMatch) {
		return { content: source, changed: false };
	}

	return {
		content: source.replace(defineConfigMatch[0], `${defineConfigMatch[0]}\n\tbase: ${quoted},`),
		changed: true,
	};
}

export interface PrepareViteCdnBuildOptions {
	projectDir: string;
	deploymentId?: string;
	/** Mutated in place: buildCommand / buildEnv for the duration of the build. */
	framework: {
		buildCommand: string;
		buildEnv?: Record<string, string>;
	};
	logger: { debug: (...args: unknown[]) => void };
	env?: NodeJS.ProcessEnv;
}

type CleanupFn = () => void | Promise<void>;

async function runCleanups(cleanups: CleanupFn[]): Promise<void> {
	for (const cleanup of [...cleanups].reverse()) {
		await cleanup();
	}
}

/**
 * Apply CDN base wiring for a Vite project deploy build.
 * Always await `cleanup()` in a finally block so config/command mutations revert.
 */
export async function prepareViteCdnBuild(
	options: PrepareViteCdnBuildOptions
): Promise<ViteCdnBuildPreparation> {
	const { projectDir, framework, logger } = options;
	const env = options.env ?? process.env;
	const logs: string[] = [];
	const cleanups: CleanupFn[] = [];

	const runCleanup = async () => {
		await runCleanups(cleanups);
	};

	const cdnBase = resolveViteCdnBase({
		deploymentId: options.deploymentId,
		env,
	});

	if (!cdnBase) {
		logger.debug('Vite CDN base: skipped (no deployment id / AGENTUITY_CDN_ORIGIN)');
		return {
			logs,
			cleanup: async () => {},
		};
	}

	try {
		const cdnOrigin = cdnBase.replace(/\/+$/, '');
		const deploymentId =
			options.deploymentId?.trim() || env.AGENTUITY_CLOUD_DEPLOYMENT_ID?.trim() || undefined;

		// Expose CDN env to the build process (and any config that reads it).
		const previousBuildEnv = framework.buildEnv;
		framework.buildEnv = {
			...previousBuildEnv,
			AGENTUITY_CDN_ORIGIN: cdnOrigin,
			...(deploymentId && deploymentId !== PACK_ONLY_DEPLOYMENT_ID
				? { AGENTUITY_CLOUD_DEPLOYMENT_ID: deploymentId }
				: {}),
		};
		cleanups.push(() => {
			framework.buildEnv = previousBuildEnv;
		});

		// Preferred: pass --base on the vite CLI segment (overrides vite.config).
		const previousCommand = framework.buildCommand;
		const withBaseFlag = injectViteBaseFlag(previousCommand, cdnBase);
		let appliedViaFlag = false;
		if (withBaseFlag !== previousCommand) {
			framework.buildCommand = withBaseFlag;
			cleanups.push(() => {
				framework.buildCommand = previousCommand;
			});
			appliedViaFlag = true;
			logs.push(`✓ Vite CDN base via CLI: --base=${cdnBase}`);
			logger.debug('Vite CDN: injected --base into build command');
		}

		// Fallback: patch vite.config when the build script does not invoke vite
		// directly (e.g. a custom wrapper that still reads config).
		if (!appliedViaFlag) {
			const viteConfigRel = await findViteConfigPath(projectDir);
			if (viteConfigRel) {
				const vitePath = join(projectDir, viteConfigRel);
				const original = await readFile(vitePath, 'utf-8');
				const patched = patchViteConfigCdnBase(original, cdnBase);
				if (patched.changed) {
					await writeFile(vitePath, patched.content, 'utf-8');
					cleanups.push(async () => {
						await writeFile(vitePath, original, 'utf-8');
					});
					logs.push(`✓ Vite CDN base via ${viteConfigRel}: base=${cdnBase}`);
					logger.debug('Vite CDN: patched %s base to %s', viteConfigRel, cdnBase);
				} else {
					logger.debug(
						'Vite CDN: could not patch %s (custom base already set or unrecognized config shape)',
						viteConfigRel
					);
					logs.push(
						`⚠ Vite CDN: could not set base in ${viteConfigRel}; asset URLs may stay on the app origin`
					);
				}
			} else {
				logger.debug('Vite CDN: no vite.config found and build command has no vite binary');
				logs.push(
					'⚠ Vite CDN: no vite.config and build command does not invoke vite; asset URLs may stay on the app origin'
				);
			}
		}

		return {
			cdnBase,
			logs,
			cleanup: runCleanup,
		};
	} catch (error) {
		// Restore any mutations applied before the failure.
		await runCleanup();
		throw error;
	}
}
