import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Logger, FileToWrite } from '@agentuity/core';
import { APIClient, getServiceUrls, sandboxGet } from '@agentuity/server';
import type { AuthData } from '../../../types';
import { getGlobalCatalystAPIClient } from '../../../config';
import { getResourceRegion, setResourceRegion, deleteResourceRegion } from '../../../cache';
import * as tui from '../../../tui';
import { ErrorCode } from '../../../errors';

export function createSandboxClient(logger: Logger, auth: AuthData, region: string): APIClient {
	const urls = getServiceUrls(region);
	return new APIClient(urls.catalyst, logger, auth.apiKey);
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
	orgId: string
): Promise<string> {
	// Check cache first
	const cachedRegion = await getResourceRegion('sandbox', profileName, sandboxId);
	if (cachedRegion) {
		logger.trace(`[sandbox] Found cached region for ${sandboxId}: ${cachedRegion}`);
		return cachedRegion;
	}

	// Fallback to API lookup using global client
	logger.trace(`[sandbox] Cache miss for ${sandboxId}, fetching from API`);
	const globalClient = await getGlobalCatalystAPIClient(logger, auth, profileName);

	const sandbox = await sandboxGet(globalClient, { sandboxId, orgId });
	if (!sandbox.region) {
		tui.fatal(`Sandbox '${sandboxId}' has no region information`, ErrorCode.RESOURCE_NOT_FOUND);
	}

	// Cache the result
	await setResourceRegion('sandbox', profileName, sandboxId, sandbox.region);
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
	await setResourceRegion('sandbox', profileName, sandboxId, region);
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
export function parseFileArgs(fileArgs: string[] | undefined): FileToWrite[] {
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
		if (!existsSync(resolvedPath)) {
			throw new Error(`File not found: ${localPath} (resolved to ${resolvedPath})`);
		}

		const content = readFileSync(resolvedPath);
		files.push({ path: sandboxPath, content });
	}

	return files;
}
