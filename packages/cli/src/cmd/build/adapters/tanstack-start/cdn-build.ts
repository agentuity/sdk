/**
 * TanStack Start CDN build preparation.
 *
 * Before `vite build`, ensures:
 * 1. A server entry exists with TanStack `transformAssets` wired to Agentuity CDN
 * 2. Vite `base` is empty so client-side lazy chunks resolve against the CDN entry
 * 3. Build env carries `AGENTUITY_CDN_ORIGIN` / `AGENTUITY_CDN_BASE_URL` when a
 *    CDN base is known (`--cdn-base-url`, env, or deployment id)
 *
 * When the CDN origin is known at package time, it is **baked into** the
 * generated server entry so the Nitro bundle prefixes asset URLs without
 * relying on runtime env. When unknown, the generated entry falls back to
 * reading `AGENTUITY_CDN_ORIGIN` / `AGENTUITY_CLOUD_DEPLOYMENT_ID` at runtime.
 *
 * Changes are applied to the project tree for the duration of the build and
 * reverted afterward when we generated or patched files.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	AGENTUITY_CDN_HOST,
	PACK_ONLY_DEPLOYMENT_ID,
	resolveAgentuityCdnBase,
	resolveAgentuityCdnOrigin,
} from '../cdn-origin.ts';

const SERVER_CANDIDATES = ['src/server.ts', 'app/server.ts'] as const;

const VITE_CONFIG_NAMES = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
] as const;

/**
 * Server entry that resolves CDN origin at runtime (deploy host sets env).
 * Used when no origin is known during `agentuity build`.
 */
export const GENERATED_TANSTACK_SERVER_TS = `/**
 * Agentuity CDN wiring for TanStack Start (generated during agentuity build).
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/cdn-asset-urls
 */
import {
	createStartHandler,
	defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';

function resolveCdnOrigin(): string | undefined {
	const explicit = process.env.AGENTUITY_CDN_ORIGIN?.replace(/\\/+$/, '');
	if (explicit) return explicit;
	const fromBase = process.env.AGENTUITY_CDN_BASE_URL?.replace(/\\/+$/, '');
	if (fromBase) return fromBase;
	const deploymentId = process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
	return deploymentId ? \`https://${AGENTUITY_CDN_HOST}/\${deploymentId}\` : undefined;
}

const cdnOrigin = resolveCdnOrigin();

const handler = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: cdnOrigin
		? { prefix: cdnOrigin, crossOrigin: 'anonymous' }
		: undefined,
});

export default createServerEntry({ fetch: handler });
`;

/**
 * Server entry with a build-time-known CDN origin baked in (from
 * `--cdn-base-url` or deployment id). `transformAssets.prefix` is a string
 * literal so Nitro bundles it without depending on runtime env.
 */
export function generateTanStackServerTsWithOrigin(cdnOrigin: string): string {
	const origin = cdnOrigin.replace(/\/+$/, '');
	// Escape for embedding in a single-quoted JS string.
	const escaped = origin.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	return `/**
 * Agentuity CDN wiring for TanStack Start (generated during agentuity build).
 * CDN origin baked from --cdn-base-url / deployment metadata at package time.
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/cdn-asset-urls
 */
import {
	createStartHandler,
	defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';

const cdnOrigin = '${escaped}' as string | undefined;

const handler = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: cdnOrigin
		? { prefix: cdnOrigin, crossOrigin: 'anonymous' }
		: undefined,
});

export default createServerEntry({ fetch: handler });
`;
}

export interface TanStackCdnBuildPreparation {
	cleanup: () => void;
	logs: string[];
	/** Env to merge into the framework build (AGENTUITY_CDN_*). */
	buildEnv: Record<string, string>;
	/** Resolved origin without trailing slash, when known. */
	cdnOrigin?: string;
}

export interface PrepareTanStackCdnBuildOptions {
	projectDir: string;
	logger: { debug: (...args: unknown[]) => void };
	cdnBaseUrl?: string;
	deploymentId?: string;
	env?: NodeJS.ProcessEnv;
}

export function findTanStackServerEntry(projectDir: string): string | null {
	for (const rel of SERVER_CANDIDATES) {
		const path = join(projectDir, rel);
		if (existsSync(path)) return rel;
	}
	return null;
}

export function findViteConfigPath(projectDir: string): string | null {
	for (const name of VITE_CONFIG_NAMES) {
		const path = join(projectDir, name);
		if (existsSync(path)) return name;
	}
	return null;
}

function hasTransformAssets(source: string): boolean {
	return /\btransformAssets\b/.test(source);
}

/** Inject `base: ''` when unset, or replace `base: '/'` for CDN-relative chunks. */
export function patchViteConfigBase(source: string): { content: string; changed: boolean } {
	if (/\bbase\s*:\s*['"]{2}/.test(source) || /\bbase\s*:\s*''/.test(source)) {
		return { content: source, changed: false };
	}

	if (/\bbase\s*:\s*['"]\/['"]/.test(source)) {
		return {
			content: source.replace(/\bbase\s*:\s*['"]\/['"]/, "base: ''"),
			changed: true,
		};
	}

	if (/\bbase\s*:/.test(source)) {
		return { content: source, changed: false };
	}

	const defineConfigMatch = source.match(/(export\s+default\s+defineConfig\s*\(\s*\{)/);
	if (!defineConfigMatch) {
		return { content: source, changed: false };
	}

	return {
		content: source.replace(defineConfigMatch[0], `${defineConfigMatch[0]}\n\tbase: '',`),
		changed: true,
	};
}

export function prepareTanStackCdnBuild(
	projectDirOrOptions: string | PrepareTanStackCdnBuildOptions,
	loggerMaybe?: { debug: (...args: unknown[]) => void }
): TanStackCdnBuildPreparation {
	// Back-compat: prepareTanStackCdnBuild(projectDir, logger)
	const options: PrepareTanStackCdnBuildOptions =
		typeof projectDirOrOptions === 'string'
			? { projectDir: projectDirOrOptions, logger: loggerMaybe! }
			: projectDirOrOptions;

	const { projectDir, logger } = options;
	const env = options.env ?? process.env;
	const cleanups: Array<() => void> = [];
	const logs: string[] = [];

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

	const deploymentId =
		options.deploymentId?.trim() || env.AGENTUITY_CLOUD_DEPLOYMENT_ID?.trim() || undefined;

	const buildEnv: Record<string, string> = {};
	if (cdnOrigin && cdnBase) {
		buildEnv.AGENTUITY_CDN_ORIGIN = cdnOrigin;
		buildEnv.AGENTUITY_CDN_BASE_URL = cdnBase;
		if (deploymentId && deploymentId !== PACK_ONLY_DEPLOYMENT_ID) {
			buildEnv.AGENTUITY_CLOUD_DEPLOYMENT_ID = deploymentId;
		}
		logs.push(`✓ TanStack CDN transformAssets origin: ${cdnOrigin}`);
	} else {
		logger.debug(
			'TanStack CDN: no origin at package time; generated server will resolve CDN at runtime'
		);
	}

	const existingServer = findTanStackServerEntry(projectDir);
	if (existingServer) {
		const serverPath = join(projectDir, existingServer);
		const original = readFileSync(serverPath, 'utf-8');
		if (hasTransformAssets(original)) {
			logger.debug('TanStack server entry already configures transformAssets; skipping');
		} else {
			logger.debug(
				'TanStack server entry exists without transformAssets; add CDN wiring manually or remove src/server.ts to let agentuity build generate one'
			);
			logs.push(
				'⚠ TanStack server entry exists without transformAssets — CDN asset URLs may stay on the app origin'
			);
		}
	} else {
		const serverRel = SERVER_CANDIDATES[0];
		const serverPath = join(projectDir, serverRel);
		mkdirSync(join(projectDir, 'src'), { recursive: true });
		const body = cdnOrigin
			? generateTanStackServerTsWithOrigin(cdnOrigin)
			: GENERATED_TANSTACK_SERVER_TS;
		writeFileSync(serverPath, body, 'utf-8');
		cleanups.push(() => {
			if (existsSync(serverPath)) {
				try {
					unlinkSync(serverPath);
				} catch {
					// ignore
				}
			}
		});
		logs.push(
			cdnOrigin
				? `✓ Generated ${serverRel} with baked CDN origin ${cdnOrigin}`
				: `✓ Generated ${serverRel} with Agentuity CDN asset transform (runtime env)`
		);
	}

	const viteConfigRel = findViteConfigPath(projectDir);
	if (viteConfigRel) {
		const vitePath = join(projectDir, viteConfigRel);
		const original = readFileSync(vitePath, 'utf-8');
		const patched = patchViteConfigBase(original);
		if (patched.changed) {
			writeFileSync(vitePath, patched.content, 'utf-8');
			cleanups.push(() => writeFileSync(vitePath, original));
			logs.push(`✓ Set Vite base: '' for CDN client chunk resolution`);
		}
	} else {
		logger.debug('No vite.config found; skipped Vite base patch');
	}

	return {
		logs,
		buildEnv,
		cdnOrigin,
		cleanup: () => {
			for (const cleanup of cleanups.reverse()) cleanup();
		},
	};
}
