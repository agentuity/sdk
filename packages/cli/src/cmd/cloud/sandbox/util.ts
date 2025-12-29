import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Logger } from '@agentuity/core';
import { APIClient, getServiceUrls } from '@agentuity/server';
import type { AuthData } from '../../../types';

export function createSandboxClient(logger: Logger, auth: AuthData, region: string): APIClient {
	const urls = getServiceUrls(region);
	return new APIClient(urls.catalyst, logger, auth.apiKey);
}

/**
 * Parse --file arguments and read file contents.
 *
 * Formats:
 * - <sandbox-path>:<local-path>  - explicit mapping (e.g., script.js:./local/script.js)
 * - <filename>                   - shorthand, uses same name for both (e.g., script.js -> script.js:./script.js)
 *
 * File contents are always base64 encoded for safe binary transmission.
 *
 * @returns Record of sandbox paths to base64-encoded file contents
 */
export function parseFileArgs(fileArgs: string[] | undefined): Record<string, string> {
	if (!fileArgs || fileArgs.length === 0) {
		return {};
	}

	const files: Record<string, string> = {};

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

		const buffer = readFileSync(resolvedPath);
		const base64Content = buffer.toString('base64');
		files[sandboxPath] = base64Content;
	}

	return files;
}
