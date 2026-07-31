/**
 * Shared package-output hygiene for framework adapters.
 *
 * Staging dirs (typically `<project>/.agentuity`) must be wiped before
 * repackaging. `cpSync` merges into an existing tree, so deleted assets,
 * stale `server.js`, or leftover `_serve.js` from a prior build would
 * otherwise ship.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';

/**
 * Delete `outputDir` if present and recreate it empty.
 */
export function resetOutputDir(outputDir: string): void {
	if (existsSync(outputDir)) {
		rmSync(outputDir, { recursive: true, force: true });
	}
	mkdirSync(outputDir, { recursive: true });
}
