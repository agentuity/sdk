/**
 * Normalize path separators to forward slashes for cross-platform compatibility.
 *
 * On Windows, Node.js path functions (relative, resolve, join) return backslashes.
 * JavaScript import paths, zip entry names, and remote file paths must use forward slashes.
 *
 * @param p - The path to normalize
 * @returns The path with all backslashes replaced by forward slashes
 */
export function toForwardSlash(p: string): string {
	return p.replace(/\\/g, '/');
}
