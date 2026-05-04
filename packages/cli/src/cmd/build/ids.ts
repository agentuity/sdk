/**
 * Build-time ID generation utilities.
 *
 * Pure hash functions for generating deterministic IDs.
 * No AST parsing — just SHA1 hashing.
 */

import { createHash } from 'node:crypto';

function hashSHA1(...val: string[]): string {
	const hasher = createHash('sha1');
	for (const v of val) hasher.update(v);
	return hasher.digest('hex');
}

/**
 * Generate a deterministic deployment ID for devmode.
 */
export function getDevmodeDeploymentId(projectId: string, endpointId: string): string {
	return `devmode_${hashSHA1(projectId, endpointId)}`;
}
