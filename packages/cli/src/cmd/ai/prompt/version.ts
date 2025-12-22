/**
 * Prompt file versioning utilities.
 *
 * Hash format at end of file: <!-- prompt_hash: [hash] -->
 *
 * - hash: SHA256 of file content (excluding the hash line)
 *
 * This allows detecting if the source template has changed.
 */

const HASH_REGEX = /\n?<!-- prompt_hash: ([a-f0-9]+) -->$/;

/**
 * Compute SHA256 hash of content using Bun's built-in hasher.
 */
export function computeHash(content: string): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(content);
	return hasher.digest().toHex();
}

/**
 * Strip the hash comment from content.
 */
export function stripHashComment(content: string): string {
	return content.replace(HASH_REGEX, '');
}

/**
 * Extract hash from file content.
 * Returns null if no hash comment found.
 */
export function extractHash(content: string): string | null {
	const match = content.match(HASH_REGEX);
	return match ? match[1] : null;
}

/**
 * Generate content with hash comment appended.
 */
export function appendHashComment(content: string): string {
	const hash = computeHash(content);
	return `${content}\n<!-- prompt_hash: ${hash} -->`;
}

/**
 * Check if a file needs to be updated based on hash comparison.
 *
 * @param fileContent - Current file content (with hash comment)
 * @param sourceContent - Source template content (without hash comment)
 * @returns true if file needs to be updated (hashes differ)
 */
export function needsUpdate(fileContent: string, sourceContent: string): boolean {
	const fileHash = extractHash(fileContent);
	if (!fileHash) {
		return true;
	}

	const sourceHash = computeHash(sourceContent);
	return fileHash !== sourceHash;
}
