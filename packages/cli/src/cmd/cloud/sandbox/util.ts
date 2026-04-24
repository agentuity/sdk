import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FileToWrite, Logger } from '@agentuity/core';
import { APIClient, getServiceUrls, sandboxGet, sandboxResolve } from '@agentuity/server';
import { deleteResourceRegion, getResourceInfo, setResourceInfo } from '../../../cache';
import { getGlobalCatalystAPIClient } from '../../../config';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import type { AuthData, Config } from '../../../types';

export function createSandboxClient(logger: Logger, auth: AuthData, region: string): APIClient {
	return new APIClient(getServiceUrls(region).catalyst, logger, auth.apiKey);
}

export interface ResolvedSandboxTarget {
	region: string;
	orgId: string;
}

/**
 * Resolve sandbox routing context using cache-first lookup.
 * Falls back to the CLI resolve endpoint on cache miss or partial cache.
 */
export async function resolveSandboxTarget(
	logger: Logger,
	auth: AuthData,
	apiClient: APIClient,
	sandboxId: string,
	profileName = 'production',
	config?: Config | null
): Promise<ResolvedSandboxTarget> {
	const cachedInfo = await getResourceInfo('sandbox', profileName, sandboxId);
	if (cachedInfo?.region && cachedInfo?.orgId) {
		logger.trace(
			`[sandbox] Found cached target for ${sandboxId}: ${cachedInfo.region}/${cachedInfo.orgId}`
		);
		return { region: cachedInfo.region, orgId: cachedInfo.orgId };
	}

	logger.trace(`[sandbox] Cache miss for target ${sandboxId}, resolving via CLI API`);
	const globalClient =
		apiClient ?? (await getGlobalCatalystAPIClient(logger, auth, profileName, undefined, config));
	const sandbox = await sandboxResolve(globalClient, sandboxId);
	await setResourceInfo('sandbox', profileName, sandboxId, sandbox.region, sandbox.orgId);
	return { region: sandbox.region, orgId: sandbox.orgId };
}

/**
 * Look up the region for a sandbox, using cache-first strategy.
 * Falls back to API lookup if not in cache.
 */
export async function getSandboxRegion(
	logger: Logger,
	auth: AuthData,
	profileName = 'production',
	sandboxId: string,
	orgId?: string,
	config?: Config | null
): Promise<string> {
	// Check cache first
	const cachedInfo = await getResourceInfo('sandbox', profileName, sandboxId);
	if (cachedInfo?.region) {
		logger.trace(`[sandbox] Found cached region for ${sandboxId}: ${cachedInfo.region}`);
		return cachedInfo.region;
	}

	// Fallback to API lookup using global client
	logger.trace(`[sandbox] Cache miss for ${sandboxId}, fetching from API`);
	const globalClient = await getGlobalCatalystAPIClient(
		logger,
		auth,
		profileName,
		undefined,
		config
	);

	const sandbox = await sandboxGet(globalClient, { sandboxId, orgId, includeDeleted: true });
	if (!sandbox.region) {
		tui.fatal(`Sandbox '${sandboxId}' has no region information`, ErrorCode.RESOURCE_NOT_FOUND);
	}

	// Cache the result
	await setResourceInfo('sandbox', profileName, sandboxId, sandbox.region, orgId);
	logger.trace(`[sandbox] Cached region for ${sandboxId}: ${sandbox.region}`);

	return sandbox.region;
}

/**
 * Cache the region for a sandbox after create/run operations
 */
export async function cacheSandboxRegion(
	profileName = 'production',
	sandboxId: string,
	region: string
): Promise<void> {
	await setResourceInfo('sandbox', profileName, sandboxId, region);
}

export async function cacheSandboxTarget(
	profileName = 'production',
	sandboxId: string,
	region: string,
	orgId?: string
): Promise<void> {
	await setResourceInfo('sandbox', profileName, sandboxId, region, orgId);
}

/**
 * Clear cached region for a sandbox after delete
 */
export async function clearSandboxRegionCache(
	profileName = 'production',
	sandboxId: string
): Promise<void> {
	await deleteResourceRegion('sandbox', profileName, sandboxId);
}

/**
 * Parse --file arguments and read file contents.
 *
 * Formats:
 * - <sandbox-path>:<local-path>  - explicit mapping (e.g., script.js:./local/script.js)
 * - <filename>                   - shorthand, uses same name for both (e.g., script.js -> script.js:./script.js)
 *
 * @returns Array of FileToWrite objects
 */
export async function parseFileArgs(fileArgs: string[] | undefined): Promise<FileToWrite[]> {
	if (!fileArgs || fileArgs.length === 0) {
		return [];
	}

	const files: FileToWrite[] = [];

	for (const arg of fileArgs) {
		let sandboxPath: string;
		let localPath: string;

		const colonIndex = arg.indexOf(':');
		if (colonIndex === -1) {
			// Shorthand: just filename, use same name for sandbox and look in current dir
			sandboxPath = arg;
			localPath = `./${arg}`;
		} else {
			sandboxPath = arg.slice(0, colonIndex);
			localPath = arg.slice(colonIndex + 1);

			if (!sandboxPath) {
				throw new Error(`Invalid --file format: "${arg}". Sandbox path cannot be empty`);
			}
			if (!localPath) {
				throw new Error(`Invalid --file format: "${arg}". Local path cannot be empty`);
			}
		}

		const resolvedPath = resolve(localPath);
		// Use Bun.file().exists() instead of Node's existsSync per coding guidelines
		const fileExists = await Bun.file(resolvedPath).exists();
		if (!fileExists) {
			throw new Error(`File not found: ${localPath} (resolved to ${resolvedPath})`);
		}

		const content = readFileSync(resolvedPath);
		files.push({ path: sandboxPath, content });
	}

	return files;
}
