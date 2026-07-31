/**
 * Shared temporary-config CDN wiring for frameworks that bake asset URLs
 * via a config field (Next assetPrefix, Astro assetsPrefix, Nuxt cdnURL,
 * SvelteKit paths.assets).
 *
 * One lifecycle owns: resolve CDN origin → buildEnv → optional prePatch →
 * backup/wrap/cleanup. Frameworks supply a recipe; they do not reimplement
 * filesystem choreography.
 *
 * Mutations are registered for rollback immediately. If preparation throws,
 * registered cleanups run before the error propagates so the project tree
 * is never left half-wrapped.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DetectedFramework } from '../detect/types.ts';
import {
	PACK_ONLY_DEPLOYMENT_ID,
	resolveAgentuityCdnBase,
	resolveAgentuityCdnOrigin,
} from './cdn-origin.ts';

export interface CdnPrepResult {
	buildEnv: Record<string, string>;
	logs: string[];
	cdnOrigin?: string;
	/** Absolute CDN base with trailing slash, when set. */
	cdnBase?: string;
	cleanup: () => void;
	/**
	 * Optional DetectedFramework field overrides for the upcoming build
	 * (e.g. rewritten `buildCommand` for Vite `--base` inject).
	 */
	frameworkPatch?: Partial<
		Pick<DetectedFramework, 'buildCommand' | 'buildFileReplacements' | 'buildEnv'>
	>;
}

export interface ConfigCdnRecipe {
	/** Human label for log lines (e.g. "Next.js", "Astro"). */
	label: string;
	/** Candidate config filenames relative to project root (first hit wins). */
	configNames: readonly string[];
	/** True when the user already configured CDN in this file — skip wrap. */
	alreadyConfigured: (source: string) => boolean;
	/**
	 * JS statements executed inside the wrapper with:
	 *   - `resolved` — user config object (or {})
	 *   - `origin` — CDN origin without trailing slash
	 * Must assign the final config to `out` (e.g. `out = { ...resolved, assetPrefix: origin }`).
	 */
	mergeBody: string;
	/**
	 * How the wrapper is exported:
	 * - `function` (default) — `export default resolveConfig` (Next/Nuxt call it with phase/env)
	 * - `value` — `export default await resolveConfig()` (SvelteKit requires a plain object)
	 *
	 * `value` requires ESM/TS (top-level await). CJS + `value` is rejected.
	 */
	exportStyle?: 'function' | 'value';
	/**
	 * Extra env vars beyond AGENTUITY_CDN_ORIGIN / AGENTUITY_CDN_BASE_URL.
	 * Receives origin (no slash) and base (with slash).
	 */
	extraEnv?: (origin: string, base: string) => Record<string, string>;
	/**
	 * Optional mutation of the live config file before wrap (e.g. adapter-auto
	 * → adapter-node). Return a restore function, or null if nothing changed.
	 */
	prePatch?: (configPath: string, logs: string[]) => (() => void) | null;
	/**
	 * When no config file exists, optionally write a minimal one.
	 * Return cleanup that deletes it, or null to skip.
	 */
	writeMissingConfig?: (projectDir: string, logs: string[]) => (() => void) | null;
}

export interface PrepareConfigCdnOptions {
	projectDir: string;
	cdnBaseUrl?: string;
	deploymentId?: string;
	logger: { debug: (...args: unknown[]) => void };
	env?: NodeJS.ProcessEnv;
	recipe: ConfigCdnRecipe;
}

/** Run cleanups in reverse order; isolate each failure so later entries still run. */
export function runCleanups(cleanups: Array<() => void>): void {
	for (const c of [...cleanups].reverse()) {
		try {
			c();
		} catch {
			/* isolate cleanup failures */
		}
	}
}

function moduleKind(fileName: string, projectDir: string): 'cjs' | 'esm' | 'ts' {
	if (fileName.endsWith('.cjs')) return 'cjs';
	if (fileName.endsWith('.ts') || fileName.endsWith('.mts')) return 'ts';
	if (fileName.endsWith('.mjs')) return 'esm';
	// bare .js: respect package.json "type". SvelteKit scaffolds are almost
	// always `"type": "module"`; older Next configs are often CJS without it.
	if (fileName.endsWith('.js')) {
		try {
			const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as {
				type?: string;
			};
			if (pkg.type === 'module') return 'esm';
		} catch {
			/* no package.json — fall through */
		}
		return 'cjs';
	}
	return 'esm';
}

/**
 * `next.config.ts` → `next.config.agentuity-orig.ts` so the original
 * extension is preserved for jiti/TS loaders.
 */
export function backupConfigPath(configPath: string): string {
	const name = basename(configPath);
	const dir = configPath.slice(0, configPath.length - name.length);
	// Match "name.config.ext" or "name.config.multi.ext"
	const match = /^(.+\.config)(\..+)$/.exec(name);
	if (match) return `${dir}${match[1]}.agentuity-orig${match[2]}`;
	return `${configPath}.agentuity-orig`;
}

export function findConfigFile(projectDir: string, configNames: readonly string[]): string | null {
	for (const name of configNames) {
		const path = join(projectDir, name);
		if (existsSync(path)) return path;
	}
	return null;
}

function generateWrapperSource(
	backupName: string,
	kind: 'cjs' | 'esm' | 'ts',
	mergeBody: string,
	exportStyle: 'function' | 'value'
): string {
	const importWithExt = `./${backupName}`;
	const importSpec = `./${backupName.replace(/\.(mts|ts|mjs|cjs|js)$/, '')}`;
	const header = '// Generated by agentuity build — temporary CDN config wrapper.\n';

	const resolveBody = `
	const origin = (process.env.AGENTUITY_CDN_ORIGIN || '').replace(/\\/+$/, '');
	if (!origin) return resolved ?? {};
	let out;
	${mergeBody}
	return out;
`;

	if (kind === 'cjs') {
		// CJS cannot use top-level await. Emitting `module.exports = (async () => …)()`
		// would export a Promise, which config loaders treat as a broken object.
		if (exportStyle === 'value') {
			throw new Error(
				'CDN config wrap: exportStyle "value" is not supported for CommonJS configs ' +
					'(would export a Promise). Use an ESM config (.mjs / "type":"module") or ' +
					'exportStyle "function".'
			);
		}
		return (
			header +
			`const userConfig = require('${importWithExt}');

async function resolveConfig(...args) {
	const mod = userConfig?.default ?? userConfig;
	const resolved = typeof mod === 'function' ? await mod(...args) : mod;
	${resolveBody}
}

module.exports = resolveConfig;
`
		);
	}

	const exportLine =
		exportStyle === 'value'
			? `export default await resolveConfig();`
			: `export default resolveConfig;`;

	if (kind === 'ts') {
		return (
			header +
			`import userConfig from '${importSpec}';

async function resolveConfig(...args: unknown[]) {
	const mod =
		userConfig && typeof userConfig === 'object' && 'default' in userConfig
			? (userConfig as { default: unknown }).default
			: userConfig;
	const resolved =
		typeof mod === 'function'
			? await (mod as (...a: unknown[]) => unknown)(...args)
			: mod;
	${resolveBody}
}

${exportLine}
`
		);
	}

	// ESM
	return (
		header +
		`import userConfig from '${importWithExt}';

async function resolveConfig(...args) {
	const mod = userConfig?.default ?? userConfig;
	const resolved = typeof mod === 'function' ? await mod(...args) : mod;
	${resolveBody}
}

${exportLine}
`
	);
}

/**
 * Rename original → backup, write wrapper at configPath.
 * On any failure after rename, restores backup → configPath before rethrowing
 * so the caller never sees a missing config / orphaned backup.
 */
function writeConfigWrapper(
	configPath: string,
	backupPath: string,
	mergeBody: string,
	projectDir: string,
	exportStyle: 'function' | 'value'
): void {
	renameSync(configPath, backupPath);
	try {
		const kind = moduleKind(basename(configPath), projectDir);
		const source = generateWrapperSource(basename(backupPath), kind, mergeBody, exportStyle);
		writeFileSync(configPath, source, 'utf-8');
	} catch (err) {
		// Restore before the caller's cleanup registration path — nothing
		// else knows about this half-done rename yet.
		try {
			if (existsSync(configPath)) unlinkSync(configPath);
			if (existsSync(backupPath)) renameSync(backupPath, configPath);
		} catch {
			/* best-effort; rethrow original below */
		}
		throw err;
	}
}

/**
 * Resolve CDN origin/base and produce standard AGENTUITY_CDN_* env.
 * Returns empty buildEnv when CDN wiring should be skipped.
 */
export function resolveCdnBuildEnv(options: {
	cdnBaseUrl?: string;
	deploymentId?: string;
	env?: NodeJS.ProcessEnv;
	extraEnv?: (origin: string, base: string) => Record<string, string>;
}): {
	cdnOrigin?: string;
	cdnBase?: string;
	buildEnv: Record<string, string>;
} {
	const env = options.env ?? process.env;
	const cdnOrigin = resolveAgentuityCdnOrigin({
		cdnBaseUrl: options.cdnBaseUrl,
		deploymentId: options.deploymentId,
		env,
	});
	const cdnBase = resolveAgentuityCdnBase({
		cdnBaseUrl: options.cdnBaseUrl,
		deploymentId: options.deploymentId,
		env,
	});
	if (!cdnOrigin || !cdnBase) {
		return { buildEnv: {} };
	}

	const deploymentId =
		options.deploymentId?.trim() || env.AGENTUITY_CLOUD_DEPLOYMENT_ID?.trim() || undefined;

	const buildEnv: Record<string, string> = {
		AGENTUITY_CDN_ORIGIN: cdnOrigin,
		AGENTUITY_CDN_BASE_URL: cdnBase,
		...(deploymentId && deploymentId !== PACK_ONLY_DEPLOYMENT_ID
			? { AGENTUITY_CLOUD_DEPLOYMENT_ID: deploymentId }
			: {}),
		...(options.extraEnv?.(cdnOrigin, cdnBase) ?? {}),
	};

	return { cdnOrigin, cdnBase, buildEnv };
}

/**
 * Prepare CDN wiring for a config-file-based framework.
 *
 * All disk mutations register a cleanup immediately. If anything throws,
 * already-registered cleanups run before the error propagates.
 */
export function prepareConfigCdn(options: PrepareConfigCdnOptions): CdnPrepResult {
	const { recipe, projectDir, logger } = options;
	const logs: string[] = [];
	const cleanups: Array<() => void> = [];

	const finish = (result: Omit<CdnPrepResult, 'cleanup'>): CdnPrepResult => ({
		...result,
		cleanup: () => runCleanups(cleanups),
	});

	try {
		const { cdnOrigin, cdnBase, buildEnv } = resolveCdnBuildEnv({
			cdnBaseUrl: options.cdnBaseUrl,
			deploymentId: options.deploymentId,
			env: options.env,
			extraEnv: recipe.extraEnv,
		});

		if (!cdnOrigin || !cdnBase) {
			logger.debug(
				`${recipe.label} CDN: skipped (no --cdn-base-url / deployment id / AGENTUITY_CDN_*)`
			);
			// Still allow prePatch-only flows (e.g. SvelteKit adapter-node without CDN).
			const configPath = findConfigFile(projectDir, recipe.configNames);
			if (configPath && recipe.prePatch) {
				const restore = recipe.prePatch(configPath, logs);
				if (restore) cleanups.push(restore);
			}
			return finish({ buildEnv: {}, logs });
		}

		logs.push(`✓ ${recipe.label} CDN origin: ${cdnOrigin}`);

		const configPath = findConfigFile(projectDir, recipe.configNames);

		if (!configPath) {
			if (recipe.writeMissingConfig) {
				const restore = recipe.writeMissingConfig(projectDir, logs);
				if (restore) cleanups.push(restore);
			}
			return finish({ buildEnv, logs, cdnOrigin, cdnBase });
		}

		if (recipe.prePatch) {
			const restore = recipe.prePatch(configPath, logs);
			if (restore) cleanups.push(restore);
		}

		const existing = readFileSync(configPath, 'utf-8');
		if (recipe.alreadyConfigured(existing)) {
			logger.debug(`${recipe.label} CDN: config already sets CDN field; not wrapping`);
			logs.push(`✓ ${recipe.label} CDN: using existing config CDN setting`);
			return finish({ buildEnv, logs, cdnOrigin, cdnBase });
		}

		const backupPath = backupConfigPath(configPath);
		// writeConfigWrapper restores on its own failure before rethrowing.
		writeConfigWrapper(
			configPath,
			backupPath,
			recipe.mergeBody,
			projectDir,
			recipe.exportStyle ?? 'function'
		);
		// Register restore only after a successful wrap.
		cleanups.push(() => {
			if (existsSync(configPath)) unlinkSync(configPath);
			if (existsSync(backupPath)) renameSync(backupPath, configPath);
		});
		logs.push(`✓ ${recipe.label} CDN: wrapped ${basename(configPath)}`);

		return finish({ buildEnv, logs, cdnOrigin, cdnBase });
	} catch (err) {
		// Any mutation already registered in cleanups is rolled back before
		// the caller sees the error (caller never received a cleanup handle).
		runCleanups(cleanups);
		throw err;
	}
}
