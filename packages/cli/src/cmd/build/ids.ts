/**
 * Build-time ID generation utilities.
 *
 * Pure hash functions for generating deterministic IDs.
 * No AST parsing — just SHA1 hashing.
 */

function hashSHA1(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha1');
	val.map((val) => hasher.update(val));
	return hasher.digest().toHex();
}

/**
 * Generate a deterministic deployment ID for devmode.
 */
export function getDevmodeDeploymentId(projectId: string, endpointId: string): string {
	return `devmode_${hashSHA1(projectId, endpointId)}`;
}
