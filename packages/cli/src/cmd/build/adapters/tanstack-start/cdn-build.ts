/**
 * TanStack Start CDN build preparation.
 *
 * Before `vite build`, ensures:
 * 1. A server entry exists with TanStack `transformAssets` wired to Agentuity CDN env
 * 2. Vite `base` is empty so client-side lazy chunks resolve against the CDN entry
 *
 * Changes are applied to the project tree for the duration of the build and reverted
 * afterward when we generated or patched files (same pattern as buildFileReplacements).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_CANDIDATES = ['src/server.ts', 'app/server.ts'] as const;

const VITE_CONFIG_NAMES = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
] as const;

/** Default TanStack Start server entry when the scaffold omitted one. */
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
	const deploymentId = process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
	return deploymentId ? \`https://cdn.agentuity.com/\${deploymentId}\` : undefined;
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

export interface TanStackCdnBuildPreparation {
	cleanup: () => void;
	logs: string[];
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
	projectDir: string,
	logger: { debug: (...args: unknown[]) => void }
): TanStackCdnBuildPreparation {
	const cleanups: Array<() => void> = [];
	const logs: string[] = [];

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
		}
	} else {
		const serverRel = SERVER_CANDIDATES[0];
		const serverPath = join(projectDir, serverRel);
		mkdirSync(join(projectDir, 'src'), { recursive: true });
		writeFileSync(serverPath, GENERATED_TANSTACK_SERVER_TS, 'utf-8');
		cleanups.push(() => {
			if (existsSync(serverPath)) {
				try {
					unlinkSync(serverPath);
				} catch {
					// ignore
				}
			}
		});
		logs.push(`✓ Generated ${serverRel} with Agentuity CDN asset transform`);
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
		cleanup: () => {
			for (const cleanup of cleanups.reverse()) cleanup();
		},
	};
}
